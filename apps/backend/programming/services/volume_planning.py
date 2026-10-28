"""Plan and audit direct working sets using canonical muscle identities."""

import re
from collections import Counter
from copy import deepcopy
from types import SimpleNamespace

from rest_framework.exceptions import ValidationError

from accounts.exercise_metadata import MUSCLE_NAMES, muscle_key
from programming.services.execution import rest_seconds

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


def build_volume_plan(policy, level, goal, muscle_decisions=None):
    rows = deepcopy(policy["volume_profiles"][level])
    decisions = {muscle_key(key): value for key, value in (muscle_decisions or {}).items()}
    for key, row in rows.items():
        decision = decisions.get(key, "balanced")
        if decision not in {"balanced", "focus", "maintenance"}:
            raise ValueError(f"Unsupported muscle decision for {key}: {decision}")
        goal_maintenance = goal in {"maintain", "maintain_weight"}
        effective_decision = (
            "maintenance" if goal_maintenance and decision == "balanced" else decision
        )
        row["decision"] = effective_decision
        row["decision_source"] = "coach" if key in decisions else "goal"
        row["target"] = (
            row["maintenance"]
            if effective_decision == "maintenance"
            else row["target_max"]
            if effective_decision == "focus"
            else row["growth_start"]
            if goal == "fat_loss"
            else row["target_min"]
        )
        row["priority"] = effective_decision == "focus"
        row["minimum"] = (
            row["maintenance"] if effective_decision == "maintenance" else row["growth_start"]
        )
        if goal == "strength" and effective_decision != "maintenance":
            row["minimum"] = row["maintenance"]
            row["target"] = row["growth_start"]
    return {
        "source": PROFILE_SOURCE,
        "goal": goal,
        "level": level,
        "muscle_decisions": decisions,
        "muscles": rows,
        "goal_review_required": goal
        not in {
            "hypertrophy",
            "general_muscle_gain",
            "body_recomposition",
            "fat_loss",
            "maintain",
            "maintain_weight",
            "strength",
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

    def weekly_deficit(row, selected_count=0):
        assigned = int(row.get("weekly_sets_assigned") or 0)
        minimum = int(row.get("weekly_minimum") or 0)
        projected = assigned + selected_count * int(base_sets)
        sessions_left = max(1, int(row.get("sessions_remaining") or 1))
        return max(0, minimum - projected) / sessions_left

    ordered = sorted(
        demands,
        key=lambda row: (
            not row["priority"],
            bool(row.get("weekly_sets_assigned")),
            -weekly_deficit(row),
            row["order"],
            -row["per_session_sets"],
            row["muscle_key"],
        ),
    )
    selected = {row["muscle_key"]: 0 for row in ordered}
    remaining_slots = slot_budget

    # First reserve one movement per muscle while slots remain. If the session
    # cannot fit every muscle, coach-priority and volume demand decide which
    # muscles receive a slot; never silently exceed the time-derived budget.
    for row in ordered:
        if row["available"] <= 0 or remaining_slots <= 0:
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
        # A movement is capped at five work sets. Prioritize extra movements
        # needed to make a coach-approved target achievable before optional
        # variety, while respecting the same session slot budget.
        row = max(
            eligible,
            key=lambda item: (
                item["priority"],
                weekly_deficit(item, selected[item["muscle_key"]]) > 0,
                weekly_deficit(item, selected[item["muscle_key"]]),
                int(item["per_session_sets"]) > 5 * selected[item["muscle_key"]],
                item["per_session_sets"] / (selected[item["muscle_key"]] + 1),
                -item["order"],
            ),
        )
        selected[row["muscle_key"]] += 1
        remaining_slots -= 1

    uncovered = [row["muscle_key"] for row in ordered if selected[row["muscle_key"]] == 0]
    return {
        "slot_budget": slot_budget,
        "selected_counts": selected,
        "uncovered_muscles": uncovered,
        "selected_count": sum(selected.values()),
        "coverage_over_slot_budget": max(0, sum(selected.values()) - slot_budget),
    }


def _rest_seconds(item, policy):
    return rest_seconds(item) if item.get("rest") else policy["rest_seconds"]


def estimated_seconds(item, policy):
    """Use actual structured recipe steps when available, including nested work."""
    snapshot = item.get("exercise_snapshot") or {}
    timed = snapshot.get("prescription_unit") == "seconds"
    numbers = [int(value) for value in re.findall(r"\d+", str(item.get("reps", "")))]
    work = (
        max(numbers or [30])
        if timed
        else max(numbers or [12]) * int(item.get("tempoSecondsPerRep") or 3)
    )
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
        rounds = min(int(item["sets"]) for item in items)
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
        seconds += sum((int(item["sets"]) - rounds) * _rest_seconds(item, policy) for item in items)
    return seconds


def allocate_volume(days, plan, policy, student, warnings):
    """Allocate a weekly target while respecting each session's real execution cost."""
    remaining_days = Counter(
        key for day in days for key in {primary_key(item) for item in day["exercises"]}
    )
    allocated = Counter()
    duration = int((student.training_conditions or {}).get("session_duration_minutes") or 0)

    def fixed_sets(item):
        return any(
            step.get("op") == "prescribe" and "sets" in step
            for technique in item.get("techniques", [])
            for step in (technique.get("recipe") or {}).get("steps", [])
        )

    def minimum_sets(item):
        # A circuit/superset member cannot be silently dropped after grouping;
        # keep one working set so its group remains executable and valid.
        return 1 if item.get("trainingGroupId") or item.get("supersetGroupId") else 0

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
            if not fixed_sets(item):
                item["sets"] = max(
                    minimum_sets(item),
                    min(5, (left + remaining_items[key] - 1) // remaining_items[key]),
                )
            used[key] += item["sets"]
            remaining_items[key] -= 1
        scheduled_keys = set(remaining_items)
        day["exercises"] = [item for item in day["exercises"] if item["sets"] > 0]
        if duration:
            while session_seconds(day, policy) > duration * 60:
                local_sets = Counter(
                    primary_key(item) for item in day["exercises"] for _ in range(int(item["sets"]))
                )
                candidates = [
                    item
                    for item in day["exercises"]
                    if item["sets"] > minimum_sets(item)
                    and not fixed_sets(item)
                    and (
                        primary_key(item) not in plan.get("required_muscles", [])
                        or local_sets[primary_key(item)] > 1
                    )
                ]
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
    # Repair weekly shortfalls using existing eligible movements, never random additions.
    # Minimum coverage outranks a preferred target, including a focus maximum.
    for minimum_only in (True, False):
        for key, row in sorted(plan["muscles"].items(), key=lambda pair: not pair[1]["priority"]):
            target = row.get("minimum", row["target"]) if minimum_only else row["target"]
            while allocated[key] < target:
                candidates = []
                for day in days:
                    local = sum(
                        int(item["sets"]) for item in day["exercises"] if primary_key(item) == key
                    )
                    if local >= row["session_cap"]:
                        continue
                    for item in day["exercises"]:
                        if primary_key(item) != key or item["sets"] >= 5 or fixed_sets(item):
                            continue
                        item["sets"] += 1
                        fits = not duration or session_seconds(day, policy) <= duration * 60
                        item["sets"] -= 1
                        if fits:
                            candidates.append((local, session_seconds(day, policy), item))
                if not candidates:
                    # Rebalance optional sets before declaring a full session infeasible.
                    transfers = []
                    if minimum_only:
                        for day in days:
                            recipients = [
                                item
                                for item in day["exercises"]
                                if primary_key(item) == key
                                and item["sets"] < 5
                                and not fixed_sets(item)
                            ]
                            local = sum(
                                item["sets"]
                                for item in day["exercises"]
                                if primary_key(item) == key
                            )
                            if local >= row["session_cap"]:
                                continue
                            for recipient in recipients:
                                for donor in day["exercises"]:
                                    donor_key = primary_key(donor)
                                    donor_profile = plan["muscles"].get(donor_key, {})
                                    surplus = allocated[donor_key] - donor_profile.get(
                                        "minimum", allocated[donor_key]
                                    )
                                    if (
                                        donor_key == key
                                        or surplus <= 0
                                        or donor["sets"] <= 1
                                        or fixed_sets(donor)
                                    ):
                                        continue
                                    donor["sets"] -= 1
                                    recipient["sets"] += 1
                                    fits = (
                                        not duration
                                        or session_seconds(day, policy) <= duration * 60
                                    )
                                    donor["sets"] += 1
                                    recipient["sets"] -= 1
                                    if fits:
                                        transfers.append(
                                            (
                                                donor_profile.get("priority", False),
                                                -surplus,
                                                donor,
                                                recipient,
                                            )
                                        )
                    if transfers:
                        _, _, donor, recipient = min(transfers, key=lambda transfer: transfer[:2])
                        donor["sets"] -= 1
                        recipient["sets"] += 1
                        allocated[primary_key(donor)] -= 1
                        allocated[key] += 1
                        continue
                    break
                chosen = min(candidates, key=lambda candidate: candidate[:2])[2]
                chosen["sets"] += 1
                allocated[key] += 1
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
        if not actual and not profile["priority"] and key not in plan.get("required_muscles", []):
            continue
        rows[key] = {**profile, "actual": actual, "name": MUSCLE_NAMES.get(key, key)}
        if actual < profile["target"]:
            warnings.append(f"volume_target_shortfall:{key}:{actual}/{profile['target']}")
        if key in plan.get("required_muscles", []) and actual < profile.get("minimum", 1):
            warnings.append(f"volume_required_shortfall:{key}:{actual}/{profile.get('minimum', 1)}")
        if (
            actual
            and actual < profile["growth_start"]
            and profile.get("decision") != "maintenance"
            and plan["goal"] not in {"maintain", "maintain_weight", "strength"}
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


def refresh_volume_audit(training, *, reject_excess=True, require_complete=False):
    """Re-audit the saved generation contract after edits, regeneration and before publication."""
    if not training.get("volume_plan") or not training.get("volume_policy"):
        return
    from programming.services.execution import compile_execution

    compile_execution(training.get("days", []))
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
        if "exceeded" in warning
        or warning == "invalid_working_sets"
        or (
            require_complete
            and training.get("planning_version") == 3
            and warning.startswith("volume_required_shortfall:")
        )
    ]
    if training.get("planning_version") == 3 and require_complete:
        eligible = set(training.get("eligible_exercise_ids", []))
        for day in training.get("days", []):
            if not day.get("exercises"):
                blocking.append(f"empty_session:{day.get('id')}")
            for item in day.get("exercises", []):
                if item.get("exercise_id") not in eligible:
                    blocking.append(f"ineligible_exercise:{item.get('id')}")
        blocking.extend(training.get("system_warnings", []))
        present_systems = {
            technique.get("key")
            for day in training.get("days", [])
            for item in day.get("exercises", [])
            for technique in item.get("techniques", [])
        }
        blocking.extend(
            f"training_system_removed:{key}"
            for key in training.get("required_system_keys", [])
            if key not in present_systems
        )
        if training["volume_plan"].get("goal_review_required"):
            blocking.append(f"unsupported_goal:{training['volume_plan']['goal']}")
        for day in training.get("days", []):
            groups = Counter(
                item.get("trainingGroupId") or item.get("supersetGroupId")
                for item in day.get("exercises", [])
            )
            for item in day.get("exercises", []):
                key = item.get("trainingGroupId") or item.get("supersetGroupId")
                if key and groups[key] < int(item.get("trainingGroupSize") or 2):
                    blocking.append(f"incomplete_training_group:{key}")
    if blocking and reject_excess:
        raise ValidationError(
            {
                "training": [
                    "برنامه با پوشش عضلات، محدودیت زمان یا سیستم‌های انتخاب‌شده سازگار نیست؛ جزئیات زیر را اصلاح کنید و دوباره تأیید کنید.",
                    *blocking,
                ]
            }
        )
