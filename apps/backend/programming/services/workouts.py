"""Idempotent, version-scoped workout progress owned by the authenticated student."""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

from programming.models import WorkoutSession
from programming.services.programs import programs_for_student


def workout_version(student, program_id):
    program = programs_for_student(student).filter(pk=program_id).first()
    if not program or not program.active_version_id:
        raise NotFound()
    version = program.active_version
    methods = (version.pdf_settings or {}).get("deliverySections") or {}
    if (
        methods.get(
            "workout", "generated" if version.delivery_source == "generated" else "uploaded"
        )
        != "generated"
        or not version.training
    ):
        raise ValidationError({"workout": ["این برنامه فقط فایل تمرینی دارد."]})
    return version


def serialize_progress(row):
    return {
        "week": row.week,
        "day_id": row.day_id,
        "completed_sets": row.completed_sets,
        "set_logs": row.set_logs,
        "updated_at": row.updated_at.isoformat(),
    }


def _normalize_set_logs(raw_logs, completed_indices, exercise):
    if not isinstance(raw_logs, list):
        raise ValidationError({"set_logs": ["اطلاعات ست‌ها معتبر نیست."]})

    normalized = []
    seen_indices = set()
    set_count = int(exercise.get("sets") or 0)
    for raw in raw_logs:
        if not isinstance(raw, dict):
            raise ValidationError({"set_logs": ["هر ست باید یک ساختار معتبر داشته باشد."]})
        set_index = raw.get("set_index")
        if (
            isinstance(set_index, bool)
            or not isinstance(set_index, int)
            or not 0 <= set_index < set_count
            or set_index in seen_indices
        ):
            raise ValidationError({"set_logs": ["شمارهٔ ست معتبر نیست یا تکراری است."]})
        seen_indices.add(set_index)

        completed = raw.get("completed")
        if not isinstance(completed, bool):
            raise ValidationError({"set_logs": ["وضعیت انجام ست معتبر نیست."]})

        reps = raw.get("reps")
        if reps is not None and (
            isinstance(reps, bool) or not isinstance(reps, int) or not 0 <= reps <= 1000
        ):
            raise ValidationError({"set_logs": ["تعداد تکرار باید عددی بین صفر تا ۱۰۰۰ باشد."]})

        raw_weight = raw.get("weight_kg")
        weight = None
        if raw_weight not in (None, ""):
            if isinstance(raw_weight, bool):
                raise ValidationError({"set_logs": ["وزنهٔ ثبت‌شده معتبر نیست."]})
            try:
                decimal_weight = Decimal(str(raw_weight))
            except (InvalidOperation, ValueError):
                raise ValidationError({"set_logs": ["وزنهٔ ثبت‌شده معتبر نیست."]}) from None
            if (
                not decimal_weight.is_finite()
                or decimal_weight < 0
                or decimal_weight > 1000
                or decimal_weight != decimal_weight.quantize(Decimal("0.01"))
            ):
                raise ValidationError(
                    {"set_logs": ["وزنه باید بین صفر تا ۱۰۰۰ کیلو و حداکثر با دو رقم اعشار باشد."]}
                )
            weight = float(decimal_weight)

        rest_seconds = raw.get("rest_seconds")
        if rest_seconds is not None and (
            isinstance(rest_seconds, bool)
            or not isinstance(rest_seconds, int)
            or not 0 <= rest_seconds <= 7200
        ):
            raise ValidationError({"set_logs": ["زمان استراحت باید بین صفر تا ۷۲۰۰ ثانیه باشد."]})

        normalized.append(
            {
                "set_index": set_index,
                "completed": completed,
                "reps": reps,
                "weight_kg": weight,
                "rest_seconds": rest_seconds,
            }
        )

    logged_completed = {item["set_index"] for item in normalized if item["completed"]}
    if logged_completed != set(completed_indices):
        raise ValidationError({"set_logs": ["وضعیت ست‌ها با فهرست ست‌های انجام‌شده هم‌خوانی ندارد."]})
    return sorted(normalized, key=lambda item: item["set_index"])


@transaction.atomic
def save_progress(student, program_id, data):
    from students.services import ensure_student_active

    ensure_student_active(student)
    version = workout_version(student, program_id)
    if data.get("version_id") and str(data["version_id"]) != str(version.id):
        raise ValidationError({"version_id": ["نسخهٔ برنامه تغییر کرده؛ صفحه را دوباره باز کنید."]})
    week = data.get("week")
    max_weeks = (
        max(1, ((version.program.date_range_end - version.program.date_range_start).days + 7) // 7)
        if version.program.date_range_start and version.program.date_range_end
        else 4
    )
    if isinstance(week, bool) or not isinstance(week, int) or not 1 <= week <= max_weeks:
        raise ValidationError({"week": ["هفتهٔ تمرین معتبر نیست."]})
    day = next(
        (
            day
            for day in version.training.get("days", [])
            if str(day.get("id")) == str(data.get("day_id"))
        ),
        None,
    )
    if not day:
        raise ValidationError({"day_id": ["جلسه در این نسخه وجود ندارد."]})
    exercise = next(
        (
            item
            for item in day.get("exercises", [])
            if str(item.get("id")) == str(data.get("exercise_id"))
        ),
        None,
    )
    indices = data.get("completed_sets")
    if (
        not exercise
        or not isinstance(indices, list)
        or any(
            isinstance(i, bool)
            or not isinstance(i, int)
            or not 0 <= i < int(exercise.get("sets") or 0)
            for i in indices
        )
    ):
        raise ValidationError({"completed_sets": ["ست‌های ثبت‌شده با برنامه هم‌خوانی ندارند."]})
    row, _ = WorkoutSession.objects.get_or_create(
        student=student, version=version, week=week, day_id=str(day["id"])
    )
    row = WorkoutSession.objects.select_for_update().get(pk=row.pk)
    exercise_id = str(exercise["id"])
    completed = {**row.completed_sets, exercise_id: sorted(set(indices))}
    set_logs = dict(row.set_logs or {})
    if "set_logs" in data:
        set_logs[exercise_id] = _normalize_set_logs(data["set_logs"], indices, exercise)
    else:
        existing = {item["set_index"]: item for item in set_logs.get(exercise_id, [])}
        for set_index in indices:
            existing.setdefault(
                set_index,
                {
                    "set_index": set_index,
                    "completed": True,
                    "reps": None,
                    "weight_kg": None,
                    "rest_seconds": None,
                },
            )
        for set_index, item in existing.items():
            item["completed"] = set_index in indices
        set_logs[exercise_id] = sorted(existing.values(), key=lambda item: item["set_index"])

    row.completed_sets = completed
    row.set_logs = set_logs
    row.save(update_fields=["completed_sets", "set_logs", "updated_at"])
    return serialize_progress(row)
