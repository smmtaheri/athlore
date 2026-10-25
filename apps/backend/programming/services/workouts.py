"""Idempotent, version-scoped workout progress owned by the authenticated student."""

from copy import deepcopy
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from programming.models import WorkoutSession
from programming.services.programs import programs_for_student
from programming.services.workout_schedule import ensure_workout_schedule


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
        "status": row.status,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        "updated_at": row.updated_at.isoformat(),
    }


def workout_schedule_for_version(version):
    training = deepcopy(version.training or {})
    ensure_workout_schedule(
        training, version.program.date_range_start, version.program.date_range_end
    )
    return training.get("schedule") or {"configured": False, "weeks": []}


def _scheduled_day(version, week, day_id):
    schedule = workout_schedule_for_version(version)
    if not schedule.get("configured"):
        raise ValidationError(
            {"schedule": ["زمان‌بندی این برنامه مشخص نیست؛ مربی باید دورهٔ برنامه را تنظیم کند."]}
        )
    selected_week = next(
        (item for item in schedule.get("weeks", []) if item.get("week") == week), None
    )
    if not selected_week:
        raise ValidationError({"week": ["هفتهٔ تمرین معتبر نیست."]})
    if not any(str(item.get("day_id")) == str(day_id) for item in selected_week.get("sessions", [])):
        raise ValidationError({"day_id": ["این جلسه در زمان‌بندی این هفته وجود ندارد."]})
    day = next(
        (
            item
            for item in (version.training or {}).get("days", [])
            if str(item.get("id")) == str(day_id)
        ),
        None,
    )
    if not day:
        raise ValidationError({"day_id": ["جلسه در این نسخه وجود ندارد."]})
    return day


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
    if isinstance(week, bool) or not isinstance(week, int) or week < 1:
        raise ValidationError({"week": ["هفتهٔ تمرین معتبر نیست."]})
    day = _scheduled_day(version, week, data.get("day_id"))
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

    changed = completed != row.completed_sets or set_logs != row.set_logs
    row.completed_sets = completed
    row.set_logs = set_logs
    update_fields = ["completed_sets", "set_logs", "updated_at"]
    if changed and row.status != WorkoutSession.Status.IN_PROGRESS:
        row.status = WorkoutSession.Status.IN_PROGRESS
        row.finished_at = None
        update_fields.extend(["status", "finished_at"])
    row.save(update_fields=update_fields)
    return serialize_progress(row)


@transaction.atomic
def finish_workout_session(student, program_id, data):
    from students.services import ensure_student_active

    ensure_student_active(student)
    version = workout_version(student, program_id)
    if data.get("version_id") and str(data["version_id"]) != str(version.id):
        raise ValidationError({"version_id": ["نسخهٔ برنامه تغییر کرده؛ صفحه را دوباره باز کنید."]})
    week = data.get("week")
    day_id = data.get("day_id")
    if isinstance(week, bool) or not isinstance(week, int) or week < 1:
        raise ValidationError({"week": ["هفتهٔ تمرین معتبر نیست."]})
    day = _scheduled_day(version, week, day_id)
    row, _ = WorkoutSession.objects.get_or_create(
        student=student, version=version, week=week, day_id=str(day["id"])
    )
    row = WorkoutSession.objects.select_for_update().get(pk=row.pk)
    if row.status in {
        WorkoutSession.Status.COMPLETED,
        WorkoutSession.Status.COMPLETED_PARTIAL,
    }:
        return serialize_progress(row)
    completed = dict(row.completed_sets or {})
    set_logs = dict(row.set_logs or {})
    total_sets = 0

    for exercise in day.get("exercises", []):
        exercise_id = str(exercise.get("id") or "")
        set_count = max(0, int(exercise.get("sets") or 0))
        total_sets += set_count
        if not exercise_id or exercise_id in completed or exercise_id in set_logs:
            continue
        indices = list(range(set_count))
        completed[exercise_id] = indices
        set_logs[exercise_id] = [
            {
                "set_index": index,
                "completed": True,
                "reps": None,
                "weight_kg": None,
                "rest_seconds": None,
            }
            for index in indices
        ]

    completed_count = 0
    for exercise in day.get("exercises", []):
        exercise_id = str(exercise.get("id") or "")
        indices = completed.get(exercise_id, [])
        if isinstance(indices, list):
            completed_count += len(set(indices))
    row.completed_sets = completed
    row.set_logs = set_logs
    row.status = (
        WorkoutSession.Status.COMPLETED
        if completed_count >= total_sets
        else WorkoutSession.Status.COMPLETED_PARTIAL
    )
    row.finished_at = row.finished_at or timezone.now()
    row.save(
        update_fields=["completed_sets", "set_logs", "status", "finished_at", "updated_at"]
    )
    return serialize_progress(row)
