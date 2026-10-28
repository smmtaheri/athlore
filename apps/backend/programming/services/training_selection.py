"""Split-driven training day construction for rules_v1.

Owns muscle coverage, per-session dedupe, volume bias, hard equipment filter,
prescription variation, and session ordering. Injury/forbidden sets are
provided by the caller (generator orchestration).
"""

from __future__ import annotations

import hashlib
import math
import random
import re
from collections import Counter
from typing import Any

from django.db.models import Q
from rest_framework.exceptions import ValidationError

from accounts.exercise_metadata import (
    MUSCLE_NAMES,
    exercise_snapshot,
    matches_muscle,
    movement_class,
    movement_role,
    muscle_key,
)
from accounts.generation_policy import coach_policy
from accounts.models import (
    CoachExercisePreference,
    Exercise,
    ExerciseAlias,
    ExerciseHistoricalUsage,
    LevelRule,
    MuscleRegion,
    MuscleTaxonomy,
    ProgramTemplate,
)
from programming.services.split_parser import (
    TAXONOMY_MUSCLE_GROUPS,
    normalize_muscle,
    parse_template_split,
)
from programming.services.volume_planning import (
    allocate_volume,
    audit_volume,
    build_volume_plan,
    plan_session_exercise_counts,
)

BODYWEIGHT_TOKENS = ("وزن بدن", "بدون وزنه", "bodyweight", "body weight")

EQUIPMENT_FLAG_TOKENS: dict[str, str] = {
    "has_dumbbell": "دمبل",
    "hasDumbbell": "دمبل",
    "has_barbell": "هالتر",
    "hasBarbell": "هالتر",
    "has_cable": "کابل",
    "hasCable": "کابل",
    "has_machines": "دستگاه",
    "hasMachines": "دستگاه",
}
EQUIPMENT_FULL_GYM_KEYS = ("has_full_gym", "hasFullGym")


ARM_MUSCLES = frozenset({"پشت بازو", "جلو بازو"})
CORE_MUSCLES = frozenset({"شکم"})


