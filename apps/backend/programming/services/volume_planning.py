"""Plan and audit direct working sets using canonical muscle identities."""

import re
from collections import Counter
from copy import deepcopy
from types import SimpleNamespace

from rest_framework.exceptions import ValidationError

from accounts.exercise_metadata import MUSCLE_NAMES, muscle_key

PROFILE_SOURCE = {
    "version": "athlore-volume-v1",
    "basis": "Coach-editable starting estimates, not measured individual MEV/MRV",
    "reference": "https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth",
    "counting": "direct_primary_working_sets; secondary exposure reported separately",
}
BASE_RANGES = {
    "chest": (8, 12, 16),
    "back": (10, 14, 20),
    "shoulders": (8, 12, 18),
    "quadriceps": (8, 10, 16),
    "hamstrings": (6, 8, 12),
    "glutes": (6, 10, 16),
    "biceps": (4, 6, 10),
    "triceps": (4, 6, 10),
    "calves": (4, 6, 10),
    "forearms": (2, 4, 8),
    "core": (4, 6, 10),
    "traps": (2, 4, 8),
}


def default_volume_profiles():
    profiles = {}
    for level, multiplier in (("beginner", 0.75), ("intermediate", 1), ("advanced", 1.15)):
        profiles[level] = {}
        for key, (start, target, upper) in BASE_RANGES.items():
            start, target, upper = (
                max(2, round(value * multiplier)) for value in (start, target, upper)
            )
            profiles[level][key] = {
                "maintenance": max(2, start // 2),
                "growth_start": start,
                "target_min": target,
                "target_max": upper,
                "weekly_cap": upper + 4,
                "session_cap": min(10, upper),
            }
    return profiles


def primary_key(item):
    snapshot = item.get("exercise_snapshot") or item
    primary = next(
        (
            target.get("muscle_key")
            for target in snapshot.get("targets", [])
            if target.get("role") == "primary"
        ),
        None,
    )
    return muscle_key(
        primary
        or snapshot.get("primary_muscle_key")
        or snapshot.get("primary_muscle")
        or item.get("targetMuscle")
    )


def build_volume_plan(policy, level, goal, focus):
    rows = deepcopy(policy["volume_profiles"][level])
    focus = {muscle_key(value) for value in focus}
    if "پا" in focus:
        focus.update({"quadriceps", "hamstrings", "glutes"})
    for key, row in rows.items():
        row["target"] = (
            row["maintenance"]
            if goal in {"maintain", "maintain_weight"}
            else row["target_max"]
            if key in focus
            else row["growth_start"]
            if goal == "fat_loss"
            else row["target_min"]
        )
        row["priority"] = key in focus
    return {
        "source": PROFILE_SOURCE,
        "goal": goal,
        "level": level,
        "muscles": rows,
        "goal_review_required": goal
        not in {
            "hypertrophy",
            "general_muscle_gain",
            "body_recomposition",
            "fat_loss",
            "maintain",
            "maintain_weight",
        },
    }


def plan_session_exercise_counts(demands, duration_minutes, base_sets, policy):
    """Choose movement counts across a whole session before allocating its sets."""
    usable_seconds = max(
        1,
        int(duration_minutes) * 60 - int(policy["warmup_minutes"]) * 60,
    )
    nominal_exercise_seconds = max(1, int(base_sets)) * (36 + int(policy["rest_seconds"])) + 45
    slot_budget = max(1, usable_seconds // nominal_exercise_seconds)

    ordered = sorted(
        demands,
        key=lambda row: (
            not row["priority"],
            row["order"],
            -row["per_session_sets"],
            row["muscle_key"],
        ),
    )
    selected = {row["muscle_key"]: 0 for row in ordered}
    remaining_slots = slot_budget

    # Give each selected primary muscle one movement before spending slots on variety.
    for row in ordered:
        if remaining_slots <= 0:
            break
        if row["available"] <= 0:
            continue
        selected[row["muscle_key"]] = 1
        remaining_slots -= 1

    while remaining_slots > 0:
        eligible = [
            row
            for row in ordered
            if selected[row["muscle_key"]] < min(row["desired"], row["available"])
        ]
        if not eligible:
            break
        row = max(
            eligible,
            key=lambda item: (
                item["priority"],
                item["per_session_sets"] / (selected[item["muscle_key"]] + 1),
                -item["order"],
            ),
        )
        selected[row["muscle_key"]] += 1
        remaining_slots -= 1

    uncovered = [
        row["muscle_key"]
        for row in ordered
        if row["available"] > 0 and selected[row["muscle_key"]] == 0
    ]
    return {
        "slot_budget": slot_budget,
        "selected_counts": selected,
        "uncovered_muscles": uncovered,
        "selected_count": sum(selected.values()),
    }


def _rest_seconds(item, policy):
    match = re.search(r"\d+", str(item.get("rest", "")))
    return int(match[0]) if match else policy["rest_seconds"]


def estimated_seconds(item, policy):
    """Use actual structured recipe steps when available, including nested work."""
    snapshot = item.get("exercise_snapshot") or {}
    timed = snapshot.get("prescription_unit") == "seconds"
    numbers = [int(value) for value in re.findall(r"\d+", str(item.get("reps", "")))]
    work = max(numbers or [30]) if timed else max(numbers or [12]) * 3
    # A technique may prescribe more than one effort inside one working set.
    _, extra = additional_efforts(item, work)
    return int(item.get("sets") or 0) * (work + _rest_seconds(item, policy)) + extra + 45


def additional_efforts(item, work=36):
    """Report mini-efforts separately; do not invent an equivalent-set multiplier."""
    efforts, seconds, has_recipe = 0, 0, False
    for technique in item.get("techniques", []):
        recipe = technique.get("recipe") or {}
        if not recipe:
            continue
        has_recipe = True
        multiplier = 1 if recipe.get("target") == "last_set" else int(item.get("sets") or 0)

        def walk(steps, repeat=1, nested=False, multiplier=multiplier):
            nonlocal efforts, seconds
            for step in steps:
                if step["op"] == "repeat":
                    walk(step["steps"], repeat * step["count"], True)
                elif step["op"] == "prescribe" and nested:
                    count = repeat * int(step.get("sets") or 1) * multiplier
                    efforts += count
                    values = [int(value) for value in re.findall(r"\d+", str(step.get("reps", "")))]
                    seconds += count * (
                        max(values or [12]) * 3 + int(step.get("rest_seconds") or 0)
                    )
                elif step["op"] == "rest":
                    seconds += repeat * step["seconds"] * multiplier
                elif step["op"] == "partial_range" and step.get("count"):
                    seconds += repeat * step["count"] * 3 * multiplier

        walk(recipe.get("steps", []))
    if not has_recipe and item.get("dropSet"):
        efforts += int(item["dropSet"].get("drops") or 0)
        seconds += efforts * work
    return efforts, seconds


def session_seconds(day, policy):
    grouped, seconds = {}, policy["warmup_minutes"] * 60
    for item in day["exercises"]:
        key = item.get("trainingGroupId") or item.get("supersetGroupId")
        if key:
            grouped.setdefault(key, []).append(item)
        else:
            seconds += estimated_seconds(item, policy)
    for items in grouped.values():
        rounds = max(int(item["sets"]) for item in items)
        after = max(
            int(item["supersetRestAfterSeconds"])
            if item.get("supersetRestAfterSeconds") is not None
            else _rest_seconds(item, policy)
            for item in items
        )
        between = max(int(item.get("supersetRestBetweenSeconds") or 0) for item in items)
        seconds += sum(
            estimated_seconds(item, policy) - int(item["sets"]) * _rest_seconds(item, policy)
            for item in items
        )
        seconds += rounds * (after + between * max(0, len(items) - 1))
    return seconds


def allocate_volume(days, plan, policy, student, warnings):
    """Allocate before techniques. No extra focus or legacy per-exercise set boosts."""
    remaining_days = Counter(
        key for day in days for key in {primary_key(item) for item in day["exercises"]}
    )
    allocated = Counter()
    duration = int((student.training_conditions or {}).get("session_duration_minutes") or 0)
    for day in days:
        remaining_items = Counter(primary_key(item) for item in day["exercises"])
        used = Counter()
        targets = {}
        for key, count in remaining_items.items():
            row = plan["muscles"].get(key)
            if row:
                outstanding = max(0, row["target"] - allocated[key])
                targets[key] = min(
                    row["session_cap"],
                    count * 5,
                    (outstanding + remaining_days[key] - 1) // remaining_days[key],
                )
        for item in day["exercises"]:
            key = primary_key(item)
            if key not in targets:
                warnings.append(f"volume_profile_missing:{key}")
                continue
            left = max(0, targets[key] - used[key])
            item["sets"] = min(5, (left + remaining_items[key] - 1) // remaining_items[key])
            used[key] += item["sets"]
            remaining_items[key] -= 1
        scheduled_keys = set(remaining_items)
        day["exercises"] = [item for item in day["exercises"] if item["sets"] > 0]
        if duration:
            while session_seconds(day, policy) > duration * 60:
                candidates = [item for item in day["exercises"] if item["sets"] > 0]
                if not candidates:
                    break
                item = min(
                    candidates,
                    key=lambda item: (
                        plan["muscles"].get(primary_key(item), {}).get("priority", False),
                        -item["sets"],
                    ),
                )
                item["sets"] -= 1
                day["exercises"] = [item for item in day["exercises"] if item["sets"] > 0]
        for item in day["exercises"]:
            allocated[primary_key(item)] += item["sets"]
        for key in scheduled_keys:
            remaining_days[key] -= 1
    return days


def audit_volume(days, plan, policy, student):
    direct, secondary, extra_efforts, sessions, warnings = Counter(), Counter(), Counter(), [], []
    if plan.get("goal_review_required"):
        warnings.append(f"volume_goal_review:{plan['goal']}")
    duration = int((student.training_conditions or {}).get("session_duration_minutes") or 0)
    for day in days:
        local = Counter()
        for item in day["exercises"]:
            sets = int(item.get("sets") or 0)
            if sets < 1:
                warnings.append("invalid_working_sets")
            key = primary_key(item)
            direct[key] += sets
            local[key] += sets
            extra_efforts[key] += additional_efforts(item)[0]
            for secondary_key in {
                target["muscle_key"]
                for target in (item.get("exercise_snapshot") or {}).get("targets", [])
                if target.get("role") == "secondary"
            }:
                secondary[secondary_key] += sets
        minutes = round(session_seconds(day, policy) / 60, 1)
        day["estimatedMinutes"] = minutes
        sessions.append(
            {"day_id": day["id"], "direct_sets": dict(local), "estimated_minutes": minutes}
        )
        if duration and minutes > duration:
            warnings.append(f"volume_session_time_exceeded:{day['id']}")
        for key, sets in local.items():
            row = plan["muscles"].get(key)
            if row and sets > row["session_cap"]:
                warnings.append(f"volume_session_cap_exceeded:{key}")
    rows = {}
    for key, profile in plan["muscles"].items():
        actual = direct[key]
        # Do not pretend to have covered a prioritized muscle omitted by a split.
        if not actual and not profile["priority"]:
            continue
        rows[key] = {**profile, "actual": actual, "name": MUSCLE_NAMES.get(key, key)}
        if actual < profile["target"]:
            warnings.append(f"volume_target_shortfall:{key}:{actual}/{profile['target']}")
        if (
            actual
            and actual < profile["growth_start"]
            and plan["goal"] not in {"maintain", "maintain_weight"}
        ):
            warnings.append(f"volume_below_growth_start:{key}")
        if actual > profile["weekly_cap"]:
            warnings.append(f"volume_weekly_cap_exceeded:{key}")
    return {
        "source": PROFILE_SOURCE,
        "muscles": rows,
        "direct_sets": dict(direct),
        "secondary_exposure_sets": dict(secondary),
        "additional_efforts": dict(extra_efforts),
        "sessions": sessions,
    }, list(dict.fromkeys(warnings))


def refresh_volume_audit(training, *, reject_excess=True):
    """Re-audit the saved generation contract after edits, regeneration and before publication."""
    if not training.get("volume_plan") or not training.get("volume_policy"):
        return
    student = SimpleNamespace(
        training_conditions={"session_duration_minutes": training.get("session_duration_minutes")}
    )
    audit, warnings = audit_volume(
        training.get("days", []), training["volume_plan"], training["volume_policy"], student
    )
    training["volume_audit"] = audit
    training["volume_warnings"] = warnings
    blocking = [
        warning
        for warning in warnings
        if "exceeded" in warning or warning == "invalid_working_sets"
    ]
    if blocking and reject_excess:
        raise ValidationError(
            {
                "training": [
                    "حجم یا زمان برنامه از سقف قوانین تأییدشده بیشتر است؛ ست‌ها یا سیستم تمرینی را اصلاح کنید.",
                    *blocking,
                ]
            }
        )
