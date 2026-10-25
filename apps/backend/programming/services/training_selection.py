"""Split-driven training day construction for rules_v1.

Owns muscle coverage, per-session dedupe, volume bias, hard equipment filter,
prescription variation, and session ordering. Injury/forbidden sets are
provided by the caller (generator orchestration).
"""

from __future__ import annotations

import hashlib
import random
import re
from typing import Any

from django.db.models import Q
from rest_framework.exceptions import ValidationError

from accounts.generation_policy import coach_policy
from accounts.models import (
    CoachExercisePreference,
    CoachTechnique,
    Exercise,
    ExerciseAlias,
    ExerciseHistoricalUsage,
    LevelRule,
    MusclePriority,
    MuscleRegion,
    MuscleTaxonomy,
    ProgramTemplate,
)
from programming.services.split_parser import (
    TAXONOMY_MUSCLE_GROUPS,
    normalize_muscle,
    parse_template_split,
)
from programming.services.style_calibration import (
    day_style_target,
    session_set_target,
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

ROLE_PATTERNS: dict[str, tuple[str, ...]] = {
    "compound_press": (
        "پرس سینه تخت",
        "پرس سینه هالتر",
        "پرس سینه دمبل",
        "پرس سینه دستگاه",
        "chest press",
        "bench",
    ),
    "incline": ("بالا سینه", "بالاسینه", "incline", "بالایی", "پرس بالا"),
    "chest_accessory": ("کراس", "قفسه", "فلای", "pec deck", "پروانه"),
    "vertical_pull": ("لت", "بارفیکس", "pulldown", "pull-down", "pull up", "pullup"),
    "horizontal_pull": ("روئینگ", "قایق", "row", "خم", "تی بار", "t-bar"),
    "back_accessory": ("پول اور", "pullover", "straight arm", "تک‌خم", "تک خم"),
    "quad": ("اسکوات", "اسکات", "پرس پا", "جلوپا", "جلو پا", "لانج", "لunge", "هاک"),
    "hinge": ("ددلیفت", "رومانی", "rdl", "پشت پا", "leg curl", "good morning"),
    "leg_accessory": ("ساق", "adductor", "abductor", "hip thrust", "پشت ران", "هیپ تراست"),
    "calf": ("ساق", "calf"),
    "shoulder_press": ("پرس سرشانه", "پرس نظامی", "shoulder press", "overhead press"),
    "lateral": ("نشر جانب", "lateral raise", "نشر از جانب"),
    "rear_delt": ("فیس پول", "face pull", "نشر خم", "rear delt", "خلفی", "نشر از جلو"),
    "triceps": ("پشت بازو", "دیپ", "فرانسوی", "kickback", "triceps", "پوش داون", "پوشدان"),
    "biceps": ("جلو بازو", "جلوبازو", "چکش", "bicep", "چکشی", "لاری"),
    "core_flexion": ("کرانچ", "crunch", "sit-up", "شکم سیم", "زیرشکم"),
    "core_stability": ("پلانک", "plank", "اصلاحی", "dead bug", "چرخش", "تنه"),
    "core": ("شکم", "کرانچ", "پلانک", "زیرشکم", "اصلاحی", "crunch", "plank", "dead bug"),
    "forearm": ("ساعد", "مچ", "wrist", "forearm"),
}

MUSCLE_ROLES: dict[str, list[str]] = {
    "سینه": ["compound_press", "incline", "chest_accessory"],
    "زیربغل": ["vertical_pull", "horizontal_pull", "back_accessory"],
    "پا": ["quad", "hinge", "quad", "calf"],
    "سرشانه": ["shoulder_press", "lateral", "rear_delt"],
    "پشت بازو": ["triceps", "triceps"],
    "جلو بازو": ["biceps", "biceps"],
    "شکم": ["core_flexion", "core_stability"],
    "ساق": ["calf"],
    "ساعد": ["forearm"],
}

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


def _role_of_name(name: str, muscle: str) -> str:
    roles = MUSCLE_ROLES.get(muscle, [])
    for role in roles:
        patterns = ROLE_PATTERNS.get(role, ())
        if patterns and _matches_any(name, patterns):
            return role
    if muscle in CORE_MUSCLES or _matches_any(name, ROLE_PATTERNS["core"]):
        if _matches_any(name, ROLE_PATTERNS["core_stability"]):
            return "core_stability"
        return "core_flexion"
    if muscle in ARM_MUSCLES:
        return "isolation"
    if _matches_any(name, ("پرس", "اسکوات", "اسکات", "ددلیفت", "بارفیکس", "روئینگ", "لت")):
        return "compound"
    return "accessory"


def _movement_class(name: str, muscle: str) -> str:
    if _matches_any(name, ("جلوپا", "جلو پا", "پشت پا", "leg curl", "leg extension")):
        return "isolation"
    role = _role_of_name(name, muscle)
    if role.startswith("core") or muscle in CORE_MUSCLES:
        return "core"
    if muscle in ARM_MUSCLES or role in {
        "triceps",
        "biceps",
        "lateral",
        "rear_delt",
        "calf",
        "chest_accessory",
    }:
        return "isolation"
    if role in {
        "compound_press",
        "incline",
        "vertical_pull",
        "horizontal_pull",
        "quad",
        "hinge",
        "shoulder_press",
    }:
        return "compound"
    return "accessory"


def _session_rank(name: str, muscle: str) -> tuple[int, int, str]:
    movement = _movement_class(name, muscle)
    if movement == "compound":
        group = 0
    elif muscle in ARM_MUSCLES:
        group = 3
    elif movement == "core" or muscle in CORE_MUSCLES:
        group = 4
    elif movement == "isolation":
        group = 2
    else:
        group = 1
    return (group, 0 if muscle not in ARM_MUSCLES | CORE_MUSCLES else 1, name)


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
        # Unknown catalog entry: allow only when no explicit equipment tokens required,
        # or treat as bodyweight-friendly string heuristics.
        return _name_looks_bodyweight(name) if not tokens else _name_matches_tokens(name, tokens)
    structured = (structured_catalog_by_name or {}).get(name) or {}
    structured_equipment = structured.get("equipment_names") or []
    eq = (ex.equipment or "").strip()
    if structured_equipment:
        if not tokens:
            return any(_matches_any(item, BODYWEIGHT_TOKENS) for item in structured_equipment)
        return any(
            any(token in item.lower() or item in token for token in tokens)
            for item in structured_equipment
        )
    if not eq or any(t in eq.lower() or t in eq for t in BODYWEIGHT_TOKENS):
        return True
    if not tokens:
        # Explicit all-false: reject machine/dumbbell/barbell/cable tagged work.
        return False
    return any(t == eq or t in eq or eq in t for t in tokens)


def _name_looks_bodyweight(name: str) -> bool:
    return _matches_any(name, ("پلانک", "کرانچ", "بارفیکس", "شنا", "دیپ", "اصلاحی"))


def _name_matches_tokens(name: str, tokens: set[str]) -> bool:
    return any(t in name for t in tokens)


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
            "resistance_band": "کش",
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
            if normalize_muscle(str(metadata.get("primary_muscle") or "")) == muscle
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
        if normalize_muscle(pm) == muscle and name not in from_structured:
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
        normalize_muscle(str(metadata.get("primary_muscle") or "")) == muscle
        and bool(metadata.get("region_keys"))
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
        patterns = ROLE_PATTERNS.get(role, ())
        matched = [n for n in remaining if patterns and _matches_any(n, patterns)]
        if not matched:
            # Role unmet: take best remaining general candidate.
            if not remaining:
                break
            matched = list(remaining)
        matched.sort(key=sort_key)
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
        remaining = [n for n in remaining if n != choice]

    return picked


def _roles_for_muscle(
    muscle: str,
    *,
    weak: set[str],
    priority: set[str],
    strong: set[str],
    style_count: tuple[int, int] | None,
    volume_text: str,
) -> list[str]:
    """Build role slots capped by coach style-profile exercise count targets."""
    roles = list(MUSCLE_ROLES.get(muscle, ["accessory"]))
    lo, hi = style_count or (len(roles), len(roles))

    if muscle == "سینه":
        # main + incline + accessory; optional isolation only when weak and budget allows
        roles = ["compound_press", "incline", "chest_accessory"]
        if muscle in weak and hi >= 4:
            roles.append("chest_accessory")
        roles = roles[: max(lo, min(hi, 4 if muscle in weak | priority else 3))]
    elif muscle == "زیربغل":
        roles = ["vertical_pull", "horizontal_pull", "back_accessory"]
        if "متوسط" in (volume_text or "") or "زیاد" in (volume_text or "") or hi >= 4:
            roles.append("back_accessory")
        roles = roles[:hi]
    elif muscle in {"جلو بازو", "پشت بازو"}:
        roles = [roles[0]] * max(lo, 2)
        roles = roles[:hi]
    elif muscle == "شکم":
        roles = ["core_flexion", "core_stability"]
    elif muscle == "پا":
        roles = ["quad", "hinge", "quad", "calf"]
        # Strong legs keep structural coverage; volume is controlled via sets, not by dropping roles.
        roles = roles[: max(3, min(hi, 4))]
    elif muscle == "سرشانه":
        roles = ["shoulder_press", "lateral", "rear_delt"][:hi]
    else:
        roles = roles[:hi]

    return roles[: max(1, hi)]


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
) -> dict[str, Any]:
    movement = _movement_class(name, muscle)
    policy = coach_policy(coach)
    timed = movement == "core" and _matches_any(name, ("پلانک", "plank"))
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

    first_class = _movement_class(first["name"], first["targetMuscle"])
    second_class = _movement_class(second["name"], second["targetMuscle"])
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


