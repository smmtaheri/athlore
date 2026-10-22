"""Structured training-technique handlers used by the deterministic generator."""

from __future__ import annotations

import copy
from typing import Any

from rest_framework.exceptions import ValidationError

from accounts.models import CoachProfile, CoachTechnique, TrainingTechnique
from accounts.training_recipes import validate_training_recipe

PARTIAL_REP_VARIANTS = {
    "one_and_half": "تکرار یک‌ونیم: یک تکرار کامل و یک نیم‌تکرار",
    "after_failure": "پس از رسیدن به ناتوانی فنی، نیم‌تکرار اضافه",
    "partial_only": "اجرای کل ست در دامنهٔ نیمه",
}
SUPPORTED_GENERATION_HANDLERS = {"superset", "drop_set", "partial_reps", "recipe"}


def enabled_techniques_for_level(
    coach: CoachProfile,
    level: str,
    allowed_names: set[str] | None = None,
) -> list[CoachTechnique]:
    coach_configs = list(
        CoachTechnique.objects.filter(coach=coach).select_related("base_technique").order_by("name")
    )
    configs = [config for config in coach_configs if config.enabled]
    enabled = [
        config
        for config in configs
        if not config.allowed_levels or level in (config.allowed_levels or [])
    ]
    # A disabled override must also suppress the platform default. Otherwise a
    # coach cannot turn off a public technique for the levels where the platform
    # would otherwise enable it automatically.
    configured_base_ids = {
        config.base_technique_id for config in coach_configs if config.base_technique_id
    }
    normalized_names = {_technique_text(value) for value in (allowed_names or set())}
    for base in TrainingTechnique.objects.filter(is_active=True).order_by("sort_order", "name"):
        if base.id in configured_base_ids:
            continue
        allowed_by_level_default = base.handler_key == "superset" and level == "intermediate"
        allowed_by_rule = (
            _technique_text(base.key) in normalized_names
            or _technique_text(base.name) in normalized_names
        )
        if not (allowed_by_level_default or allowed_by_rule):
            continue
        enabled.append(
            CoachTechnique(
                coach=coach,
                base_technique=base,
                key=base.key,
                name=base.name,
                description=base.description,
                execution_method=base.execution_method,
                allowed_levels=[level],
                max_per_session=2 if base.handler_key == "partial_reps" else 0,
                parameters={},
                recipe={},
                enabled=True,
            )
        )
    return enabled


def _parameters(config: CoachTechnique) -> dict[str, Any]:
    return dict(config.parameters or {})


def _partial_reps_parameters(config: CoachTechnique) -> dict[str, Any]:
    base = config.base_technique
    schema = (base.parameter_schema or {}) if base else {}
    defaults = {
        key: value["default"]
        for key, value in schema.items()
        if isinstance(value, dict) and "default" in value
    }
    defaults.update(_parameters(config))
    defaults.setdefault("variants", list(PARTIAL_REP_VARIANTS))
    defaults.setdefault("after_failure_reps", 3)
    defaults.setdefault("half_range", "coach_defined_per_exercise")
    return defaults


