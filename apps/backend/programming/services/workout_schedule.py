"""Explicit weekly workout occurrences derived from a program's actual date range."""

from datetime import timedelta


def build_workout_schedule(training, start_date, end_date):
    days = training.get("days") if isinstance(training, dict) else None
    if not isinstance(days, list) or not days or not start_date or not end_date or end_date < start_date:
        return {"version": 1, "configured": False, "weeks": []}

    total_days = (end_date - start_date).days + 1
    week_count = (total_days + 6) // 7
    day_count = len(days)
    schedule_weeks = []
    for week_index in range(week_count):
        week_start = start_date + timedelta(days=week_index * 7)
        week_end = min(week_start + timedelta(days=6), end_date)
        week_days = (week_end - week_start).days + 1
        sessions = []

        # The generation flow stores the training split but not weekdays. Until
        # coaches can choose weekdays, spread each split evenly through a full
        # seven-day training week and persist the resulting dated occurrences.
        for day_index, day in enumerate(days):
            offset = (day_index * 7 + day_count // 2) // day_count
            if offset >= week_days or not isinstance(day, dict) or not day.get("id"):
                continue
            sessions.append(
                {
                    "day_id": str(day["id"]),
                    "scheduled_on": (week_start + timedelta(days=offset)).isoformat(),
                }
            )

        schedule_weeks.append(
            {
                "week": week_index + 1,
                "starts_on": week_start.isoformat(),
                "ends_on": week_end.isoformat(),
                "sessions": sessions,
            }
        )

    return {
        "version": 1,
        "configured": True,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "weeks": schedule_weeks,
    }


def ensure_workout_schedule(training, start_date, end_date):
    if not isinstance(training, dict):
        return training
    schedule = training.get("schedule")
    if (
        not isinstance(schedule, dict)
        or schedule.get("version") != 1
        or (not schedule.get("configured") and start_date and end_date)
    ):
        training["schedule"] = build_workout_schedule(training, start_date, end_date)
    return training
