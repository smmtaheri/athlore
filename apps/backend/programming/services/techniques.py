"""Structured training-technique handlers used by the deterministic generator."""

from __future__ import annotations

from typing import Any

from rest_framework.exceptions import ValidationError

from accounts.models import CoachProfile, CoachTechnique, TrainingTechnique

PARTIAL_REP_VARIANTS = {
    "one_and_half": "تکرار یک‌ونیم: یک تکرار کامل و یک نیم‌تکرار",
    "after_failure": "پس از رسیدن به ناتوانی فنی، نیم‌تکرار اضافه",
    "partial_only": "اجرای کل ست در دامنهٔ نیمه",
}
SUPPORTED_GENERATION_HANDLERS = {"superset", "drop_set", "partial_reps"}


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
                max_per_session=0,
                parameters={},
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
            if not config.enabled:
                raise ValidationError({"training_systems": [f"System '{key}' is disabled."]})
            if config.allowed_levels and level not in config.allowed_levels:
                raise ValidationError(
                    {"training_systems": [f"System '{key}' is not allowed for this level."]}
                )
        else:
            base = TrainingTechnique.objects.filter(key=key, is_active=True).first()
            handler = base.handler_key if base else ""
        if not base and not config:
            raise ValidationError({"training_systems": [f"Unknown training system: {key}."]})
        if handler and handler not in SUPPORTED_GENERATION_HANDLERS:
            raise ValidationError(
                {"training_systems": [f"System '{key}' has no automatic implementation."]}
            )

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
        if handler == "superset":
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
