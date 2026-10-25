"""Strict, versioned execution contract for structured program templates."""

from uuid import UUID

from rest_framework.exceptions import ValidationError


def invalid(message):
    raise ValidationError({"execution_plan": [message]})


def number(value, label, low, high):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        invalid(f"{label}: عدد صحیح بین {low} و {high} لازم است.")
    return value


def fields(value, allowed, label):
    if not isinstance(value, dict) or set(value) - set(allowed):
        invalid(f"{label}: ساختار یا فیلد ناشناخته است.")


def validate_execution_plan(value, *, days_per_week, coach=None, level="intermediate"):
    """Validate references at save and generation; never interpret arbitrary prose."""
    fields(value, ("version", "description", "defaults", "days"), "قالب")
    if isinstance(value.get("version"), bool) or value.get("version") != 1:
        invalid("نسخهٔ ساختار قالب پشتیبانی نمی‌شود.")
    description = value.get("description", "")
    if not isinstance(description, str) or len(description) > 2000:
        invalid("توضیح قالب باید متن کوتاه باشد.")
    defaults = value.get("defaults")
    fields(defaults, ("sets", "minimum", "maximum", "rest_seconds", "rir"), "پیش‌فرض‌ها")
    normalized_defaults = {
        key: number(defaults.get(key), key, low, high)
        for key, low, high in (
            ("sets", 1, 30),
            ("minimum", 1, 300),
            ("maximum", 1, 300),
            ("rest_seconds", 0, 900),
            ("rir", 0, 10),
        )
    }
    if normalized_defaults["minimum"] > normalized_defaults["maximum"]:
        invalid("حداقل تکرار نباید از حداکثر بیشتر باشد.")
    days = value.get("days")
    if not isinstance(days, list) or len(days) != days_per_week:
        invalid("تعداد جلسه‌های قالب باید با تعداد روز تمرین برابر باشد.")
    from accounts.models import Exercise, MuscleTaxonomy

    active_muscles = set(
        MuscleTaxonomy.objects.filter(is_active=True).values_list("key", flat=True)
    )
    normalized_days = []
    for day_index, day in enumerate(days, 1):
        fields(day, ("muscles", "blocks"), f"جلسهٔ {day_index}")
        muscles = day.get("muscles")
        if (
            not isinstance(muscles, list)
            or not muscles
            or not all(isinstance(key, str) for key in muscles)
            or len(muscles) != len(set(muscles))
        ):
            invalid(f"عضلات جلسهٔ {day_index} را بدون تکرار انتخاب کنید.")
        if not all(isinstance(key, str) and key in active_muscles for key in muscles):
            invalid(f"عضلهٔ جلسهٔ {day_index} غیرفعال یا ناشناخته است.")
        blocks = day.get("blocks")
        if not isinstance(blocks, list) or not 1 <= len(blocks) <= 30:
            invalid(f"جلسهٔ {day_index} باید ۱ تا ۳۰ حرکت مستقل یا گروه حرکت داشته باشد.")
        normalized_blocks = []
        for block_index, block in enumerate(blocks, 1):
            label = f"جلسهٔ {day_index}، حرکت {block_index}"
            fields(block, ("system_key", "sets", "rest_seconds", "between_seconds", "slots"), label)
            system_key = block.get("system_key") or None
            if system_key is not None and not isinstance(system_key, str):
                invalid(f"{label}: سیستم تمرینی معتبر نیست.")
            if system_key and coach:
                from programming.services.techniques import (
                    _recipe_for,
                    _selected_configs,
                    normalize_training_system_selection,
                )

                selections = normalize_training_system_selection(coach, level, [system_key])
                recipe = _recipe_for(_selected_configs(coach, selections)[0])
                expected = (recipe.get("grouping") or {}).get("size", 1)
                if not isinstance(block.get("slots"), list) or len(block["slots"]) != expected:
                    invalid(f"{label}: سیستم انتخابی به {expected} حرکت نیاز دارد.")
                if not recipe.get("grouping") and block.get("between_seconds") is not None:
                    invalid(f"{label}: استراحت بین حرکت‌ها برای این سیستم کاربرد ندارد.")
            normalized = {"system_key": system_key}
            for key, low, high in (
                ("sets", 1, 30),
                ("rest_seconds", 0, 900),
                ("between_seconds", 0, 900),
            ):
                item = block.get(key)
                normalized[key] = None if item is None else number(item, key, low, high)
            if not system_key and normalized["between_seconds"] not in (None, 0):
                invalid(f"{label}: استراحت بین حرکت‌ها فقط برای گروه تمرینی است.")
            slots = block.get("slots")
            if (
                not isinstance(slots, list)
                or not 1 <= len(slots) <= 8
                or (not system_key and len(slots) != 1)
            ):
                invalid(f"{label}: حرکت تکی یک جای حرکت دارد؛ گروه حداکثر هشت جای حرکت.")
            normalized_slots = []
            for slot in slots:
                fields(
                    slot,
                    ("muscle_key", "exercise_id", "unit", "minimum", "maximum", "reps_source"),
                    label,
                )
                muscle = slot.get("muscle_key")
                if muscle not in muscles:
                    invalid(f"{label}: عضلهٔ حرکت باید در عضلات همان جلسه باشد.")
                exercise_id = slot.get("exercise_id") or None
                if exercise_id:
                    try:
                        exercise_id = str(UUID(str(exercise_id)))
                    except (ValueError, TypeError, AttributeError):
                        invalid(f"{label}: شناسهٔ حرکت معتبر نیست.")
                    if (
                        coach
                        and not Exercise.objects.filter(
                            id=exercise_id,
                            coach=coach,
                            is_active=True,
                            is_archived=False,
                        ).exists()
                    ):
                        invalid(f"{label}: حرکت فعال متعلق به این مربی پیدا نشد.")
                source = slot.get("reps_source", "default")
                if source not in ("default", "system", "custom") or (
                    source == "system" and not system_key
                ):
                    invalid(f"{label}: برای استفاده از تکرار سیستم، روش اجرای حرکت را انتخاب کنید.")
                unit = slot.get("unit", "reps")
                if unit not in ("reps", "seconds"):
                    invalid(f"{label}: واحد اجرا باید تکرار یا ثانیه باشد.")
                if source != "custom":
                    unit = "reps"
                lo = number(
                    slot.get("minimum") if source == "custom" else normalized_defaults["minimum"],
                    "حداقل اجرا",
                    1,
                    3600 if unit == "seconds" else 300,
                )
                hi = number(
                    slot.get("maximum") if source == "custom" else normalized_defaults["maximum"],
                    "حداکثر اجرا",
                    lo,
                    3600 if unit == "seconds" else 300,
                )
                normalized_slots.append(
                    {
                        "muscle_key": muscle,
                        "exercise_id": exercise_id,
                        "unit": unit,
                        "minimum": lo,
                        "maximum": hi,
                        "reps_source": source,
                    }
                )
            normalized["slots"] = normalized_slots
            normalized_blocks.append(normalized)
        normalized_days.append({"muscles": list(muscles), "blocks": normalized_blocks})
    return {
        "version": 1,
        "description": description.strip(),
        "defaults": normalized_defaults,
        "days": normalized_days,
    }