def _stable_id(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def _matches_any(name: str, needles: tuple[str, ...]) -> bool:
    lower = name.lower()
    return any(n.lower() in lower or n in name for n in needles)


def _fuzzy_forbidden(name: str, forbidden: set[str]) -> bool:
    for item in forbidden:
        if not item:
            continue
        if item == name or item in name or name in item:
            return True
    return False


def _passes_level(
    name: str,
    level: str,
    catalog_by_name: dict[str, Exercise],
    pref_by_exercise_id: dict[str, CoachExercisePreference],
    structured_catalog_by_name: dict[str, dict] | None = None,
) -> bool:
    ex = catalog_by_name.get(name)
    if ex is None:
        return True
    structured = (structured_catalog_by_name or {}).get(name) or {}
    structured_levels = set(structured.get("levels") or [])
    if structured_levels:
        if "all" in structured_levels or level in structured_levels:
            return True
        pref = pref_by_exercise_id.get(str(ex.id))
        return bool(pref and level in (pref.suitable_levels or []))
    if not ex.level or ex.level == "all" or ex.level == level:
        return True
    pref = pref_by_exercise_id.get(str(ex.id))
    if pref and level in (pref.suitable_levels or []):
        return True
    return False


def _passes_equipment_hard(
    name: str,
    tokens: set[str] | None,
    catalog_by_name: dict[str, Exercise],
    structured_catalog_by_name: dict[str, dict] | None = None,
) -> bool:
    """Hard equipment constraint. ``None`` = unrestricted (unknown / full gym)."""
    if tokens is None:
        return True
    ex = catalog_by_name.get(name)
    if ex is None:
        return False
    structured = (structured_catalog_by_name or {}).get(name) or {}
    structured_equipment = structured.get("equipment_names") or []
    eq = (ex.equipment or "").strip()
    if structured_equipment:
        if not tokens:
            return all(_matches_any(item, BODYWEIGHT_TOKENS) for item in structured_equipment)
        return all(
            _matches_any(item, BODYWEIGHT_TOKENS)
            or any(token in item.lower() or item in token for token in tokens)
            for item in structured_equipment
        )
    if not eq:
        return False
    return all(
        _matches_any(part, BODYWEIGHT_TOKENS) or any(token in part for token in tokens)
        for part in re.split(r"[,،+]| و ", eq)
        if part.strip()
    )


def available_equipment_tokens(student_equipment: dict | None) -> set[str] | None:
    """Return allowed Persian equipment tokens.

    ``None`` → no restriction (empty profile or full gym).
    ``set()`` → all flags present and false (bodyweight-only / no gym gear).
    non-empty set → only those tokens.
    """
    equipment = student_equipment or {}
    available = equipment.get("available_equipment")
    if isinstance(available, list) and available:
        selected = set(map(str, available))
        if "full_gym" in selected:
            return None
        if "bodyweight_only" in selected:
            return set()
        labels = {
            "dumbbell": "دمبل",
            "barbell": "هالتر",
            "cable": "کابل",
            "machines": "دستگاه",
            "machine": "دستگاه",
            "smith_machine": "اسمیت",
            "kettlebell": "کتل بل",
            "resistance_band": "کش",
            "bench_flat": "نیمکت صاف",
            "bench_adjustable": "نیمکت شیب‌دار",
            "pullup_bar": "میله بارفیکس",
        }
        return {labels[item] for item in selected if item in labels}
    if not equipment:
        return None
    if any(equipment.get(k) for k in EQUIPMENT_FULL_GYM_KEYS):
        return None
    any_flag_present = False
    tokens: set[str] = set()
    for key, token in EQUIPMENT_FLAG_TOKENS.items():
        if key in equipment:
            any_flag_present = True
            if equipment.get(key):
                tokens.add(token)
    if not any_flag_present:
        return None
    return tokens


def _alias_names(coach, names: set[str]) -> set[str]:
    if not names:
        return set()
    rows = ExerciseAlias.objects.filter(coach=coach, exercise__name__in=list(names))
    aliases = {row.alias for row in rows if row.alias}
    # Also map alias → canonical when selecting by alias string
    reverse = ExerciseAlias.objects.filter(coach=coach, alias__in=list(names))
    aliases |= {row.exercise.name for row in reverse if row.exercise_id}
    return aliases


def _historical_usage_map(coach, names: list[str]) -> dict[str, dict]:
    if not names:
        return {}
    rows = ExerciseHistoricalUsage.objects.filter(
        coach=coach, exercise__name__in=names
    ).select_related("exercise")
    out: dict[str, dict] = {}
    for row in rows:
        name = row.exercise.name
        bucket = out.setdefault(name, {"count": 0, "raw_prescription": None})
        bucket["count"] += 1
        if row.raw_prescription and not bucket["raw_prescription"]:
            bucket["raw_prescription"] = row.raw_prescription
    return out


def _candidate_names(
    *,
    muscle: str,
    catalog: dict[tuple[str, str], Exercise],
    structured_catalog_by_name: dict[str, dict],
    preferred_names: set[str],
    level: str,
    apply_catalog: bool,
    region_keys: set[str] | None = None,
) -> tuple[list[str], set[str]]:
    """Return ordered candidates and names sourced from the structured catalog."""
    strict_region = _has_structured_region_data(structured_catalog_by_name, muscle, region_keys)
    raw: list[str] = []
    from_structured: set[str] = set()
    structured = []
    if apply_catalog:
        structured = [
            (name, metadata)
            for name, metadata in structured_catalog_by_name.items()
            if matches_muscle(metadata, muscle)
            and (
                not region_keys
                or bool(set(metadata.get("region_keys") or []).intersection(region_keys))
            )
        ]
    structured.sort(
        key=lambda item: (
            0 if item[0] in preferred_names else 1,
            -int(item[1].get("priority") or 0),
            item[0],
        )
    )
    raw.extend(name for name, _metadata in structured)
    from_structured.update(name for name, _metadata in structured)
    for (pm, name), _ex in sorted(catalog.items(), key=lambda x: x[0][1]):
        if (
            matches_muscle(structured_catalog_by_name.get(name) or {"primary_muscle": pm}, muscle)
            and name not in from_structured
        ):
            if strict_region and not (
                name in structured_catalog_by_name
                and bool(
                    set(structured_catalog_by_name[name].get("region_keys") or []).intersection(
                        region_keys
                    )
                )
            ):
                continue
            if name in preferred_names:
                raw.insert(0, name)
            else:
                raw.append(name)
    return _unique(raw), from_structured


def _has_structured_region_data(
    structured_catalog_by_name: dict[str, dict],
    muscle: str,
    region_keys: set[str] | None,
) -> bool:
    if not region_keys:
        return False
    return any(
        matches_muscle(metadata, muscle) and bool(metadata.get("region_keys"))
        for metadata in structured_catalog_by_name.values()
    )


def _filter_candidates(
    *,
    names: list[str],
    forbidden: set[str],
    injury_alternative_map: dict[str, dict],
    level: str,
    apply_level: bool,
    catalog_by_name: dict[str, Exercise],
    pref_by_exercise_id: dict[str, CoachExercisePreference],
    equipment_tokens: set[str] | None,
    used: set[str],
    replacements_applied: list[dict],
    excluded_equipment: list[dict],
    muscle: str,
    structured_catalog_by_name: dict[str, dict] | None = None,
    excluded_reasons: list[dict] | None = None,
    excluded_catalog_by_name: dict[str, str] | None = None,
) -> list[str]:
    after: list[str] = []
    for name in names:
        if name in (excluded_catalog_by_name or {}):
            if excluded_reasons is not None:
                excluded_reasons.append(
                    {
                        "name": name,
                        "reason": (excluded_catalog_by_name or {}).get(name),
                    }
                )
            continue
        if name in used or _fuzzy_forbidden(name, used):
            continue
        is_forbidden = name in forbidden or _fuzzy_forbidden(name, forbidden)
        if is_forbidden:
            if excluded_reasons is not None:
                pref = (
                    pref_by_exercise_id.get(str(catalog_by_name[name].id))
                    if name in catalog_by_name
                    else None
                )
                excluded_reasons.append(
                    {
                        "name": name,
                        "reason": "coach_prohibited"
                        if pref and pref.is_prohibited
                        else "forbidden_rule",
                    }
                )
            rule_info = injury_alternative_map.get(name)
            replaced = False
            if rule_info:
                for alt in rule_info.get("alternatives") or []:
                    if (
                        not alt
                        or alt in used
                        or alt in forbidden
                        or _fuzzy_forbidden(alt, forbidden)
                    ):
                        continue
                    if alt in used or _fuzzy_forbidden(alt, used):
                        continue
                    after.append(alt)
                    replacements_applied.append(
                        {"from": name, "to": alt, "rule": rule_info.get("rule_name")}
                    )
                    replaced = True
                    break
            if not replaced:
                continue
            continue
        after.append(name)

    if apply_level:
        level_after = []
        for name in after:
            if _passes_level(
                name,
                level,
                catalog_by_name,
                pref_by_exercise_id,
                structured_catalog_by_name,
            ):
                level_after.append(name)
            elif excluded_reasons is not None:
                excluded_reasons.append({"name": name, "reason": "level_not_suitable"})
        after = level_after

    hard: list[str] = []
    dropped: list[str] = []
    for n in after:
        if _passes_equipment_hard(n, equipment_tokens, catalog_by_name, structured_catalog_by_name):
            hard.append(n)
        else:
            dropped.append(n)
    if dropped:
        excluded_equipment.append(
            {
                "muscle": muscle,
                "tokens": sorted(equipment_tokens) if equipment_tokens is not None else None,
                "excluded": dropped,
                "reverted": False,
            }
        )
    return hard


def _pick_for_roles(
    candidates: list[str],
    roles: list[str],
    muscle: str,
    *,
    preferred_names: set[str],
    historical_map: dict[str, dict],
    priority_boost: bool,
    variety_level: str = "stable",
    rng: random.Random | None = None,
    previous_names: set[str] | None = None,
    metadata_by_name: dict[str, dict] | None = None,
    weekly_roles: Counter | None = None,
    goal: str = "hypertrophy",
) -> list[str]:
    remaining = list(candidates)
    picked: list[str] = []

    def sort_key(n: str) -> tuple:
        return (
            0 if n in preferred_names else 1,
            0 if priority_boost else 1,
            -historical_map.get(n, {}).get("count", 0),
            n,
        )

    for role in roles:
        matched = [
            n
            for n in remaining
            if (
                muscle_key((metadata_by_name or {}).get(n, {}).get("primary_muscle_key"))
                == role.removeprefix("muscle:")
                if role.startswith("muscle:")
                else movement_role((metadata_by_name or {}).get(n, {})) == role
            )
        ]
        if not matched:
            if role.startswith("muscle:"):
                continue
            # A missing execution pattern stays unclassified; muscle matching remains explicit.
            if not remaining:
                break
            matched = list(remaining)
        if goal == "strength" and not picked:
            anchors = {
                "chest": {"push_horizontal"},
                "back": {"pull_horizontal", "pull_vertical"},
                "shoulders": {"push_vertical"},
                "quadriceps": {"knee_dominant"},
                "hamstrings": {"hip_hinge"},
            }.get(role.removeprefix("muscle:"), set())
            main = [
                name
                for name in matched
                if (metadata_by_name or {}).get(name, {}).get("movement_pattern") in anchors
            ]
            if main:
                matched = main
        matched.sort(key=sort_key)
        seen_roles = Counter(
            movement_role((metadata_by_name or {}).get(name, {})) for name in picked
        )
        # Weekly functional coverage precedes coach preference and seeded variety.
        # Stable selection still repeats once each available role has been covered.
        if weekly_roles is not None:
            coverage_order = {
                "shoulders": ["lateral", "rear_delt", "shoulder_press", "front_delt"],
                "back": ["horizontal_pull", "vertical_pull", "back_accessory"],
                "hamstrings": ["hinge", "knee_curl"],
                "core": ["core_stability", "core_flexion"],
            }.get(role.removeprefix("muscle:"), [])
            for required_role in coverage_order:
                eligible_role = [
                    name
                    for name in matched
                    if movement_role((metadata_by_name or {}).get(name, {})) == required_role
                ]
                if eligible_role and not weekly_roles[(muscle, required_role)]:
                    matched = eligible_role
                    break
            minimum_weekly = min(
                weekly_roles[(muscle, movement_role((metadata_by_name or {}).get(name, {})))]
                for name in matched
            )
            matched = [
                name
                for name in matched
                if weekly_roles[(muscle, movement_role((metadata_by_name or {}).get(name, {})))]
                == minimum_weekly
            ]
        minimum_seen = min(
            seen_roles[movement_role((metadata_by_name or {}).get(name, {}))] for name in matched
        )
        matched = [
            name
            for name in matched
            if seen_roles[movement_role((metadata_by_name or {}).get(name, {}))] == minimum_seen
        ]
        if variety_level in {"balanced", "varied"}:
            preferred_tier = matched[0] in preferred_names
            choice_pool = [name for name in matched if (name in preferred_names) == preferred_tier]
            novel = [name for name in choice_pool if name not in (previous_names or set())]
            if novel:
                choice_pool = novel
            if variety_level == "balanced":
                choice_pool = choice_pool[:3]
            choice = (rng or random).choice(choice_pool)
        else:
            choice = matched[0]
        picked.append(choice)
        if weekly_roles is not None:
            weekly_roles[(muscle, movement_role((metadata_by_name or {}).get(choice, {})))] += 1
        remaining = [n for n in remaining if n != choice]

    return picked


def _prescribe(
    *,
    name: str,
    muscle: str,
    level: str,
    sets: int,
    template: ProgramTemplate,
    exercise_index: int,
    historical_raw: str | None,
    coach=None,
    metadata: dict | None = None,
    goal: str = "hypertrophy",
    policy: dict | None = None,
) -> dict[str, Any]:
    policy = policy or coach_policy(coach)
    if goal == "strength":
        main = (metadata or {}).get("movement_pattern") in {
            "push_horizontal",
            "push_vertical",
            "pull_horizontal",
            "pull_vertical",
            "knee_dominant",
            "hip_hinge",
        } and (metadata or {}).get("mechanics") == "multi_joint"
        policy = {**policy, **policy["strength_prescriptions"]["main" if main else "accessory"]}
    timed = (metadata or {}).get("prescription_unit") == "seconds"
    reps = "30 ثانیه" if timed else f"{policy['reps_min']}-{policy['reps_max']}"
    return {
        "sets": sets,
        "reps": reps,
        "rest": f"{policy['rest_seconds']} ثانیه",
        "raw_prescription": f"{sets}×{reps}",
        "rpe": f"RIR {max(3 if level == 'beginner' else 1, policy['rir'])}",
    }


_ANTAGONIST_MUSCLE_PAIRS = {
    frozenset({"سینه", "زیربغل"}),
    frozenset({"جلو بازو", "پشت بازو"}),
    frozenset({"چهارسر ران", "همسترینگ"}),
    frozenset({"chest", "back"}),
    frozenset({"biceps", "triceps"}),
    frozenset({"quadriceps", "hamstrings"}),
}


def _canonical_muscle(value: str) -> str:
    aliases = {
        "پشت": "زیربغل",
        "back": "back",
        "لَت": "زیربغل",
        "lats": "back",
    }
    normalized = str(value or "").replace("‌", " ").strip().lower()
    return aliases.get(normalized, normalized)


def _superset_pair_allowed(
    first: dict,
    second: dict,
    *,
    pairing_mode: str,
    allow_compound: bool,
) -> bool:
    first_muscle = _canonical_muscle(first.get("targetMuscle", ""))
    second_muscle = _canonical_muscle(second.get("targetMuscle", ""))
    if not first_muscle or not second_muscle or "شکم" in {first_muscle, second_muscle}:
        return False

    first_class = movement_class(first)
    second_class = movement_class(second)
    if "unclassified" in {first_class, second_class}:
        return False
    if not allow_compound and "compound" in {first_class, second_class}:
        return False

    if pairing_mode == "same_muscle_isolation":
        return (
            first_muscle == second_muscle
            and first_class == "isolation"
            and second_class == "isolation"
        )
    if pairing_mode == "same_muscle":
        return first_muscle == second_muscle
    if pairing_mode == "antagonist":
        return frozenset({first_muscle, second_muscle}) in _ANTAGONIST_MUSCLE_PAIRS
    if pairing_mode == "any_eligible":
        return first_muscle != second_muscle or allow_compound
    return False


def _apply_real_supersets(
    day_exercises: list[dict],
    *,
    allow: bool,
    max_pairs: int = 1,
    pairing_mode: str = "same_muscle_isolation",
    allow_compound: bool = False,
    rest_between_exercises_seconds: int = 0,
    rest_after_pair_seconds: int = 90,
) -> None:
    """Pair consecutive exercises according to a structured coach strategy."""
    for ex in day_exercises:
        ex["supersetGroupId"] = None
        ex["supersetWithPrevious"] = False

    if not allow or max_pairs <= 0:
        return

    pairs_made = 0
    i = 0
    while i < len(day_exercises) - 1 and pairs_made < max_pairs:
        a = day_exercises[i]
        if a.get("supersetGroupId"):
            i += 1
            continue
        partner_index = next(
            (
                candidate_index
                for candidate_index in range(i + 1, len(day_exercises))
                if not day_exercises[candidate_index].get("supersetGroupId")
                and _superset_pair_allowed(
                    a,
                    day_exercises[candidate_index],
                    pairing_mode=pairing_mode,
                    allow_compound=allow_compound,
                )
            ),
            None,
        )
        if partner_index is not None:
            b = day_exercises.pop(partner_index)
            day_exercises.insert(i + 1, b)
            group_id = f"ss-{_stable_id(a['name'], b['name'], i)}"
            a["supersetGroupId"] = group_id
            a["supersetWithPrevious"] = False
            a["supersetPartnerName"] = b["name"]
            a["supersetRestBetweenSeconds"] = max(0, rest_between_exercises_seconds)
            a["supersetRestAfterSeconds"] = max(0, rest_after_pair_seconds)
            if not a.get("notes"):
                a["notes"] = f"سوپرست با {b['name']}"
            b["supersetGroupId"] = group_id
            b["supersetWithPrevious"] = True
            b["supersetPartnerName"] = a["name"]
            b["supersetRestBetweenSeconds"] = max(0, rest_between_exercises_seconds)
            b["supersetRestAfterSeconds"] = max(0, rest_after_pair_seconds)
            b["notes"] = f"سوپرست با {a['name']}"
            pairs_made += 1
            i += 2
            continue
        i += 1


def _attach_session_duration_evidence(days: list[dict], student: Any, evidence: dict) -> None:
    raw_duration = (student.training_conditions or {}).get("session_duration_minutes")
    try:
        duration = int(raw_duration)
    except (TypeError, ValueError):
        return
    if not 15 <= duration <= 180:
        return

    estimates = []
    for day in days:
        ungrouped_sets = 0
        grouped_sets: dict[str, int] = {}
        for exercise in day.get("exercises", []):
            sets = int(exercise.get("sets") or 0)
            group_id = exercise.get("supersetGroupId") or exercise.get("trainingGroupId")
            if group_id:
                grouped_sets[group_id] = max(grouped_sets.get(group_id, 0), sets)
            else:
                ungrouped_sets += sets
        estimated_minutes = day.get(
            "estimatedMinutes", (ungrouped_sets + sum(grouped_sets.values())) * 3
        )
        estimates.append(
            {
                "day_id": day.get("id"),
                "day_title": day.get("title", ""),
                "target_minutes": duration,
                "estimated_minutes": estimated_minutes,
                "over_target": estimated_minutes > duration,
            }
        )
    evidence["session_duration"] = {"target_minutes": duration, "days": estimates}
    evidence["session_duration_warnings"] = [
        {
            "day_id": item["day_id"],
            "message": (
                f"حجم «{item['day_title']}» حدود {item['estimated_minutes']} دقیقه برآورد می‌شود؛ "
                f"زمان اعلام‌شده {item['target_minutes']} دقیقه است. حجم جلسه را بازبینی کنید."
            ),
        }
        for item in estimates
        if item["over_target"]
    ]


def _full_body_muscles(
    days_per_week: int, priority_order: list[str], volume_plan: dict | None = None
) -> list[list[str]]:
    """Create a usable auto split, then repeat coach-priority muscles as needed."""
    priority_labels = [normalize_muscle(m) for m in priority_order]
    base = _unique(priority_labels + ["سینه", "زیربغل", "پا", "سرشانه", "شکم"])
    upper = _unique(
        ["سینه", "زیربغل", "سرشانه", "پشت بازو", "جلو بازو", "کول", "ساعد"]
        + [
            muscle
            for muscle in base
            if muscle not in {"پا", "شکم", "ساق", "چهارسر ران", "پشت پا", "باسن"}
        ]
    )
    lower = ["چهارسر ران", "پشت پا", "باسن", "ساق", "شکم"]
    push = ["سینه", "سرشانه", "پشت بازو"]
    pull = ["زیربغل", "جلو بازو", "کول", "ساعد"]
    legs = ["چهارسر ران", "پشت پا", "باسن", "ساق", "شکم"]

    if days_per_week <= 3:
        sessions = [list(base) for _ in range(days_per_week)]
    elif days_per_week == 4:
        sessions = [upper, lower, upper, lower]
    elif days_per_week == 5:
        sessions = [upper, lower, push, pull, legs]
    else:
        sessions = [push, pull, legs] * 2
        if days_per_week == 7:
            sessions.append(list(base))
        sessions = sessions[:days_per_week]
    sessions = [_unique(row) for row in sessions]

    if not volume_plan:
        return sessions

    for key, row in volume_plan["muscles"].items():
        if row.get("decision_source") != "coach" or row.get("decision") == "balanced":
            continue
        requested_frequency = max(2, math.ceil(row["target"] / max(1, row["session_cap"])))
        required_frequency = min(days_per_week, requested_frequency)
        current = sum(
            any(_session_covers_muscle(label, key) for label in session) for session in sessions
        )
        while current < required_frequency:
            candidates = [
                index
                for index, session in enumerate(sessions)
                if not any(_session_covers_muscle(label, key) for label in session)
            ]
            if not candidates:
                break
            chosen = min(candidates, key=lambda index: (len(sessions[index]), index))
            sessions[chosen].append(MUSCLE_NAMES.get(key, key))
            current += 1
    return sessions


def _session_covers_muscle(label: str, key: str) -> bool:
    normalized = normalize_muscle(label)
    if normalized == "پا":
        return key in {"quadriceps", "hamstrings", "glutes", "calves"}
    return muscle_key(normalized) == key or normalized == normalize_muscle(
        MUSCLE_NAMES.get(key, key)
    )


def build_training_days(
    *,
    coach,
    student,
    template: ProgramTemplate,
    level: str,
    days_per_week: int,
    apply_level: bool,
    apply_muscle: bool,
    apply_catalog: bool,
    apply_general: bool,
    catalog: dict[tuple[str, str], Exercise],
    catalog_by_name: dict[str, Exercise],
    structured_catalog_by_name: dict[str, dict],
    excluded_catalog_by_name: dict[str, str],
    pref_by_exercise_id: dict[str, CoachExercisePreference],
    forbidden: set[str],
    injury_alternative_map: dict[str, dict],
    level_rule: LevelRule | None,
    muscle_decisions: dict[str, str],
    goals_override: str,
    warnings: list[str],
    target_muscle: str = "",
    target_region: str = "",
    target_exercise_count: int | None = None,
    selected_training_systems: list[dict] | None = None,
    exercise_variety: str = "stable",
    selection_seed: str = "",
    avoid_exercise_names: list[str] | None = None,
    catalog_only: bool = False,
) -> tuple[list[dict], dict]:
    if template.execution_plan:
        from programming.services.template_execution import build_template_days

        if any(value != "balanced" for value in muscle_decisions.values()):
            raise ValidationError(
                {
                    "muscle_decisions": [
                        "برای اعمال تصمیم عضلانی ویزیت، قالب دقیق را روی بدون قالب بگذارید."
                    ]
                }
            )
        days, evidence = build_template_days(
            coach=coach,
            student=student,
            template=template,
            level=level,
            catalog_by_name=catalog_by_name,
            structured_catalog_by_name=structured_catalog_by_name,
            excluded_catalog_by_name=excluded_catalog_by_name,
            pref_by_exercise_id=pref_by_exercise_id,
            forbidden=forbidden,
            injury_alternative_map=injury_alternative_map,
        )
        from programming.services.execution import compile_execution

        compile_execution(days)
        _attach_session_duration_evidence(days, student, evidence)
        policy = coach_policy(coach)
        plan = build_volume_plan(
            policy,
            level,
            (student.goals or {}).get("primary_goal", "hypertrophy"),
            {muscle_key(value): "focus" for value in template.muscle_priority_order},
        )
        audit, issues = audit_volume(days, plan, policy, student)
        evidence.update(volume_plan=plan, volume_audit=audit, generation_policy=policy)
        warnings.extend(issues)
        return days, evidence
    equipment_tokens = available_equipment_tokens(student.equipment)
    goals = student.goals or {}
    policy = coach_policy(coach)
    raw_region_inputs = [target_muscle, target_region]
    region_aliases = {
        "upper_chest": "upper_chest",
        "upper chest": "upper_chest",
        "بالاسینه": "upper_chest",
        "بالا سینه": "upper_chest",
        "mid_chest": "mid_chest",
        "mid chest": "mid_chest",
        "بخش میانی سینه": "mid_chest",
        "lower_chest": "lower_chest",
        "lower chest": "lower_chest",
        "پایین سینه": "lower_chest",
        "whole_chest": "whole_chest",
        "whole chest": "whole_chest",
        "کل سینه": "whole_chest",
        "inner_chest": "inner_chest",
        "inner chest": "inner_chest",
        "داخل سینه": "inner_chest",
        "inner_upper_chest": "inner_upper_chest",
        "inner upper chest": "inner_upper_chest",
        "داخل بالاسینه": "inner_upper_chest",
        "داخل بالا سینه": "inner_upper_chest",
        "inner_lower_chest": "inner_lower_chest",
        "inner lower chest": "inner_lower_chest",
        "داخل زیرسینه": "inner_lower_chest",
        "داخل زیر سینه": "inner_lower_chest",
    }
    structured_region_filters: dict[str, set[str]] = {}
    for raw_value in raw_region_inputs:
        key = region_aliases.get(str(raw_value).strip().lower())
        if key:
            structured_region_filters.setdefault("سینه", set()).add(key)
        region = (
            MuscleRegion.objects.select_related("muscle")
            .filter(is_active=True, muscle__is_active=True)
            .filter(Q(key__iexact=str(raw_value).strip()) | Q(name__iexact=str(raw_value).strip()))
            .first()
        )
        if region:
            group = TAXONOMY_MUSCLE_GROUPS.get(
                region.muscle.key, normalize_muscle(region.muscle.name)
            )
            structured_region_filters.setdefault(group, set()).add(region.key)
    if target_region and target_muscle:
        canonical_target = normalize_muscle(target_muscle)
        normalized_region = region_aliases.get(str(target_region).strip().lower())
        target_muscle_row = (
            MuscleTaxonomy.objects.filter(is_active=True)
            .filter(Q(key__iexact=target_muscle.strip()) | Q(name__iexact=target_muscle.strip()))
            .first()
        )
        if target_muscle_row:
            canonical_target = TAXONOMY_MUSCLE_GROUPS.get(
                target_muscle_row.key, normalize_muscle(target_muscle_row.name)
            )
            target_region_row = (
                MuscleRegion.objects.filter(muscle=target_muscle_row, is_active=True)
                .filter(
                    Q(key__iexact=target_region.strip())
                    | Q(name__iexact=target_region.strip())
                    | Q(name_en__iexact=target_region.strip())
                )
                .first()
            )
            if target_region_row:
                normalized_region = target_region_row.key
        if normalized_region:
            structured_region_filters.setdefault(canonical_target, set()).add(normalized_region)
    observed_weak = {normalize_muscle(m) for m in (goals.get("weak_muscles") or [])}
    weak: set[str] = set()
    effective_decisions = {
        muscle_key(key): value for key, value in muscle_decisions.items() if key in MUSCLE_NAMES
    }
    for value in template.muscle_priority_order or []:
        key = muscle_key(value)
        if key in MUSCLE_NAMES:
            effective_decisions.setdefault(key, "focus")
    priority = {
        normalize_muscle(MUSCLE_NAMES[key])
        for key, value in effective_decisions.items()
        if value == "focus" and key in MUSCLE_NAMES
    }
    strong = {normalize_muscle(m) for m in (goals.get("strong_muscles") or [])}
    volume_plan = build_volume_plan(
        policy, level, goals.get("primary_goal", "hypertrophy"), effective_decisions
    )

    preferred_names: set[str] = set()
    for pref in pref_by_exercise_id.values():
        if pref.is_preferred or int(pref.priority or 0) > 0:
            preferred_names.add(pref.exercise.name)
        if pref.exercise.name in structured_catalog_by_name:
            structured_catalog_by_name[pref.exercise.name]["priority"] = int(pref.priority or 0)

    try:
        parsed = parse_template_split(template.split, days_per_week=days_per_week)
    except ValueError as exc:
        warnings.append(f"split_parse_error:{exc}")
        parsed = [(f"روز {i + 1}", []) for i in range(days_per_week)]

    # Resolve empty (full-body) labels.
    if any(not muscles for _, muscles in parsed):
        decision_labels = [
            MUSCLE_NAMES[key]
            for key, value in effective_decisions.items()
            if value != "balanced" and key in MUSCLE_NAMES
        ]
        fb = _full_body_muscles(
            days_per_week,
            decision_labels + list(template.muscle_priority_order or []),
            volume_plan,
        )
        resolved: list[tuple[str, list[str]]] = []
        for i, (title, muscles) in enumerate(parsed):
            resolved.append((title, muscles or fb[i]))
        parsed = resolved

    decision_frequency = {}
    volume_plan["required_muscles"] = [
        key
        for key in volume_plan["muscles"]
        if any(_session_covers_muscle(label, key) for _, groups in parsed for label in groups)
    ]
    for key, row in volume_plan["muscles"].items():
        frequency = sum(
            any(_session_covers_muscle(label, key) for label in groups) for _, groups in parsed
        )
        row["preferred_target"] = row["target"]
        if frequency:
            row["target"] = min(row["target"], frequency * row["session_cap"])
    for key, row in volume_plan["muscles"].items():
        if row.get("decision_source") != "coach" or row.get("decision") == "balanced":
            continue
        required = min(
            days_per_week, max(2, math.ceil(row["minimum"] / max(1, row["session_cap"])))
        )
        actual = sum(
            any(_session_covers_muscle(label, key) for label in groups) for _, groups in parsed
        )
        decision_frequency[key] = {"required": required, "scheduled": actual}
        if actual < required:
            warnings.append(f"muscle_decision_split_shortfall:{key}:{actual}/{required}")

    # Cross-day muscle overlap is allowed only when split explicitly repeats a muscle.
    # (No round-robin injection.)

    used: set[str] = set()
    used |= _alias_names(coach, used)
    base_sets = policy["sets"]
    selection_rng = random.Random(str(selection_seed or ""))
    previous_names: set[str] = set(avoid_exercise_names or [])
    previous_program = (
        student.programs.filter(active_version__isnull=False).order_by("-updated_at").first()
    )
    if previous_program:
        for previous_day in (previous_program.active_version.training or {}).get("days", []):
            previous_names.update(
                item.get("name", "") for item in previous_day.get("exercises", [])
            )

    days: list[dict] = []
    evidence = {
        "weak_muscles": sorted(weak),
        "observed_weak_muscles": sorted(observed_weak),
        "generation_policy": policy,
        "prescription_version": 2,
        "priority_muscles": sorted(priority),
        "strong_muscles": sorted(strong),
        "coach_muscle_decisions": effective_decisions,
        "muscle_decision_frequency": decision_frequency,
        "selected_due_to_preference": [],
        "selected_due_to_historical_signal": [],
        "excluded_due_to_injury": [],
        "excluded_due_to_forbidden": [],
        "excluded_due_to_equipment": [],
        "replacements_applied": [],
        "preferred_selected": [],
        "historical_selected": [],
        "equipment_filters": [],
        "split_resolved": [{"title": t, "muscles": m} for t, m in parsed],
        "structured_catalog_selected": [],
        "structured_catalog_excluded": [],
        "techniques": [],
        "exercise_variety": exercise_variety,
    }

    structured_technique_evidence: list[dict] = []
    weekly_roles = Counter()
    allowed_technique_names = set(level_rule.allowed_techniques or []) if level_rule else set()

    for index, (day_title, target_muscles) in enumerate(parsed):
        # Repeating a muscle across sessions is intentional; dedupe inside each session.
        used = set()
        day_exercises: list[dict] = []
        demands_by_key: dict[str, dict] = {}
        demand_order = 0
        for muscle in target_muscles:
            candidates, from_structured = _candidate_names(
                muscle=muscle,
                catalog=catalog,
                structured_catalog_by_name=structured_catalog_by_name,
                preferred_names=preferred_names,
                level=level,
                apply_catalog=apply_catalog,
                region_keys=(structured_region_filters or {}).get(muscle),
            )
            if catalog_only:
                candidates = [name for name in candidates if name in catalog_by_name]
            excluded_catalog_reasons: list[dict] = []
            region_filter = (structured_region_filters or {}).get(muscle) or set()
            if region_filter:
                for name, metadata in structured_catalog_by_name.items():
                    if normalize_muscle(str(metadata.get("primary_muscle") or "")) != muscle:
                        continue
                    if not set(metadata.get("region_keys") or []).intersection(region_filter):
                        excluded_catalog_reasons.append(
                            {"name": name, "reason": "target_region_mismatch"}
                        )
            filtered = _filter_candidates(
                names=candidates,
                forbidden=forbidden,
                injury_alternative_map=injury_alternative_map,
                level=level,
                apply_level=apply_level,
                catalog_by_name=catalog_by_name,
                pref_by_exercise_id=pref_by_exercise_id,
                equipment_tokens=equipment_tokens,
                used=used,
                replacements_applied=evidence["replacements_applied"],
                excluded_equipment=evidence["equipment_filters"],
                muscle=muscle,
                structured_catalog_by_name=structured_catalog_by_name,
                excluded_reasons=excluded_catalog_reasons,
                excluded_catalog_by_name=excluded_catalog_by_name,
            )
            evidence["structured_catalog_excluded"].extend(excluded_catalog_reasons)
            if catalog_only:
                filtered = [name for name in filtered if name in catalog_by_name]
            if not filtered:
                warnings.append(f"missing_exercise_candidates:{muscle}")
                continue

            keys = list(
                dict.fromkeys(
                    muscle_key(
                        structured_catalog_by_name[name].get("primary_muscle_key")
                        or structured_catalog_by_name[name].get("primary_muscle")
                    )
                    for name in filtered
                )
            )
            for key in keys:
                if key not in volume_plan["muscles"]:
                    continue
                key_candidates = [
                    name
                    for name in filtered
                    if muscle_key(
                        structured_catalog_by_name[name].get("primary_muscle_key")
                        or structured_catalog_by_name[name].get("primary_muscle")
                    )
                    == key
                ]
                if not key_candidates:
                    continue
                row = volume_plan["muscles"][key]
                sample = structured_catalog_by_name[key_candidates[0]]
                frequency = max(
                    1,
                    sum(
                        any(matches_muscle(sample, group) for group in groups)
                        for _, groups in parsed
                    ),
                )
                per_session = min(row["session_cap"], (row["target"] + frequency - 1) // frequency)
                desired = max(1, (per_session + base_sets - 1) // base_sets)
                desired = min(3, desired, len(key_candidates))
                explicit_count = bool(
                    target_exercise_count
                    and target_muscle
                    and normalize_muscle(target_muscle)
                    in {normalize_muscle(muscle), normalize_muscle(MUSCLE_NAMES.get(key, key))}
                )
                if explicit_count:
                    desired = min(len(key_candidates), max(1, target_exercise_count))
                demand = demands_by_key.get(key)
                if demand is None:
                    demand_order += 1
                    demand = {
                        "muscle_key": key,
                        "muscle": muscle,
                        "names": [],
                        "from_structured": set(),
                        "desired": desired,
                        "per_session_sets": per_session,
                        "available": 0,
                        "priority": key in priority or key in weak or row["priority"],
                        "order": demand_order,
                        "explicit_count": explicit_count,
                    }
                    demands_by_key[key] = demand
                else:
                    demand["desired"] = max(demand["desired"], desired)
                    demand["per_session_sets"] = max(demand["per_session_sets"], per_session)
                    demand["priority"] = demand["priority"] or key in priority or key in weak
                    demand["explicit_count"] = demand["explicit_count"] or explicit_count
                demand["names"] = _unique(demand["names"] + key_candidates)
                demand["from_structured"].update(
                    name for name in key_candidates if name in from_structured
                )
                demand["available"] = len(demand["names"])

        duration = (student.training_conditions or {}).get("session_duration_minutes")
        try:
            duration = int(duration or coach.default_session_minutes or 60)
        except (TypeError, ValueError):
            duration = int(coach.default_session_minutes or 60)
        session_plan = plan_session_exercise_counts(
            list(demands_by_key.values()), duration, base_sets, policy
        )
        evidence.setdefault("session_planning", []).append(
            {
                "day_index": index + 1,
                "target_minutes": duration,
                "exercise_slot_budget": session_plan["slot_budget"],
                "selected_exercises": session_plan["selected_count"],
                "eligible_primary_muscles": list(demands_by_key),
                "uncovered_muscles": session_plan["uncovered_muscles"],
                "coverage_over_slot_budget": session_plan["coverage_over_slot_budget"],
            }
        )
        for key in session_plan["uncovered_muscles"]:
            warnings.append(f"session_muscle_uncovered_due_to_time:{index + 1}:{key}")

        for key, demand in demands_by_key.items():
            count = session_plan["selected_counts"].get(key, 0)
            candidates = [
                name
                for name in demand["names"]
                if name not in used and not _fuzzy_forbidden(name, used)
            ]
            historical_map = _historical_usage_map(coach, candidates)
            picked = _pick_for_roles(
                candidates,
                [f"muscle:{key}"] * count,
                demand["muscle"],
                preferred_names=preferred_names,
                historical_map=historical_map,
                priority_boost=demand["priority"],
                variety_level=exercise_variety,
                rng=selection_rng,
                previous_names=previous_names,
                metadata_by_name=structured_catalog_by_name,
                weekly_roles=weekly_roles,
                goal=goals.get("primary_goal", "hypertrophy"),
            )
            for idx, name in enumerate(picked):
                used.add(name)
                used |= _alias_names(coach, {name})
                ex_ref = catalog_by_name.get(name)
                if ex_ref is None:
                    raise ValidationError(
                        {"catalog": ["حرکت انتخاب‌شده در کاتالوگ مربی وجود ندارد."]}
                    )
                sets = base_sets
                hist = historical_map.get(name) or {}
                rx = _prescribe(
                    name=name,
                    muscle=demand["muscle"],
                    level=level,
                    sets=sets,
                    template=template,
                    exercise_index=idx,
                    historical_raw=hist.get("raw_prescription"),
                    coach=coach,
                    metadata=structured_catalog_by_name.get(name),
                    goal=goals.get("primary_goal", "hypertrophy"),
                    policy=policy,
                )
                selection_source = "coach_catalog"
                if name in demand["from_structured"]:
                    selection_source = "coach_structured_catalog"
                    metadata = structured_catalog_by_name.get(name) or {}
                    evidence["structured_catalog_selected"].append(
                        {
                            "exercise_id": str(ex_ref.id) if ex_ref else None,
                            "name": name,
                            "source": "coach_catalog",
                            "reason": "active_owner_level_region_equipment_match",
                            "primary_muscle": metadata.get("primary_muscle"),
                            "regions": list(metadata.get("region_keys") or []),
                            "levels": list(metadata.get("levels") or []),
                        }
                    )
                if name in preferred_names:
                    evidence["selected_due_to_preference"].append(name)
                    evidence["preferred_selected"].append(name)
                    if selection_source == "coach_catalog":
                        selection_source = "preference"
                if hist.get("count"):
                    evidence["selected_due_to_historical_signal"].append(
                        {"name": name, "count": hist["count"]}
                    )
                    evidence["historical_selected"].append({"name": name, "count": hist["count"]})

                day_exercises.append(
                    {
                        "id": f"{index + 1}-{demand['muscle']}-{idx + 1}-{_stable_id(name)}",
                        "order": 0,
                        "name": name,
                        "exercise_id": str(ex_ref.id) if ex_ref else None,
                        "tutorial_url": "",
                        "execution_guide": ex_ref.execution_guide if ex_ref else {},
                        "display_name": name,
                        "targetMuscle": demand["muscle"],
                        "sets": rx["sets"],
                        "reps": rx["reps"],
                        "rest": rx["rest"],
                        "rpe": rx["rpe"],
                        "tempo": "",
                        "raw_prescription": rx["raw_prescription"],
                        "prescription": {
                            "sets": rx["sets"],
                            "reps_text": rx["reps"],
                            "raw_prescription": rx["raw_prescription"],
                        },
                        "notes": (
                            "وقتی همهٔ ست‌ها به سقف تکرار رسیدند و RIR و فرم حفظ شد، جلسهٔ بعد کوچک‌ترین افزایش وزنهٔ در دسترس را اعمال کنید؛ در غیر این صورت همان وزنه را نگه دارید."
                            if policy["progression"] == "double_progression"
                            else "وزنه و تکرار را با حفظ فرم و RIR نگه دارید."
                        ),
                        "replacement_notes": "",
                        "selection_source": selection_source,
                        "catalog_source": "coach",
                        "exercise_snapshot": (exercise_snapshot(ex_ref) if ex_ref else None),
                        "supersetGroupId": None,
                        "supersetWithPrevious": False,
                        "supersetPartnerName": None,
                    }
                )

        # Session order: compound → secondary → isolation → arms → core
        day_exercises.sort(
            key=lambda ex: (
                {"compound": 0, "isolation": 2, "core": 4}.get(movement_class(ex), 3),
                0 if ex["targetMuscle"] in priority | weak else 1,
                ex["name"],
            )
        )
        # Keep same-muscle arms adjacent so real supersets can pair.
        arm_block = [e for e in day_exercises if e["targetMuscle"] in ARM_MUSCLES]
        non_arm = [e for e in day_exercises if e["targetMuscle"] not in ARM_MUSCLES]
        core_block = [e for e in non_arm if e["targetMuscle"] in CORE_MUSCLES]
        main_block = [e for e in non_arm if e["targetMuscle"] not in CORE_MUSCLES]
        day_exercises = main_block + arm_block + core_block

        for i, ex in enumerate(day_exercises):
            ex["order"] = i + 1

        days.append(
            {
                "id": f"day-{index + 1}-{_stable_id(template.id, index, day_title)}",
                "order": index + 1,
                "title": day_title,
                "targetMuscles": target_muscles,
                "notes": (
                    "حرکات اصلی اول جلسه؛ شکم و اصلاحی در انتها."
                    if any(m in CORE_MUSCLES for m in target_muscles)
                    else "فرم صحیح و کنترل دامنه حرکت اولویت دارد."
                ),
                "exercises": day_exercises,
                "volumeBudget": sum(item["sets"] for item in day_exercises),
            }
        )

    from programming.services.techniques import apply_structured_techniques

    days, structured_technique_evidence, _handled = apply_structured_techniques(
        days,
        coach,
        level,
        allowed_names=allowed_technique_names,
        selected_systems=selected_training_systems,
    )
    evidence["techniques"] = structured_technique_evidence
    evidence["required_system_keys"] = (
        sorted({row["key"] for row in structured_technique_evidence})
        if selected_training_systems
        else []
    )
    # Technique costs and group rests are part of the same time budget as solo work.
    # Explicit recipe set counts remain fixed during allocation.
    days = allocate_volume(days, volume_plan, policy, student, warnings)
    from programming.services.execution import compile_execution

    evidence["system_warnings"] = [
        f"training_system_unapplied:{row.get('name') or row.get('key') or row.get('technique_id', '')}:{row['status']}"
        for row in structured_technique_evidence
        if row.get("status") != "applied"
    ]
    warnings.extend(evidence["system_warnings"])
    volume_audit, volume_warnings = audit_volume(days, volume_plan, policy, student)
    evidence["volume_plan"] = volume_plan
    evidence["volume_audit"] = volume_audit
    warnings.extend(volume_warnings)
    actual_roles = {
        key: Counter(
            movement_role(exercise["exercise_snapshot"])
            for day in days
            for exercise in day["exercises"]
            if muscle_key(exercise["exercise_snapshot"].get("primary_muscle_key")) == key
        )
        for key in volume_plan["required_muscles"]
    }
    evidence["movement_coverage"] = {key: dict(counts) for key, counts in actual_roles.items()}
    for key, expected in {
        "shoulders": {"lateral", "rear_delt"},
        "back": {"horizontal_pull", "vertical_pull"},
    }.items():
        if key in actual_roles:
            warnings.extend(
                f"movement_coverage_missing:{key}:{role}"
                for role in sorted(expected - actual_roles[key].keys())
            )
    for day in days:
        for exercise in day["exercises"]:
            sets = int(exercise["sets"])
            reps = str(exercise["reps"])
            exercise["raw_prescription"] = f"{sets}×{reps}"
            exercise["prescription"] = {
                "version": 2,
                "sets": sets,
                "reps_text": reps,
                "raw_prescription": exercise["raw_prescription"],
                "set_plan": [
                    {
                        "set": n + 1,
                        "reps_text": reps,
                        "rest": exercise["rest"],
                        "effort": exercise["rpe"],
                    }
                    for n in range(sets)
                ],
                "progression": policy["progression"],
            }
    compile_execution(days)
    evidence["weekly_primary_sets"] = volume_audit["direct_sets"]

    if goals_override and days:
        days[0]["notes"] = f"{days[0]['notes']} اهداف: {goals_override}"

    # Deduplicate evidence lists
    evidence["selected_due_to_preference"] = _unique(evidence["selected_due_to_preference"])
    evidence["preferred_selected"] = _unique(evidence["preferred_selected"])
    selected_seen: set[str] = set()
    selected_catalog = []
    for item in evidence["structured_catalog_selected"]:
        name = item.get("name")
        if name in selected_seen:
            continue
        selected_seen.add(name)
        selected_catalog.append(item)
    evidence["structured_catalog_selected"] = selected_catalog
    _attach_session_duration_evidence(days, student, evidence)
    return days, evidence
