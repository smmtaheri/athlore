"""Body Check business logic — independent from Visit lifecycle."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from math import atan2, cos, pi, sin
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from common.permissions import get_owned_object
from students.body_check_models import BodyCheckCycle, BodyCheckDailyEntry, BodyCheckProgressPhoto
from students.models import Student

TEHRAN_TZ = ZoneInfo("Asia/Tehran")
CYCLE_LENGTH_DAYS = BodyCheckCycle.CYCLE_LENGTH_DAYS


def local_today(*, now=None) -> date:
    """Calendar date in Asia/Tehran (product local day for Body Check)."""
    instant = now or timezone.now()
    if timezone.is_naive(instant):
        instant = timezone.make_aware(instant, timezone=timezone.utc)
    return instant.astimezone(TEHRAN_TZ).date()


def suggest_daily_targets_kg(
    starting_weight_kg: Decimal | float,
    goal_weight_kg: Decimal | float,
    *,
    days: int = CYCLE_LENGTH_DAYS,
) -> list[float]:
    """Deterministic linear targets from start → goal (system suggestion, not AI)."""
    if days < 1:
        raise ValidationError({"days": ["Cycle length must be at least 1."]})
    start = Decimal(str(starting_weight_kg))
    goal = Decimal(str(goal_weight_kg))
    if days == 1:
        return [float(round(goal, 1))]
    out: list[float] = []
    for i in range(days):
        value = start + (goal - start) * Decimal(i) / Decimal(days - 1)
        out.append(float(round(value, 1)))
    return out


def compute_sleep_duration_minutes(sleep_start: time | None, wake: time | None) -> int | None:
    if sleep_start is None or wake is None:
        return None
    start_dt = datetime.combine(date(2000, 1, 1), sleep_start)
    end_dt = datetime.combine(date(2000, 1, 1), wake)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return int((end_dt - start_dt).total_seconds() // 60)


def average_clock_time(values: list[time]) -> str | None:
    """Return a circular mean clock time, so 23:30 + 00:30 averages to midnight."""
    if not values:
        return None
    angles = [
        2 * pi * ((value.hour * 60 + value.minute) / (24 * 60))
        for value in values
    ]
    angle = atan2(sum(sin(value) for value in angles), sum(cos(value) for value in angles))
    if angle < 0:
        angle += 2 * pi
    minutes = int(round(angle * (24 * 60) / (2 * pi))) % (24 * 60)
    return time(hour=minutes // 60, minute=minutes % 60).isoformat()


def day_number_for(cycle: BodyCheckCycle, local_date: date) -> int:
    return (local_date - cycle.start_date).days + 1


def week_number_for_day(day_number: int) -> int:
    """V1 assumption: weeks 1–3 are 7 days; week 4 is days 22–30."""
    if day_number < 1 or day_number > CYCLE_LENGTH_DAYS:
        raise ValidationError({"local_date": ["Date is outside the Body Check cycle."]})
    if day_number <= 7:
        return 1
    if day_number <= 14:
        return 2
    if day_number <= 21:
        return 3
    return 4


def target_for_day(cycle: BodyCheckCycle, day_number: int) -> Decimal | None:
    targets = cycle.daily_targets_kg or []
    idx = day_number - 1
    if idx < 0 or idx >= len(targets):
        return None
    raw = targets[idx]
    if raw is None:
        return None
    return Decimal(str(raw))


def cycles_for_coach_student(coach, student: Student):
    return BodyCheckCycle.objects.filter(coach=coach, student=student)


def get_cycle_for_coach(coach, student: Student, cycle_id) -> BodyCheckCycle:
    try:
        return BodyCheckCycle.objects.get(coach=coach, student=student, pk=cycle_id)
    except BodyCheckCycle.DoesNotExist as exc:
        raise NotFound(detail="Body Check cycle not found.") from exc


def get_cycle_for_student(student: Student, cycle_id) -> BodyCheckCycle:
    try:
        return BodyCheckCycle.objects.get(student=student, pk=cycle_id)
    except BodyCheckCycle.DoesNotExist as exc:
        raise NotFound(detail="Body Check cycle not found.") from exc


def active_cycle_for_student(student: Student) -> BodyCheckCycle | None:
    return (
        BodyCheckCycle.objects.filter(student=student, status=BodyCheckCycle.Status.ACTIVE)
        .order_by("-start_date", "-created_at")
        .first()
    )


def active_cycle_for_coach_student(coach, student: Student) -> BodyCheckCycle | None:
    return (
        BodyCheckCycle.objects.filter(
            coach=coach, student=student, status=BodyCheckCycle.Status.ACTIVE
        )
        .order_by("-start_date", "-created_at")
        .first()
    )


@transaction.atomic
def create_cycle(
    coach,
    student: Student,
    *,
    start_date: date,
    starting_weight_kg: Decimal,
    goal_weight_kg: Decimal,
    meal_detail_enabled: bool = False,
    daily_targets_kg: list | None = None,
) -> BodyCheckCycle:
    get_owned_object(Student.objects.all(), coach=coach, pk=student.id)
    if BodyCheckCycle.objects.filter(
        student=student, status=BodyCheckCycle.Status.ACTIVE
    ).exists():
        raise ValidationError(
            {"status": ["This student already has an active Body Check cycle."]},
            code="active_cycle_exists",
        )
    end_date = start_date + timedelta(days=CYCLE_LENGTH_DAYS - 1)
    targets = daily_targets_kg
    if targets is None:
        targets = suggest_daily_targets_kg(starting_weight_kg, goal_weight_kg)
    if len(targets) != CYCLE_LENGTH_DAYS:
        raise ValidationError(
            {"daily_targets_kg": [f"Expected {CYCLE_LENGTH_DAYS} daily targets."]}
        )
    return BodyCheckCycle.objects.create(
        coach=coach,
        student=student,
        start_date=start_date,
        end_date=end_date,
        status=BodyCheckCycle.Status.ACTIVE,
        starting_weight_kg=starting_weight_kg,
        goal_weight_kg=goal_weight_kg,
        daily_targets_kg=[float(x) for x in targets],
        meal_detail_enabled=bool(meal_detail_enabled),
    )


@transaction.atomic
def update_cycle(cycle: BodyCheckCycle, data: dict) -> BodyCheckCycle:
    if "meal_detail_enabled" in data:
        cycle.meal_detail_enabled = bool(data["meal_detail_enabled"])
    if "goal_weight_kg" in data and data["goal_weight_kg"] is not None:
        cycle.goal_weight_kg = data["goal_weight_kg"]
    if "starting_weight_kg" in data and data["starting_weight_kg"] is not None:
        cycle.starting_weight_kg = data["starting_weight_kg"]
    if "daily_targets_kg" in data and data["daily_targets_kg"] is not None:
        targets = data["daily_targets_kg"]
        if len(targets) != CYCLE_LENGTH_DAYS:
            raise ValidationError(
                {"daily_targets_kg": [f"Expected {CYCLE_LENGTH_DAYS} daily targets."]}
            )
        cycle.daily_targets_kg = [float(x) for x in targets]
    if "status" in data and data["status"] is not None:
        status = data["status"]
        if status not in {BodyCheckCycle.Status.ACTIVE, BodyCheckCycle.Status.CLOSED}:
            raise ValidationError({"status": ["Invalid status."]})
        cycle.status = status
    cycle.save()
    return cycle


def close_cycle(cycle: BodyCheckCycle) -> BodyCheckCycle:
    cycle.status = BodyCheckCycle.Status.CLOSED
    cycle.save(update_fields=["status", "updated_at"])
    return cycle


def assert_date_in_cycle(cycle: BodyCheckCycle, local_date: date) -> int:
    if local_date < cycle.start_date or local_date > cycle.end_date:
        raise ValidationError(
            {"local_date": ["Date is outside the Body Check cycle."]},
            code="date_out_of_cycle",
        )
    return day_number_for(cycle, local_date)


def _apply_daily_entry_fields(
    entry: BodyCheckDailyEntry,
    data: dict,
    *,
    cycle: BodyCheckCycle,
    actor_is_student: bool,
) -> None:
    if "actual_weight_kg" in data:
        entry.actual_weight_kg = data["actual_weight_kg"]
    if "sleep_start_time" in data:
        entry.sleep_start_time = data["sleep_start_time"]
    if "wake_time" in data:
        entry.wake_time = data["wake_time"]
    if "sleep_quality_score" in data:
        entry.sleep_quality_score = data["sleep_quality_score"]
    if "nutrition_adherence_score" in data:
        entry.nutrition_adherence_score = data["nutrition_adherence_score"]

    if cycle.meal_detail_enabled or not actor_is_student:
        for i in range(1, 7):
            key = f"meal_{i}"
            if key in data and data[key] is not None:
                setattr(entry, key, str(data[key]))
    elif actor_is_student:
        for i in range(1, 7):
            key = f"meal_{i}"
            if key in data and data[key]:
                raise ValidationError(
                    {key: ["Meal details are locked by the coach for this cycle."]},
                    code="meals_locked",
                )

    entry.sleep_duration_minutes = compute_sleep_duration_minutes(
        entry.sleep_start_time, entry.wake_time
    )


def _entry_has_meaningful_data(entry: BodyCheckDailyEntry, *, meal_detail_enabled: bool) -> bool:
    flags = _entry_completion_flags(entry, meal_detail_enabled=meal_detail_enabled)
    return bool(
        flags["has_weight"]
        or flags["has_sleep"]
        or flags["has_nutrition"]
        or flags["has_meals"]
    )


@transaction.atomic
def upsert_daily_entry(
    cycle: BodyCheckCycle,
    *,
    local_date: date,
    data: dict,
    actor_is_student: bool,
) -> BodyCheckDailyEntry | None:
    """Create/update a daily entry. Empty payloads do not create a logged day.

    If an existing entry is cleared of all meaningful values, it is deleted and
    the day returns to not_logged (no row).
    """
    if cycle.status != BodyCheckCycle.Status.ACTIVE and actor_is_student:
        raise ValidationError(
            {"status": ["This Body Check cycle is closed."]},
            code="cycle_closed",
        )
    day_number = assert_date_in_cycle(cycle, local_date)
    if actor_is_student:
        today = local_today()
        if local_date > today:
            raise ValidationError(
                {"local_date": ["Cannot log Body Check for a future date."]},
                code="future_date",
            )

    existing = get_entry_for_cycle_date(cycle, local_date)
    entry = existing or BodyCheckDailyEntry(
        cycle=cycle,
        local_date=local_date,
        target_weight_kg=target_for_day(cycle, day_number),
    )

    # Always refresh target snapshot from cycle schedule when saving.
    entry.target_weight_kg = target_for_day(cycle, day_number)
    _apply_daily_entry_fields(
        entry, data, cycle=cycle, actor_is_student=actor_is_student
    )

    if not _entry_has_meaningful_data(entry, meal_detail_enabled=cycle.meal_detail_enabled):
        if existing is not None:
            existing.delete()
        return None

    entry.save()
    return entry


def get_entry_for_cycle_date(cycle: BodyCheckCycle, local_date: date) -> BodyCheckDailyEntry | None:
    return BodyCheckDailyEntry.objects.filter(cycle=cycle, local_date=local_date).first()


def current_week_number_for_cycle(cycle: BodyCheckCycle, *, today: date | None = None) -> int:
    """Week number available as of Tehran local today (clamped to cycle bounds)."""
    today = today or local_today()
    if today < cycle.start_date:
        return 0
    effective = min(today, cycle.end_date)
    return week_number_for_day(day_number_for(cycle, effective))


@transaction.atomic
def add_progress_photo(
    cycle: BodyCheckCycle,
    *,
    week_number: int,
    uploaded_file,
    actor_is_student: bool = False,
) -> BodyCheckProgressPhoto:
    if week_number < 1 or week_number > 4:
        raise ValidationError({"week_number": ["Week number must be 1–4."]})
    if actor_is_student:
        current_week = current_week_number_for_cycle(cycle)
        if week_number > current_week:
            raise ValidationError(
                {"week_number": ["Cannot upload Body Check photos for a future week."]},
                code="future_week",
            )
    if not uploaded_file:
        raise ValidationError({"file": ["A photo file is required."]})
    size = getattr(uploaded_file, "size", 0) or 0
    if size > BodyCheckProgressPhoto.MAX_UPLOAD_BYTES:
        raise ValidationError(
            {"file": ["Photo must be 5 MB or smaller."]},
            code="file_too_large",
        )
    content_type = getattr(uploaded_file, "content_type", "") or ""
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if content_type and content_type not in allowed_types:
        raise ValidationError(
            {"file": ["Only JPEG, PNG, or WebP images are allowed."]},
            code="invalid_file_type",
        )
    photo = BodyCheckProgressPhoto(
        cycle=cycle,
        week_number=week_number,
        original_filename=getattr(uploaded_file, "name", "")[:255],
        content_type=content_type,
        size_bytes=size,
    )
    photo.file.save(getattr(uploaded_file, "name", "photo.jpg"), uploaded_file, save=False)
    photo.save()
    return photo


def get_photo_for_cycle(cycle: BodyCheckCycle, photo_id) -> BodyCheckProgressPhoto:
    try:
        return BodyCheckProgressPhoto.objects.get(cycle=cycle, pk=photo_id)
    except BodyCheckProgressPhoto.DoesNotExist as exc:
        raise NotFound(detail="Progress photo not found.") from exc


def delete_progress_photo(photo: BodyCheckProgressPhoto) -> None:
    storage = photo.file.storage
    name = photo.file.name
    photo.delete()
    if name:
        try:
            storage.delete(name)
        except Exception:  # noqa: S110
            pass


def _entry_completion_flags(entry: BodyCheckDailyEntry | None, *, meal_detail_enabled: bool) -> dict:
    if entry is None:
        return {
            "has_weight": False,
            "has_sleep": False,
            "has_nutrition": False,
            "has_meals": False,
            "is_logged": False,
        }
    has_weight = entry.actual_weight_kg is not None
    has_sleep = (
        entry.sleep_start_time is not None
        or entry.wake_time is not None
        or entry.sleep_quality_score is not None
    )
    has_nutrition = entry.nutrition_adherence_score is not None
    meals = [entry.meal_1, entry.meal_2, entry.meal_3, entry.meal_4, entry.meal_5, entry.meal_6]
    has_meals = meal_detail_enabled and any(bool(m.strip()) for m in meals)
    is_logged = has_weight or has_sleep or has_nutrition or has_meals
    return {
        "has_weight": has_weight,
        "has_sleep": has_sleep,
        "has_nutrition": has_nutrition,
        "has_meals": has_meals,
        "is_logged": is_logged,
    }


def serialize_entry(
    entry: BodyCheckDailyEntry | None,
    *,
    cycle: BodyCheckCycle,
    local_date: date,
    for_student: bool = False,
) -> dict:
    day_number = day_number_for(cycle, local_date)
    week_number = week_number_for_day(day_number)
    target = (
        entry.target_weight_kg
        if entry and entry.target_weight_kg is not None
        else target_for_day(cycle, day_number)
    )
    flags = _entry_completion_flags(entry, meal_detail_enabled=cycle.meal_detail_enabled)
    status = "logged" if flags["is_logged"] else "not_logged"
    base = {
        "local_date": local_date.isoformat(),
        "day_number": day_number,
        "week_number": week_number,
        "target_weight_kg": float(target) if target is not None else None,
        "status": status,
        "is_logged": flags["is_logged"],
        "completion": flags,
    }
    if entry is None:
        base.update(
            {
                "id": None,
                "actual_weight_kg": None,
                "weight_delta_kg": None,
                "sleep_start_time": None,
                "wake_time": None,
                "sleep_duration_minutes": None,
                "sleep_quality_score": None,
                "nutrition_adherence_score": None,
                "meals": None if for_student and not cycle.meal_detail_enabled else {
                    "meal_1": "",
                    "meal_2": "",
                    "meal_3": "",
                    "meal_4": "",
                    "meal_5": "",
                    "meal_6": "",
                },
                "created_at": None,
                "updated_at": None,
            }
        )
        return base

    actual = entry.actual_weight_kg
    delta = None
    if actual is not None and target is not None:
        delta = float(actual - target)
    meals_payload = {
        "meal_1": entry.meal_1,
        "meal_2": entry.meal_2,
        "meal_3": entry.meal_3,
        "meal_4": entry.meal_4,
        "meal_5": entry.meal_5,
        "meal_6": entry.meal_6,
    }
    if for_student and not cycle.meal_detail_enabled:
        meals_payload = None
    base.update(
        {
            "id": str(entry.id),
            "actual_weight_kg": float(actual) if actual is not None else None,
            "weight_delta_kg": delta,
            "sleep_start_time": entry.sleep_start_time.isoformat() if entry.sleep_start_time else None,
            "wake_time": entry.wake_time.isoformat() if entry.wake_time else None,
            "sleep_duration_minutes": entry.sleep_duration_minutes,
            "sleep_quality_score": entry.sleep_quality_score,
            "nutrition_adherence_score": entry.nutrition_adherence_score,
            "meals": meals_payload,
            "created_at": entry.created_at.isoformat().replace("+00:00", "Z"),
            "updated_at": entry.updated_at.isoformat().replace("+00:00", "Z"),
        }
    )
    return base


def serialize_photo(photo: BodyCheckProgressPhoto) -> dict:
    return {
        "id": str(photo.id),
        "week_number": photo.week_number,
        "original_filename": photo.original_filename,
        "content_type": photo.content_type,
        "size_bytes": photo.size_bytes,
        "uploaded_at": photo.uploaded_at.isoformat().replace("+00:00", "Z"),
        "download_path": f"/body-check/photos/{photo.id}/download/",
    }


def build_cycle_calendar(cycle: BodyCheckCycle, *, for_student: bool = False) -> list[dict]:
    entries = {
        e.local_date: e
        for e in BodyCheckDailyEntry.objects.filter(cycle=cycle)
    }
    days: list[dict] = []
    for offset in range(CYCLE_LENGTH_DAYS):
        d = cycle.start_date + timedelta(days=offset)
        days.append(
            serialize_entry(
                entries.get(d),
                cycle=cycle,
                local_date=d,
                for_student=for_student,
            )
        )
    return days


def aggregate_report(cycle: BodyCheckCycle) -> dict:
    entries = list(BodyCheckDailyEntry.objects.filter(cycle=cycle).order_by("local_date"))
    logged_entries = [
        e
        for e in entries
        if _entry_has_meaningful_data(e, meal_detail_enabled=cycle.meal_detail_enabled)
    ]
    logged_count = len(logged_entries)
    missing_count = CYCLE_LENGTH_DAYS - logged_count

    weights = [e for e in entries if e.actual_weight_kg is not None]
    last_weight = weights[-1].actual_weight_kg if weights else None
    last_weight_date = weights[-1].local_date.isoformat() if weights else None

    nutrition_values = [
        e.nutrition_adherence_score for e in entries if e.nutrition_adherence_score is not None
    ]
    sleep_duration_values = [
        e.sleep_duration_minutes for e in entries if e.sleep_duration_minutes is not None
    ]
    sleep_quality_values = [
        e.sleep_quality_score for e in entries if e.sleep_quality_score is not None
    ]
    sleep_start_values = [e.sleep_start_time for e in entries if e.sleep_start_time is not None]
    wake_values = [e.wake_time for e in entries if e.wake_time is not None]

    def _avg(values: list) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 2)

    goal = cycle.goal_weight_kg
    delta_to_goal = None
    if last_weight is not None and goal is not None:
        delta_to_goal = float(last_weight - goal)

    return {
        "cycle_length_days": CYCLE_LENGTH_DAYS,
        "logged_days": logged_count,
        "missing_days": missing_count,
        "starting_weight_kg": float(cycle.starting_weight_kg),
        "goal_weight_kg": float(cycle.goal_weight_kg),
        "last_actual_weight_kg": float(last_weight) if last_weight is not None else None,
        "last_actual_weight_date": last_weight_date,
        "delta_to_goal_kg": delta_to_goal,
        "avg_nutrition_adherence_score": _avg(nutrition_values),
        "nutrition_score_days": len(nutrition_values),
        "avg_sleep_duration_minutes": _avg(sleep_duration_values),
        "sleep_duration_days": len(sleep_duration_values),
        "avg_sleep_start_time": average_clock_time(sleep_start_values),
        "sleep_start_time_days": len(sleep_start_values),
        "avg_wake_time": average_clock_time(wake_values),
        "wake_time_days": len(wake_values),
        "avg_sleep_quality_score": _avg(sleep_quality_values),
        "sleep_quality_days": len(sleep_quality_values),
    }


def serialize_cycle(
    cycle: BodyCheckCycle,
    *,
    for_student: bool = False,
    include_calendar: bool = False,
    include_report: bool = False,
    include_photos: bool = False,
) -> dict:
    today = local_today()
    data = {
        "id": str(cycle.id),
        "student_id": str(cycle.student_id),
        "coach_id": str(cycle.coach_id),
        "start_date": cycle.start_date.isoformat(),
        "end_date": cycle.end_date.isoformat(),
        "status": cycle.status,
        "starting_weight_kg": float(cycle.starting_weight_kg),
        "goal_weight_kg": float(cycle.goal_weight_kg),
        "daily_targets_kg": [float(x) for x in (cycle.daily_targets_kg or [])],
        "meal_detail_enabled": cycle.meal_detail_enabled,
        "cycle_length_days": CYCLE_LENGTH_DAYS,
        "local_today": today.isoformat(),
        "created_at": cycle.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": cycle.updated_at.isoformat().replace("+00:00", "Z"),
    }
    if include_calendar:
        data["days"] = build_cycle_calendar(cycle, for_student=for_student)
    if include_report:
        data["report"] = aggregate_report(cycle)
    if include_photos:
        photos = BodyCheckProgressPhoto.objects.filter(cycle=cycle)
        data["photos"] = [serialize_photo(p) for p in photos]
    return data


def student_dashboard_body_check(student: Student) -> dict | None:
    cycle = active_cycle_for_student(student)
    if cycle is None:
        return None
    today = local_today()
    in_range = cycle.start_date <= today <= cycle.end_date
    entry = get_entry_for_cycle_date(cycle, today) if in_range else None
    day_payload = None
    if in_range:
        day_payload = serialize_entry(entry, cycle=cycle, local_date=today, for_student=True)
    weights = (
        BodyCheckDailyEntry.objects.filter(cycle=cycle, actual_weight_kg__isnull=False)
        .order_by("-local_date")
        .first()
    )
    last_weight = float(weights.actual_weight_kg) if weights else None
    last_weight_date = weights.local_date.isoformat() if weights else None
    last_target = None
    weight_delta = None
    if weights:
        day_n = day_number_for(cycle, weights.local_date)
        last_target = target_for_day(cycle, day_n)
        if last_target is not None:
            weight_delta = float(weights.actual_weight_kg - last_target)
    return {
        "cycle": serialize_cycle(cycle, for_student=True),
        "today_in_cycle": in_range,
        "today": day_payload,
        "last_actual_weight_kg": last_weight,
        "last_actual_weight_date": last_weight_date,
        "last_target_weight_kg": float(last_target) if last_target is not None else None,
        "last_weight_delta_kg": weight_delta,
    }
