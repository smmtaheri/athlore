"""Idempotent, version-scoped workout progress owned by the authenticated student."""

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
        "updated_at": row.updated_at.isoformat(),
    }


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
    row.completed_sets = {**row.completed_sets, str(exercise["id"]): sorted(set(indices))}
    row.save(update_fields=["completed_sets", "updated_at"])
    return serialize_progress(row)