def _trim_day_to_budget(day_exercises: list[dict], budget: int) -> list[dict]:
    """Reduce sets on trailing accessories/isolations until within session budget."""
    if budget <= 0 or not day_exercises:
        return day_exercises

    def total() -> int:
        return sum(int(e.get("sets") or 0) for e in day_exercises)

    guard = 0
    while total() > budget and guard < 40:
        guard += 1
        # Prefer reducing later isolation/accessory sets, never below 2.
        candidates = [
            e
            for e in reversed(day_exercises)
            if _movement_class(e["name"], e["targetMuscle"]) in {"isolation", "accessory", "core"}
            and int(e.get("sets") or 0) > 2
        ]
        if not candidates:
            candidates = [e for e in reversed(day_exercises) if int(e.get("sets") or 0) > 2]
        if not candidates:
            break
        candidates[0]["sets"] = int(candidates[0]["sets"]) - 1
        rx = candidates[0].get("prescription") or {}
        rx["sets"] = candidates[0]["sets"]
        candidates[0]["prescription"] = rx
    while total() > budget:
        removable = next(
            (
                e
                for e in reversed(day_exercises)
                if sum(other["targetMuscle"] == e["targetMuscle"] for other in day_exercises) > 1
                and not e.get("supersetGroupId")
                and not e.get("trainingGroupId")
            ),
            None,
        )
        if removable is None:
            raise ValidationError(
                {
                    "session_duration_minutes": [
                        "زمان جلسه برای پوشش عضلات انتخاب‌شده کافی نیست؛ زمان را بیشتر یا عضلات جلسه را کمتر کنید."
                    ]
                }
            )
        day_exercises.remove(removable)
    return day_exercises


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


