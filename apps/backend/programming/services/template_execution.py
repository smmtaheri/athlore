"""Execute typed template blocks through the shared catalog filters and recipes."""

from copy import copy, deepcopy

from rest_framework.exceptions import ValidationError

from accounts.exercise_metadata import exercise_snapshot, movement_class
from accounts.template_plans import validate_execution_plan
from programming.services.split_parser import TAXONOMY_MUSCLE_GROUPS
from programming.services.techniques import (
    _apply_recipe,
    _recipe_for,
    _selected_configs,
    normalize_training_system_selection,
)


def _error(message):
    raise ValidationError({"execution_plan": [message]})


def _reps(slot):
    text = str(slot["minimum"])
    if slot["maximum"] != slot["minimum"]:
        text += f"–{slot['maximum']}"
    return text + (" ثانیه" if slot["unit"] == "seconds" else "")


def _sync(exercise):
    raw = f"{exercise['sets']}×{exercise['reps']}"
    exercise["raw_prescription"] = raw
    exercise["prescription"] = {
        "sets": exercise["sets"],
        "reps_text": exercise["reps"],
        "raw_prescription": raw,
    }


def build_template_days(
    *,
    coach,
    student,
    template,
    level,
    catalog_by_name,
    structured_catalog_by_name,
    excluded_catalog_by_name,
    pref_by_exercise_id,
    forbidden,
    injury_alternative_map,
):
    from programming.services.training_selection import (
        _filter_candidates,
        _historical_usage_map,
        _pick_for_roles,
        _stable_id,
        available_equipment_tokens,
    )

    plan = validate_execution_plan(
        template.execution_plan, days_per_week=template.days_per_week, coach=coach, level=level
    )
    defaults = plan["defaults"]
    evidence = {
        "structured_catalog_selected": [],
        "structured_catalog_excluded": [],
        "equipment_filters": [],
        "replacements_applied": [],
        "techniques": [],
        "split_resolved": [],
        "execution_plan_version": 1,
    }
    equipment = available_equipment_tokens(student.equipment)
    preferred = {
        p.exercise.name for p in pref_by_exercise_id.values() if p.is_preferred or p.priority > 0
    }
    days = []
    for day_index, spec in enumerate(plan["days"], 1):
        used, system_counts = set(), {}
        day = {
            "id": f"day-{day_index}-{_stable_id(template.id, day_index)}",
            "order": day_index,
            "title": " و ".join(TAXONOMY_MUSCLE_GROUPS.get(key, key) for key in spec["muscles"]),
            "targetMuscles": [TAXONOMY_MUSCLE_GROUPS.get(key, key) for key in spec["muscles"]],
            "notes": "",
            "exercises": [],
        }
        evidence["split_resolved"].append({"title": day["title"], "muscles": day["targetMuscles"]})
        for block_index, block in enumerate(spec["blocks"], 1):
            label = f"جلسهٔ {day_index}، حرکت {block_index}"
            config, recipe = None, None
            if block["system_key"]:
                selections = normalize_training_system_selection(
                    coach, level, [block["system_key"]]
                )
                config = copy(_selected_configs(coach, selections)[0])
                recipe = deepcopy(_recipe_for(config))
                grouping = recipe.get("grouping")
                expected = grouping["size"] if grouping else 1
                if len(block["slots"]) != expected:
                    _error(f"{label}: سیستم «{config.name}» به {expected} حرکت نیاز دارد.")
                if not grouping and block["between_seconds"] is not None:
                    _error(f"{label}: این سیستم استراحت بین حرکت‌ها ندارد.")
                system_counts[config.key] = system_counts.get(config.key, 0) + 1
                if config.max_per_session and system_counts[config.key] > config.max_per_session:
                    _error(f"{label}: سقف استفادهٔ سیستم «{config.name}» در جلسه رعایت نشده است.")
                if grouping:
                    grouping["max_groups_per_session"] = 1
                    if block["rest_seconds"] is not None:
                        grouping["rest_after_seconds"] = block["rest_seconds"]
                    if block["between_seconds"] is not None:
                        grouping["rest_between_seconds"] = block["between_seconds"]
                for step in recipe["steps"]:
                    if step["op"] == "prescribe":
                        if block["sets"] is not None and "sets" in step:
                            step["sets"] = block["sets"]
                        if block["rest_seconds"] is not None and "rest_seconds" in step:
                            step["rest_seconds"] = block["rest_seconds"]
                for prescription in (grouping or {}).get("exercise_prescriptions", []):
                    if block["sets"] is not None and "sets" in prescription:
                        prescription["sets"] = block["sets"]
            exercises = []
            for slot_index, slot in enumerate(block["slots"], 1):
                muscle = TAXONOMY_MUSCLE_GROUPS.get(slot["muscle_key"], slot["muscle_key"])
                pool = []
                for name, exercise in catalog_by_name.items():
                    targets = list(exercise.muscle_targets.all())
                    matching = any(
                        t.role == "primary" and t.muscle.key == slot["muscle_key"] for t in targets
                    )
                    if not targets:
                        matching = exercise.primary_muscle == muscle
                    if matching and (
                        not slot["exercise_id"] or str(exercise.id) == slot["exercise_id"]
                    ):
                        pool.append(name)
                filtered = _filter_candidates(
                    names=pool,
                    forbidden=forbidden,
                    injury_alternative_map=injury_alternative_map,
                    level=level,
                    apply_level=True,
                    catalog_by_name=catalog_by_name,
                    pref_by_exercise_id=pref_by_exercise_id,
                    equipment_tokens=equipment,
                    used=set() if slot["exercise_id"] else used,
                    replacements_applied=evidence["replacements_applied"],
                    excluded_equipment=evidence["equipment_filters"],
                    muscle=muscle,
                    structured_catalog_by_name=structured_catalog_by_name,
                    excluded_reasons=evidence["structured_catalog_excluded"],
                    excluded_catalog_by_name=excluded_catalog_by_name,
                )
                filtered = [name for name in filtered if name in pool]
                if slot["exercise_id"]:
                    filtered = [
                        name
                        for name in filtered
                        if str(catalog_by_name[name].id) == slot["exercise_id"]
                    ]
                if not filtered:
                    _error(
                        f"{label}: حرکت مجاز برای این عضله، سطح و تجهیزات پیدا نشد؛ کاتالوگ یا انتخاب ثابت را بررسی کنید."
                    )
                history = _historical_usage_map(coach, filtered)
                name = _pick_for_roles(
                    filtered,
                    [f"muscle:{slot['muscle_key']}"],
                    muscle,
                    preferred_names=preferred,
                    historical_map=history,
                    metadata_by_name=structured_catalog_by_name,
                )[0]
                used.add(name)
                ref = catalog_by_name[name]
                exercise = {
                    "id": f"{day_index}-{block_index}-{slot_index}-{_stable_id(ref.id)}",
                    "order": 0,
                    "name": name,
                    "display_name": name,
                    "exercise_id": str(ref.id),
                    "targetMuscle": muscle,
                    "sets": block["sets"] or defaults["sets"],
                    "reps": _reps(slot),
                    "rest": f"{block['rest_seconds'] if block['rest_seconds'] is not None else defaults['rest_seconds']} ثانیه",
                    "rpe": f"RIR {defaults['rir']}",
                    "rir": defaults["rir"],
                    "tempo": "",
                    "notes": "",
                    "selection_source": "template_fixed"
                    if slot["exercise_id"]
                    else "coach_structured_catalog",
                    "catalog_source": "coach",
                    "template_block": block_index,
                    "exercise_snapshot": exercise_snapshot(ref),
                    "supersetGroupId": None,
                    "supersetWithPrevious": False,
                }
                exercises.append(exercise)
                evidence["structured_catalog_selected"].append(
                    {
                        "exercise_id": str(ref.id),
                        "name": name,
                        "source": "coach_catalog",
                        "reason": exercise["selection_source"],
                    }
                )
                if recipe and slot["reps_source"] != "system":
                    grouping = recipe.get("grouping")
                    if grouping:
                        exercise["_template_reps_override"] = exercise["reps"]
                    elif recipe["target"] != "last_set":
                        for step in recipe["steps"]:
                            if step["op"] == "prescribe" and "reps" in step:
                                step["reps"] = exercise["reps"]
            if config:
                order = (recipe.get("grouping") or {}).get("exercise_order")
                if order in ("isolation_first", "compound_first"):
                    exercises.sort(
                        key=lambda item: movement_class(item) == "isolation",
                        reverse=order == "isolation_first",
                    )
                grouping = recipe.get("grouping")
                if grouping:
                    prescriptions = grouping.setdefault("exercise_prescriptions", [])
                    while len(prescriptions) < len(exercises):
                        prescriptions.append({})
                    for index, exercise in enumerate(exercises):
                        if "_template_reps_override" in exercise:
                            prescriptions[index]["reps"] = exercise["_template_reps_override"]
                count, applications = _apply_recipe(
                    [{**day, "exercises": exercises}], config, recipe_override=recipe
                )
                if not count:
                    _error(
                        f"{label}: حرکت‌ها برای اجرای «{config.name}» مناسب نیستند؛ ترکیب یا نوع حرکت را تغییر دهید."
                    )
                for application in applications:
                    if application.get("group_id"):
                        application["group_id"] = (
                            f"{day_index}-{block_index}-{application['group_id']}"
                        )
                evidence["techniques"].append(
                    {
                        "key": config.key,
                        "name": config.name,
                        "handler": "recipe",
                        "status": "applied",
                        "applied_count": count,
                        "applications": applications,
                        "recipe": recipe,
                        "source": "template_block",
                    }
                )
            for exercise in exercises:
                exercise.pop("_template_reps_override", None)
                if exercise["rpe"] != f"RIR {defaults['rir']}":
                    exercise.pop("rir", None)
                if exercise.get("supersetGroupId"):
                    exercise["supersetGroupId"] = (
                        f"{day_index}-{block_index}-{exercise['supersetGroupId']}"
                    )
                    if exercise.get("trainingGroupId"):
                        exercise["trainingGroupId"] = exercise["supersetGroupId"]
                    exercise["rest"] = f"{exercise['supersetRestAfterSeconds']} ثانیه بعد از گروه"
                _sync(exercise)
                exercise["order"] = len(day["exercises"]) + 1
                day["exercises"].append(exercise)
        days.append(day)
    return days, evidence