def normalize_training_system_selection(
    coach: CoachProfile, level: str, value: Any
) -> list[dict[str, Any]] | None:
    """Validate coach-selected executable systems and their per-program variants."""
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValidationError({"training_systems": ["Expected a list."]})

    coach_configs = list(
        CoachTechnique.objects.filter(coach=coach).select_related("base_technique").order_by("name")
    )
    config_by_key = {
        (config.base_technique.key if config.base_technique_id else config.key): config
        for config in coach_configs
    }
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(value):
        if isinstance(item, str):
            key, variants = item.strip().lower(), None
        elif isinstance(item, dict):
            key = str(item.get("key") or "").strip().lower()
            variants = item.get("variants")
        else:
            raise ValidationError({"training_systems": [f"Item {index + 1} is invalid."]})
        if not key or key in seen:
            raise ValidationError(
                {"training_systems": ["System keys must be unique and non-empty."]}
            )
        seen.add(key)

        config = config_by_key.get(key)
        if config:
            base = config.base_technique
            handler = base.handler_key if base else ""
            recipe = config.recipe or (base.recipe if base else {})
            if not config.enabled:
                raise ValidationError({"training_systems": [f"System '{key}' is disabled."]})
            if config.allowed_levels and level not in config.allowed_levels:
                raise ValidationError(
                    {"training_systems": [f"System '{key}' is not allowed for this level."]}
                )
        else:
            base = TrainingTechnique.objects.filter(key=key, is_active=True).first()
            handler = base.handler_key if base else ""
            recipe = base.recipe if base else {}
        if not base and not config:
            raise ValidationError({"training_systems": [f"Unknown training system: {key}."]})
        if handler and handler not in SUPPORTED_GENERATION_HANDLERS and not recipe:
            raise ValidationError(
                {"training_systems": [f"System '{key}' has no automatic implementation."]}
            )
        if recipe:
            validate_training_recipe(recipe, allow_empty=False)

        selection: dict[str, Any] = {"key": key}
        if handler == "partial_reps":
            if variants is None:
                variants = _partial_reps_parameters(
                    config
                    or CoachTechnique(
                        coach=coach,
                        base_technique=base,
                        key=key,
                        parameters={},
                    )
                )["variants"]
            if not isinstance(variants, list) or not variants:
                raise ValidationError(
                    {"training_systems": ["Select at least one partial-rep mode."]}
                )
            allowed_variants = set(
                _partial_reps_parameters(
                    config
                    or CoachTechnique(
                        coach=coach,
                        base_technique=base,
                        key=key,
                        parameters={},
                    )
                ).get("variants")
                or PARTIAL_REP_VARIANTS
            )
            selected_variants = list(dict.fromkeys(str(variant) for variant in variants))
            if not set(selected_variants).issubset(allowed_variants):
                raise ValidationError(
                    {"training_systems": [f"Invalid modes selected for '{key}'."]}
                )
            selection["variants"] = selected_variants
        elif variants not in (None, []):
            raise ValidationError({"training_systems": [f"System '{key}' does not have modes."]})
        normalized.append(selection)
    return normalized


def _selected_configs(
    coach: CoachProfile, selections: list[dict[str, Any]]
) -> list[CoachTechnique]:
    config_by_key = {
        (config.base_technique.key if config.base_technique_id else config.key): config
        for config in CoachTechnique.objects.filter(coach=coach).select_related("base_technique")
    }
    configs: list[CoachTechnique] = []
    for selection in selections:
        key = selection["key"]
        config = config_by_key.get(key)
        if config is None:
            base = TrainingTechnique.objects.get(key=key, is_active=True)
            config = CoachTechnique(
                coach=coach,
                base_technique=base,
                key=key,
                name=base.name,
                description=base.description,
                execution_method=base.execution_method,
                max_per_session=2 if base.handler_key == "partial_reps" else 0,
                parameters={},
                enabled=True,
            )
            config._platform_default = True
        config._selected_variants = selection.get("variants")
        configs.append(config)
    return configs


def _superset_parameters(config: CoachTechnique) -> dict[str, Any]:
    params = {
        "pairing_mode": "same_muscle_isolation",
        "max_pairs": config.max_per_session or 1,
        "allow_compound": False,
        "rest_between_exercises_seconds": 0,
        "rest_after_pair_seconds": 90,
    }
    params.update(_parameters(config))
    if "pairing" in params and "pairing_mode" not in config.parameters:
        params["pairing_mode"] = params["pairing"]
    return params


def _technique_text(value: str) -> str:
    return str(value or "").replace("‌", " ").strip().lower()


def _append_technique(exercise: dict, payload: dict) -> None:
    techniques = exercise.setdefault("techniques", [])
    techniques.append(payload)