def _full_body_muscles(days_per_week: int, priority_order: list[str]) -> list[list[str]]:
    base = _unique(
        [normalize_muscle(m) for m in priority_order] + ["سینه", "زیربغل", "پا", "سرشانه"]
    )
    out: list[list[str]] = []
    if days_per_week <= 2:
        return [list(base) for _ in range(days_per_week)]
    for i in range(days_per_week):
        primary = base[i % len(base)]
        secondary = base[(i + 2) % len(base)]
        if secondary == primary:
            secondary = base[(i + 1) % len(base)]
        out.append(_unique([primary, secondary]))
    return out


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
    muscle_priorities_override: list[str],
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
        _attach_session_duration_evidence(days, student, evidence)
        return days, evidence
    equipment_tokens = available_equipment_tokens(student.equipment)
    goals = student.goals or {}
    policy = coach_policy(coach)
    raw_region_inputs = [
        *((goals.get("weak_muscles") or []) if policy["weakness_auto_focus"] else []),
        *(goals.get("muscle_priorities") or []),
        *muscle_priorities_override,
        target_muscle,
        target_region,
    ]
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
    weak = observed_weak if policy["weakness_auto_focus"] else set()
    priority = {
        normalize_muscle(m)
        for m in (muscle_priorities_override + list(goals.get("muscle_priorities") or []))
    }
    strong = {normalize_muscle(m) for m in (goals.get("strong_muscles") or [])}

    preferred_names: set[str] = set()
    for pref in pref_by_exercise_id.values():
        if pref.is_preferred or int(pref.priority or 0) > 0:
            preferred_names.add(pref.exercise.name)
        if pref.exercise.name in structured_catalog_by_name:
            structured_catalog_by_name[pref.exercise.name]["priority"] = int(pref.priority or 0)

    muscle_priority_map: dict[str, MusclePriority] = {}
    if apply_muscle:
        for mp in MusclePriority.objects.filter(coach=coach).order_by("sort_order"):
            muscle_priority_map[normalize_muscle(mp.muscle)] = mp

    try:
        parsed = parse_template_split(template.split, days_per_week=days_per_week)
    except ValueError as exc:
        warnings.append(f"split_parse_error:{exc}")
        parsed = [(f"روز {i + 1}", []) for i in range(days_per_week)]

    # Resolve empty (full-body) labels.
    if any(not muscles for _, muscles in parsed):
        fb = _full_body_muscles(
            days_per_week, list(template.muscle_priority_order or []) + list(priority)
        )
        resolved: list[tuple[str, list[str]]] = []
        for i, (title, muscles) in enumerate(parsed):
            resolved.append((title, muscles or fb[i]))
        parsed = resolved

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

    allow_superset = False
    if level_rule and level != "beginner":
        techniques = " ".join(level_rule.allowed_techniques or [])
        allow_superset = "سوپرست" in techniques
    elif level == "intermediate":
        allow_superset = True

    days: list[dict] = []
    evidence = {
        "weak_muscles": sorted(weak),
        "observed_weak_muscles": sorted(observed_weak),
        "generation_policy": policy,
        "prescription_version": 2,
        "priority_muscles": sorted(priority),
        "strong_muscles": sorted(strong),
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

    structured_technique_keys: set[str] = set()
    structured_technique_evidence: list[dict] = []
    structured_technique_handler = None
    has_superset_override = CoachTechnique.objects.filter(
        coach=coach, base_technique__handler_key="superset"
    ).exists()
    from programming.services.techniques import enabled_techniques_for_level

    allowed_technique_names = set(level_rule.allowed_techniques or []) if level_rule else set()
    for config in enabled_techniques_for_level(coach, level, allowed_names=allowed_technique_names):
        if config.base_technique and config.base_technique.handler_key:
            structured_technique_keys.add(config.key)
            if config.base_technique.handler_key == "superset":
                structured_technique_handler = "superset"

    for index, (day_title, target_muscles) in enumerate(parsed):
        # Repeating a muscle across sessions is intentional; dedupe inside each session.
        used = set()
        style = day_style_target(target_muscles, coach=coach)
        per_muscle_targets = style.get("per_muscle") or {}
        day_budget = session_set_target(template.volume or "", level, coach=coach)
        session_duration = (student.training_conditions or {}).get("session_duration_minutes")
        try:
            session_duration = int(session_duration)
        except (TypeError, ValueError):
            session_duration = 0
        duration_cap = None
        if 15 <= session_duration <= 180:
            # Approximate three minutes per working set, including rest and transitions.
            seconds_per_set = 40 + policy["rest_seconds"]
            duration_cap = max(
                2, int((session_duration - policy["warmup_minutes"]) * 60 / seconds_per_set)
            )
        # Mild weak/strong session bias within a tight band.
        if any(m in weak for m in target_muscles if m not in ARM_MUSCLES | CORE_MUSCLES):
            day_budget += 1
        strong_primary = any(
            m in strong for m in target_muscles if m not in ARM_MUSCLES | CORE_MUSCLES
        )
        if strong_primary:
            day_budget -= 2
        day_budget = max(12 if strong_primary else 14, min(20, day_budget))
        if duration_cap is not None:
            day_budget = min(day_budget, duration_cap)

        day_exercises: list[dict] = []
        for muscle in target_muscles:
            style_count = per_muscle_targets.get(muscle)
            if (
                target_exercise_count
                and target_muscle
                and normalize_muscle(target_muscle) == muscle
            ):
                style_count = (target_exercise_count, target_exercise_count)
            if style_count is None:
                style_count = (2, 3) if muscle in ARM_MUSCLES | CORE_MUSCLES else (3, 4)
            roles = _roles_for_muscle(
                muscle,
                weak=weak,
                priority=priority,
                strong=strong,
                style_count=style_count,
                volume_text=template.volume or "",
            )
            # Cap by MusclePriority.extra_exercises without exploding volume.
            mp = muscle_priority_map.get(muscle)
            if (
                apply_muscle
                and mp
                and int(mp.extra_exercises or 0) > 0
                and muscle in weak | priority
            ):
                hi = style_count[1]
                if len(roles) < hi:
                    roles = roles + [roles[-1]]
                    roles = roles[:hi]

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

            historical_map = _historical_usage_map(coach, filtered)
            picked = _pick_for_roles(
                filtered,
                roles,
                muscle,
                preferred_names=preferred_names,
                historical_map=historical_map,
                priority_boost=muscle in priority or muscle in weak,
                variety_level=exercise_variety,
                rng=selection_rng,
                previous_names=previous_names,
            )
            for idx, name in enumerate(picked):
                used.add(name)
                used |= _alias_names(coach, {name})
                ex_ref = catalog.get((muscle, name)) or catalog_by_name.get(name)
                if ex_ref is None:
                    raise ValidationError(
                        {"catalog": ["حرکت انتخاب‌شده در کاتالوگ مربی وجود ندارد."]}
                    )
                sets = base_sets + (policy["focus_extra_sets"] if muscle in priority | weak else 0)
                if apply_muscle and mp and muscle in priority | weak:
                    sets = base_sets + min(2, max(0, int(mp.extra_sets)))
                hist = historical_map.get(name) or {}
                rx = _prescribe(
                    name=name,
                    muscle=muscle,
                    level=level,
                    sets=sets,
                    template=template,
                    exercise_index=idx,
                    historical_raw=hist.get("raw_prescription"),
                    coach=coach,
                )
                selection_source = "coach_catalog"
                if name in from_structured:
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
                        "id": f"{index + 1}-{muscle}-{idx + 1}-{_stable_id(name)}",
                        "order": 0,
                        "name": name,
                        "exercise_id": str(ex_ref.id) if ex_ref else None,
                        "tutorial_url": "",
                        "execution_guide": ex_ref.execution_guide if ex_ref else {},
                        "display_name": name,
                        "targetMuscle": muscle,
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
                        "exercise_snapshot": (
                            {
                                "id": str(ex_ref.id),
                                "name": ex_ref.name,
                                "name_en": ex_ref.name_en,
                                "primary_muscle": ex_ref.primary_muscle,
                                "secondary_muscles": list(ex_ref.secondary_muscles or []),
                                "equipment": ex_ref.equipment,
                                "level": ex_ref.level,
                                "movement_pattern": ex_ref.movement_pattern,
                                "source_document": ex_ref.source_document,
                                "targets": [
                                    {
                                        "muscle_key": target.muscle.key,
                                        "region_key": target.region.key if target.region else None,
                                        "role": target.role,
                                    }
                                    for target in ex_ref.muscle_targets.all()
                                ],
                                "levels": [row.level for row in ex_ref.suitable_level_rows.all()],
                                "equipment_keys": [
                                    row.equipment.key for row in ex_ref.equipment_rows.all()
                                ],
                            }
                            if ex_ref
                            else None
                        ),
                        "supersetGroupId": None,
                        "supersetWithPrevious": False,
                        "supersetPartnerName": None,
                    }
                )

        # Session order: compound → secondary → isolation → arms → core
        day_exercises.sort(
            key=lambda ex: (
                _session_rank(ex["name"], ex["targetMuscle"])[0],
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

        _apply_real_supersets(
            day_exercises,
            allow=(
                selected_training_systems is None
                and allow_superset
                and apply_general
                and not structured_technique_handler
                and not has_superset_override
            ),
            max_pairs=int(style.get("supersets") or 0) or (1 if allow_superset else 0),
        )
        day_exercises = _trim_day_to_budget(day_exercises, day_budget)

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
                "volumeBudget": day_budget,
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
    weekly_sets: dict[str, int] = {}
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
            muscle = exercise["targetMuscle"]
            weekly_sets[muscle] = weekly_sets.get(muscle, 0) + sets
        seconds = policy["warmup_minutes"] * 60
        for exercise in day["exercises"]:
            rest_match = re.search(r"\d+", exercise["rest"])
            rest_seconds = int(rest_match[0]) if rest_match else policy["rest_seconds"]
            seconds += int(exercise["sets"]) * (40 + rest_seconds) + 45
        day["estimatedMinutes"] = round(seconds / 60, 1)
    evidence["weekly_primary_sets"] = weekly_sets

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