def _apply_superset(days: list[dict], config: CoachTechnique) -> int:
    from programming.services.training_selection import _apply_real_supersets

    params = _superset_parameters(config)
    max_pairs = int(params.get("max_pairs") or config.max_per_session or 1)
    applied = 0
    for day in days:
        before = sum(1 for exercise in day.get("exercises", []) if exercise.get("supersetGroupId"))
        _apply_real_supersets(
            day.get("exercises", []),
            allow=True,
            max_pairs=max_pairs,
            pairing_mode=str(params.get("pairing_mode") or "same_muscle_isolation"),
            allow_compound=bool(params.get("allow_compound")),
            rest_between_exercises_seconds=int(params.get("rest_between_exercises_seconds") or 0),
            rest_after_pair_seconds=int(params.get("rest_after_pair_seconds") or 0),
        )
        for exercise in day.get("exercises", []):
            if exercise.get("supersetGroupId"):
                _append_technique(
                    exercise,
                    {
                        "key": config.key,
                        "name": config.name,
                        "handler": "superset",
                        "config_id": str(config.id) if config.id else None,
                        "parameters": params,
                    },
                )
        after = sum(1 for exercise in day.get("exercises", []) if exercise.get("supersetGroupId"))
        applied += max(0, (after - before) // 2)
    return applied


def _apply_drop_set(days: list[dict], config: CoachTechnique) -> int:
    params = _parameters(config)
    drops = max(1, min(3, int(params.get("drops") or 1)))
    reduction_percent = max(1, min(80, int(params.get("reduction_percent") or 20)))
    limit = config.max_per_session
    applied = 0
    for day in days:
        day_applied = 0
        for exercise in reversed(day.get("exercises", [])):
            if limit and day_applied >= limit:
                break
            if exercise.get("supersetGroupId") or exercise.get("techniques"):
                continue
            if int(exercise.get("sets") or 0) < 1:
                continue
            payload = {
                "key": config.key,
                "name": config.name,
                "handler": "drop_set",
                "config_id": str(config.id) if config.id else None,
                "parameters": {"drops": drops, "reduction_percent": reduction_percent},
            }
            _append_technique(exercise, payload)
            exercise["dropSet"] = payload["parameters"]
            exercise["raw_prescription"] = (
                f"{exercise.get('raw_prescription') or ''} + {drops} دراپ‌ست با کاهش "
                f"{reduction_percent}%"
            ).strip()
            exercise.setdefault("notes", "")
            exercise["notes"] = (
                f"{exercise['notes']} {config.name}: {drops} دراپ‌ست با کاهش {reduction_percent}%".strip()
            )
            applied += 1
            day_applied += 1
            if limit and day_applied >= limit:
                break
    return applied


def _apply_partial_reps(days: list[dict], config: CoachTechnique) -> tuple[int, list[dict]]:
    params = _partial_reps_parameters(config)
    variants = list(getattr(config, "_selected_variants", None) or params["variants"])
    try:
        after_failure_reps = max(1, min(10, int(params.get("after_failure_reps") or 3)))
    except (TypeError, ValueError):
        after_failure_reps = 3
    try:
        limit = int(config.max_per_session or 0) or 2
    except (TypeError, ValueError):
        limit = 2

    applications: list[dict] = []
    for day in days:
        eligible = [
            exercise
            for exercise in day.get("exercises", [])
            if str(exercise.get("targetMuscle") or "") != "شکم"
            and not exercise.get("supersetGroupId")
            and not exercise.get("dropSet")
            and not any(
                item.get("handler") == "partial_reps" for item in exercise.get("techniques", [])
            )
        ]
        for exercise in reversed(eligible[:]):
            if sum(1 for item in applications if item.get("day_id") == day.get("id")) >= limit:
                break
            variant_index = len(applications) % len(variants)
            variant = variants[variant_index]
            detail = PARTIAL_REP_VARIANTS[variant]
            if variant == "after_failure":
                detail = f"پس از ناتوانی فنی، {after_failure_reps} نیم‌تکرار اضافه"
            elif variant == "one_and_half":
                detail += "؛ جهت نیم‌تکرار باید برای این حرکت بازبینی شود"
            else:
                detail += "؛ بخش دامنه باید برای این حرکت بازبینی شود"

            payload = {
                "key": config.key,
                "name": config.name,
                "handler": "partial_reps",
                "config_id": (
                    None if getattr(config, "_platform_default", False) else str(config.id)
                ),
                "variant": variant,
                "parameters": {
                    "variant": variant,
                    "after_failure_reps": after_failure_reps,
                    "half_range": "coach_defined_per_exercise",
                },
            }
            _append_technique(exercise, payload)
            exercise["partialReps"] = payload["parameters"]
            exercise["raw_prescription"] = (
                f"{exercise.get('raw_prescription') or ''}؛ {detail}".strip("؛ ")
            )
            exercise["notes"] = f"{exercise.get('notes') or ''} {config.name}: {detail}".strip()
            applications.append(
                {
                    "day_id": day.get("id"),
                    "exercise_id": exercise.get("id"),
                    "exercise_name": exercise.get("name"),
                    "variant": variant,
                    "detail": detail,
                }
            )
    return len(applications), applications


def _apply_manual_system(days: list[dict], config: CoachTechnique) -> int:
    instruction = str(config.execution_method or config.description or "").strip()
    if not instruction:
        instruction = "روش اجرا ثبت نشده است؛ مربی پیش از ارسال برنامه باید آن را مشخص کند."
    note = f"سیستم تمرینی {config.name}: {instruction} (بازبینی مربی)"
    for day in days:
        existing = str(day.get("notes") or "").strip()
        if note not in existing:
            day["notes"] = f"{existing} {note}".strip()
    return len(days)


def _recipe_for(config: CoachTechnique) -> dict[str, Any]:
    base = config.base_technique
    recipe = validate_training_recipe(
        config.recipe or (base.recipe if base else {}), allow_empty=False
    )
    if base and base.handler_key == "superset" and config.parameters:
        grouping = recipe.setdefault("grouping", {})
        params = _superset_parameters(config)
        grouping.update(
            {
                "mode": params["pairing_mode"],
                "max_groups_per_session": params["max_pairs"],
                "allow_compound": params["allow_compound"],
                "rest_between_seconds": params["rest_between_exercises_seconds"],
                "rest_after_seconds": params["rest_after_pair_seconds"],
            }
        )
    if base and base.handler_key == "drop_set" and config.parameters:
        for step in _walk_recipe_steps(recipe["steps"]):
            if step["op"] == "repeat":
                step["count"] = int(config.parameters.get("drops", step["count"]))
            if step["op"] == "load_change" and step["direction"] == "down":
                step["percent"] = int(config.parameters.get("reduction_percent", step["percent"]))
    if base and base.handler_key == "partial_reps":
        partial = next((step for step in recipe["steps"] if step["op"] == "partial_range"), None)
        if partial:
            partial["count"] = int(
                _partial_reps_parameters(config).get("after_failure_reps", partial.get("count", 3))
            )
    return recipe


def _walk_recipe_steps(steps: list[dict[str, Any]]):
    for step in steps:
        yield step
        if step["op"] == "repeat":
            yield from _walk_recipe_steps(step["steps"])


def _recipe_instructions(steps: list[dict[str, Any]]) -> list[str]:
    instructions: list[str] = []
    for step in steps:
        operation = step["op"]
        if operation == "prescribe":
            values = []
            if "sets" in step:
                values.append(f"{step['sets']} ست")
            if "reps" in step:
                values.append(f"{step['reps']} تکرار")
            if "rest_seconds" in step:
                values.append(f"استراحت {step['rest_seconds']} ثانیه")
            if step.get("rpe"):
                values.append(f"شدت {step['rpe']}")
            if values:
                instructions.append("، ".join(values))
        elif operation == "rest":
            instructions.append(f"{step['seconds']} ثانیه استراحت")
        elif operation == "load_change":
            direction = "افزایش" if step["direction"] == "up" else "کاهش"
            instructions.append(f"{direction} بار به میزان {step['percent']}٪")
        elif operation == "partial_range":
            labels = {
                "one_and_half": "تکرار یک‌ونیم",
                "after_failure": "نیم‌تکرار پس از ناتوانی فنی",
                "partial_only": "اجرای تکرارها در دامنهٔ نیمه",
            }
            detail = labels[step["mode"]]
            if step.get("count"):
                detail += f" ({step['count']} تکرار)"
            if step.get("range"):
                detail += f"؛ دامنه: {step['range']}"
            instructions.append(detail)
        elif operation == "tempo":
            detail = f"تمپو {step['pattern']}"
            if step.get("hold_seconds"):
                detail += f"؛ مکث {step['hold_seconds']} ثانیه"
            instructions.append(detail)
        elif operation == "instruction":
            instructions.append(f"{step['title']}: {step['text']}")
        elif operation == "repeat":
            nested = "، ".join(_recipe_instructions(step["steps"]))
            instructions.append(f"{step['count']} دور: {nested}")
    return instructions


def _apply_recipe_prescriptions(exercise: dict, steps: list[dict[str, Any]]) -> None:
    for step in steps:
        if step["op"] == "prescribe":
            if "sets" in step:
                exercise["sets"] = step["sets"]
            if "reps" in step:
                exercise["reps"] = step["reps"]
            if "rest_seconds" in step:
                exercise["rest"] = f"{step['rest_seconds']} ثانیه"
            if "rpe" in step:
                exercise["rpe"] = step["rpe"]
        elif step["op"] == "repeat":
            for _ in range(step["count"]):
                _apply_recipe_prescriptions(exercise, step["steps"])


def _apply_recipe_grouping(
    days: list[dict], config: CoachTechnique, grouping: dict[str, Any]
) -> tuple[int, list[tuple[dict, list[dict]]]]:
    from programming.services.training_selection import _movement_class, _superset_pair_allowed

    size = grouping["size"]
    mode = grouping["mode"]
    max_groups = grouping["max_groups_per_session"]
    if config.max_per_session:
        max_groups = min(max_groups, config.max_per_session)
    applications: list[tuple[dict, list[dict]]] = []
    for day in days:
        exercises = [
            exercise
            for exercise in day.get("exercises", [])
            if not exercise.get("supersetGroupId") and not exercise.get("trainingGroupId")
        ]
        order = grouping.get("exercise_order", "generated")
        if order in {"isolation_first", "compound_first"}:
            reverse = order == "isolation_first"
            exercises.sort(
                key=lambda exercise: (
                    _movement_class(
                        str(exercise.get("name") or ""),
                        str(exercise.get("targetMuscle") or ""),
                    )
                    == "isolation"
                ),
                reverse=reverse,
            )
        day_groups = 0
        index = 0
        while index <= len(exercises) - size and day_groups < max_groups:
            group = exercises[index : index + size]
            allowed = True
            for pair_index in range(len(group) - 1):
                first, second = group[pair_index], group[pair_index + 1]
                if mode == "alternating":
                    allowed = bool(first.get("targetMuscle")) and (
                        first.get("targetMuscle") != second.get("targetMuscle")
                    )
                else:
                    allowed = _superset_pair_allowed(
                        first,
                        second,
                        pairing_mode=mode,
                        allow_compound=bool(grouping.get("allow_compound")),
                    )
                if not allowed:
                    break
            if not allowed:
                index += 1
                continue

            group_id = f"ts-{config.key}-{day_groups + 1}-{index + 1}"
            group_name = config.name
            for group_index, exercise in enumerate(group):
                exercise["trainingGroupId"] = group_id
                exercise["trainingGroupName"] = group_name
                exercise["trainingGroupSize"] = size
                exercise["supersetGroupId"] = group_id
                exercise["supersetWithPrevious"] = group_index > 0
                exercise["supersetPartnerName"] = (
                    group[group_index + 1]["name"] if group_index + 1 < size else None
                )
                exercise["supersetRestBetweenSeconds"] = grouping["rest_between_seconds"]
                exercise["supersetRestAfterSeconds"] = grouping["rest_after_seconds"]
            applications.append((day, group))
            day_groups += 1
            index += size
    return len(applications), applications


def _apply_recipe(days: list[dict], config: CoachTechnique) -> tuple[int, list[dict]]:
    recipe = _recipe_for(config)
    grouping = recipe.get("grouping")
    group_count, groups = _apply_recipe_grouping(days, config, grouping) if grouping else (0, [])
    applications: list[dict] = []
    max_per_session = config.max_per_session
    target = recipe["target"]
    note_prefix = f"{config.name}: "

    group_by_day: dict[int, list[dict]] = {}
    for day, group in groups:
        group_by_day.setdefault(id(day), []).extend(group)
    for day in days:
        if grouping:
            candidates = list(group_by_day.get(id(day), []))
        else:
            candidates = [
                exercise
                for exercise in day.get("exercises", [])
                if not exercise.get("supersetGroupId")
                and not exercise.get("dropSet")
                and not any(
                    item.get("key") == config.key for item in exercise.get("techniques", [])
                )
            ]
            if target == "last_isolation":
                from programming.services.training_selection import _movement_class

                candidates = [
                    exercise
                    for exercise in candidates
                    if _movement_class(
                        str(exercise.get("name") or ""),
                        str(exercise.get("targetMuscle") or ""),
                    )
                    == "isolation"
                ]
            if target in {"last_exercise", "last_isolation", "last_set"}:
                candidates = candidates[-1:]
            if max_per_session:
                candidates = candidates[-max_per_session:]

        group = group_by_day.get(id(day), [])
        group_prescriptions = (grouping or {}).get("exercise_prescriptions", [])
        selected_variants = getattr(config, "_selected_variants", None) or []
        for candidate_index, exercise in enumerate(candidates):
            exercise_recipe = copy.deepcopy(recipe)
            base = config.base_technique
            if base and base.handler_key == "partial_reps" and selected_variants:
                partial = next(
                    (step for step in exercise_recipe["steps"] if step["op"] == "partial_range"),
                    None,
                )
                if partial:
                    partial["mode"] = selected_variants[candidate_index % len(selected_variants)]
                    partial["count"] = int(
                        _partial_reps_parameters(config).get("after_failure_reps", 3)
                    )
            steps = exercise_recipe["steps"]
            instructions = _recipe_instructions(steps)
            if grouping and group_prescriptions and target != "last_set":
                prescription = group_prescriptions[candidate_index % len(group_prescriptions)]
                if prescription:
                    _apply_recipe_prescriptions(exercise, [{"op": "prescribe", **prescription}])
            if target != "last_set":
                _apply_recipe_prescriptions(exercise, steps)
            detail = "؛ ".join(instructions)
            if target == "last_set":
                detail = f"فقط در ست پایانی: {detail}"
            if detail:
                note = f"{note_prefix}{detail}"
                existing = str(exercise.get("notes") or "").strip()
                if note not in existing:
                    exercise["notes"] = f"{existing} {note}".strip()
            payload = {
                "key": config.key,
                "name": config.name,
                "handler": (
                    config.base_technique.handler_key if config.base_technique else "recipe"
                )
                or "recipe",
                "config_id": str(config.id) if config.id else None,
                "parameters": _parameters(config),
                "recipe": exercise_recipe,
            }
            _append_technique(exercise, payload)
            if config.key == "drop_set":
                reduction = next(
                    (
                        step["percent"]
                        for step in _walk_recipe_steps(recipe["steps"])
                        if step["op"] == "load_change" and step["direction"] == "down"
                    ),
                    20,
                )
                drops = next(
                    (
                        step["count"]
                        for step in _walk_recipe_steps(recipe["steps"])
                        if step["op"] == "repeat"
                    ),
                    1,
                )
                exercise["dropSet"] = {"drops": drops, "reduction_percent": reduction}
            if config.key == "partial_reps":
                partial = next(
                    (step for step in exercise_recipe["steps"] if step["op"] == "partial_range"),
                    None,
                )
                if partial:
                    exercise["partialReps"] = {
                        "variant": partial["mode"],
                        "after_failure_reps": partial.get("count", 3),
                        "half_range": partial.get("range", "coach_defined_per_exercise"),
                    }
            applications.append(
                {
                    "day_id": day.get("id"),
                    "exercise_id": exercise.get("id"),
                    "exercise_name": exercise.get("name"),
                    "group_id": exercise.get("trainingGroupId"),
                    **(
                        {"variant": exercise["partialReps"]["variant"]}
                        if exercise.get("partialReps")
                        else {}
                    ),
                }
            )
    return group_count if grouping else len(applications), applications


def apply_structured_techniques(
    days: list[dict],
    coach: CoachProfile,
    level: str,
    allowed_names: set[str] | None = None,
    selected_systems: list[dict[str, Any]] | None = None,
) -> tuple[list[dict], list[dict], set[str]]:
    """Apply known handlers and report custom techniques without pretending to execute them."""

    evidence: list[dict] = []
    handled_keys: set[str] = set()
    if selected_systems is None:
        configurations = enabled_techniques_for_level(coach, level, allowed_names=allowed_names)
    else:
        normalized = normalize_training_system_selection(coach, level, selected_systems)
        configurations = _selected_configs(coach, normalized or [])
        configurations.sort(
            key=lambda config: {
                "superset": 0,
                "drop_set": 1,
                "partial_reps": 2,
            }.get(config.base_technique.handler_key if config.base_technique else "", 3)
        )

    for config in configurations:
        base = config.base_technique
        handler = base.handler_key if base else ""
        parameters = _parameters(config)
        recipe = config.recipe or (base.recipe if base else {})
        if recipe:
            count, applications = _apply_recipe(days, config)
            handled_keys.add(config.key)
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": handler or "recipe",
                    "config_id": (
                        None if getattr(config, "_platform_default", False) else str(config.id)
                    ),
                    "source": "platform_default"
                    if getattr(config, "_platform_default", False)
                    else "coach",
                    "parameters": parameters,
                    "recipe": _recipe_for(config),
                    "applied_count": count,
                    "applications": applications,
                    "status": "applied" if count else "no_eligible_exercise",
                }
            )
        elif handler == "superset":
            count = _apply_superset(days, config)
            handled_keys.add(config.key)
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": handler,
                    "config_id": (
                        None if getattr(config, "_platform_default", False) else str(config.id)
                    ),
                    "source": "platform_default"
                    if getattr(config, "_platform_default", False)
                    else "coach",
                    "parameters": parameters,
                    "applied_count": count,
                    "status": "applied" if count else "no_eligible_pair",
                }
            )
        elif handler == "drop_set":
            count = _apply_drop_set(days, config)
            handled_keys.add(config.key)
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": handler,
                    "config_id": (
                        None if getattr(config, "_platform_default", False) else str(config.id)
                    ),
                    "source": "platform_default"
                    if getattr(config, "_platform_default", False)
                    else "coach",
                    "parameters": parameters,
                    "applied_count": count,
                    "status": "applied" if count else "no_eligible_exercise",
                }
            )
        elif handler == "partial_reps":
            count, applications = _apply_partial_reps(days, config)
            handled_keys.add(config.key)
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": handler,
                    "config_id": (
                        None if getattr(config, "_platform_default", False) else str(config.id)
                    ),
                    "source": "platform_default"
                    if getattr(config, "_platform_default", False)
                    else "coach",
                    "parameters": {
                        **_partial_reps_parameters(config),
                        "selected_variants": list(
                            getattr(config, "_selected_variants", None)
                            or _partial_reps_parameters(config)["variants"]
                        ),
                    },
                    "applied_count": count,
                    "applications": applications,
                    "status": "applied" if count else "no_eligible_exercise",
                }
            )
        else:
            applied_count = (
                _apply_manual_system(days, config) if selected_systems is not None else 0
            )
            handled_keys.add(config.key)
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": None,
                    "config_id": str(config.id) if config.id else None,
                    "source": (
                        "platform_default"
                        if getattr(config, "_platform_default", False)
                        else "coach"
                        if config.id
                        else "platform_default"
                    ),
                    "parameters": parameters,
                    "applied_count": applied_count,
                    "status": "coach_review_required" if applied_count else "saved_manual_only",
                }
            )
    return days, evidence, handled_keys
