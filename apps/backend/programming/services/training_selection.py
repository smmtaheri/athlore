"""Split-driven training day construction for rules_v1.

Owns muscle coverage, cross-day dedupe, volume bias, hard equipment filter,
prescription variation, and session ordering. Injury/forbidden sets are
provided by the caller (generator orchestration).
"""

from __future__ import annotations

import hashlib
from typing import Any

from accounts.models import (
    CoachExercisePreference,
    CoachTechnique,
    Exercise,
    ExerciseAlias,
    ExerciseBankGroup,
    ExerciseHistoricalUsage,
    LevelRule,
    MusclePriority,
    ProgramTemplate,
)
from programming.services.style_calibration import (
    day_style_target,
    load_style_profile,
    rest_bucket,
    session_set_target,
)
from programming.services.split_parser import normalize_muscle, parse_template_split

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
}

ARM_MUSCLES = frozenset({"پشت بازو", "جلو بازو"})
CORE_MUSCLES = frozenset({"شکم"})

_FALLBACK: dict[str, list[str]] = {
    "پا": ["پرس پا", "ددلیفت رومانیایی", "جلوپا دستگاه", "ساق ایستاده"],
    "سینه": ["پرس سینه هالتر", "پرس بالا سینه دمبل", "کراس اور"],
    "سرشانه": ["نشر جانب دمبل", "پرس سرشانه دستگاه", "فیس پول"],
    "زیربغل": ["لت سیم کش", "روئینگ دستگاه", "بارفیکس کمکی"],
    "پشت بازو": ["پشت بازو سیم‌کش", "دیپ نیمکت"],
    "جلو بازو": ["جلو بازو دمبل", "جلو بازو هالتر"],
    "شکم": ["کرانچ", "پلانک", "زیرشکم پا آویزان"],
    "ساق": ["ساق ایستاده"],
}


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
    role = _role_of_name(name, muscle)
    if role.startswith("core") or muscle in CORE_MUSCLES:
        return "core"
    if muscle in ARM_MUSCLES or role in {"triceps", "biceps", "lateral", "rear_delt", "calf"}:
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


def _bank_for_muscle(bank_groups: list[ExerciseBankGroup], muscle: str) -> ExerciseBankGroup | None:
    for group in bank_groups:
        g = group.group_name or ""
        if muscle in g or g in muscle:
            return group
        # Legacy bank groups may use compact Persian muscle labels.
        if muscle == "جلو بازو" and ("جلو" in g and "بازو" in g):
            return group
        if muscle == "پشت بازو" and ("پشت" in g and "بازو" in g):
            return group
        if muscle == "سرشانه" and "سرشانه" in g:
            return group
        if muscle == "شکم" and ("شکم" in g or "اصلاحی" in g):
            return group
        if muscle == "زیربغل" and ("زیربغل" in g or "پشت" == g):
            return group
    return None


def _candidate_names(
    *,
    muscle: str,
    bank_groups: list[ExerciseBankGroup],
    catalog: dict[tuple[str, str], Exercise],
    structured_catalog_by_name: dict[str, dict],
    preferred_names: set[str],
    level: str,
    apply_bank: bool,
    region_keys: set[str] | None = None,
) -> tuple[list[str], set[str], set[str]]:
    """Return (ordered candidates, legacy-bank names, structured-catalog names)."""
    raw: list[str] = []
    from_bank: set[str] = set()
    from_structured: set[str] = set()
    structured = []
    if apply_bank:
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
    bank = _bank_for_muscle(bank_groups, muscle) if apply_bank else None
    if bank:
        favorites = list(bank.favorite_exercises or [])
        raw.extend(favorites)
        from_bank.update(favorites)
        if level == "beginner":
            extra = list(bank.beginner_friendly or [])
        elif level == "advanced":
            extra = list(bank.professional_friendly or [])
        else:
            extra = list(bank.beginner_friendly or []) + list(bank.professional_friendly or [])
        raw.extend(extra)
        from_bank.update(extra)
    for (pm, name), _ex in sorted(catalog.items(), key=lambda x: x[0][1]):
        if normalize_muscle(pm) == muscle and name in preferred_names and name not in from_structured:
            raw.insert(0, name)
    raw.extend(_FALLBACK.get(muscle, []))
    return _unique(raw), from_bank, from_structured


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
                pref = pref_by_exercise_id.get(
                    str(catalog_by_name[name].id)
                ) if name in catalog_by_name else None
                excluded_reasons.append(
                    {
                        "name": name,
                        "reason": "coach_prohibited" if pref and pref.is_prohibited else "forbidden_rule",
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
        if _passes_equipment_hard(
            n, equipment_tokens, catalog_by_name, structured_catalog_by_name
        ):
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
        choice = matched[0]
        picked.append(choice)
        remaining = [n for n in remaining if n != choice]

    return picked


def _base_sets(level: str, template: ProgramTemplate, coach=None) -> int:
    profile = load_style_profile(coach)
    per_class = profile["sets_per_class"]
    volume = (template.volume or "").lower()
    if level == "advanced" or "بالا" in volume or "زیاد" in volume:
        return int(per_class.get("compound", 3)) + 1
    if level == "beginner" or "کم" in volume:
        return max(2, int(per_class.get("compound", 3)) - 1)
    return int(per_class.get("compound", 3))


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


def _sets_for_exercise(
    *,
    movement: str,
    muscle: str,
    weak: set[str],
    strong: set[str],
    priority: set[str],
    base_sets: int,
    is_first_of_muscle: bool,
    mp: MusclePriority | None,
    apply_muscle: bool,
) -> int:
    sets = base_sets
    if movement == "core":
        sets = max(2, base_sets)
    # Weak/priority primary muscles: mild set bump on each slot (cap 4) — not an exercise explosion.
    if muscle in weak | priority and muscle not in ARM_MUSCLES | CORE_MUSCLES:
        sets = min(4, base_sets + 1)
    if (
        apply_muscle
        and mp
        and is_first_of_muscle
        and mp.extra_sets
        and muscle in weak | priority
        and muscle not in ARM_MUSCLES | CORE_MUSCLES
    ):
        sets = min(4, max(sets, base_sets + min(1, int(mp.extra_sets))))
    # Strong primary: no set inflation; isolation stays at base (volume controlled via role count / budget).
    if muscle in strong:
        sets = base_sets
        if movement == "isolation":
            sets = max(2, base_sets)
    return sets


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
    intensity = (template.intensity or "").strip()
    rest = rest_bucket(movement, intensity, coach=coach)
    profile = load_style_profile(coach)
    rx_options = profile["rx_by_class"].get(movement) or profile["rx_by_class"]["accessory"]

    # Historical patterns are a reps/style signal only — volume engine owns set counts.
    bucket = int(_stable_id(name, muscle, historical_raw or ""), 16) % len(rx_options)
    reps_template, _hist_sets = rx_options[bucket]
    sets_out = sets

    if movement == "core":
        if "ثانیه" in reps_template:
            reps = reps_template
            raw = f"{sets_out}×{reps}"
            return {
                "sets": sets_out,
                "reps": reps,
                "rest": rest_bucket("core", intensity, coach=coach),
                "raw_prescription": historical_raw or raw,
                "rpe": intensity or "متوسط",
            }
        reps = reps_template
        raw = f"{sets_out}×{reps}"
    else:
        reps = reps_template
        if "×" in (historical_raw or "") and level != "beginner":
            # Use historical as style signal for raw only when structurally similar.
            raw = historical_raw or f"{sets_out}×{reps}"
        else:
            raw = f"{sets_out}×{reps}"

    if level == "beginner" and reps == "ناتوانی":
        reps = "۱۰"
        raw = f"{sets_out}×۱۰"

    return {
        "sets": sets_out,
        "reps": reps,
        "rest": rest,
        "raw_prescription": raw,
        "rpe": intensity or ("سبک" if level == "beginner" else "متوسط"),
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
            and first_muscle in {_canonical_muscle(item) for item in ARM_MUSCLES}
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
        b = day_exercises[i + 1]
        if _superset_pair_allowed(
            a,
            b,
            pairing_mode=pairing_mode,
            allow_compound=allow_compound,
        ):
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
    return day_exercises


def _full_body_muscles(days_per_week: int, priority_order: list[str]) -> list[list[str]]:
    base = _unique(
        [normalize_muscle(m) for m in priority_order] + ["سینه", "زیربغل", "پا", "سرشانه"]
    )
    out: list[list[str]] = []
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
    apply_bank: bool,
    apply_general: bool,
    bank_groups: list[ExerciseBankGroup],
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
) -> tuple[list[dict], dict]:
    equipment_tokens = available_equipment_tokens(student.equipment)
    goals = student.goals or {}
    raw_region_inputs = [
        *(goals.get("weak_muscles") or []),
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
        "بخش میانی سینه": "mid_chest",
        "lower_chest": "lower_chest",
        "پایین سینه": "lower_chest",
    }
    structured_region_filters: dict[str, set[str]] = {}
    for raw_value in raw_region_inputs:
        key = region_aliases.get(str(raw_value).strip().lower())
        if key:
            structured_region_filters.setdefault("سینه", set()).add(key)
    if target_region and target_muscle:
        canonical_target = normalize_muscle(target_muscle)
        normalized_region = region_aliases.get(str(target_region).strip().lower())
        if normalized_region:
            structured_region_filters.setdefault(canonical_target, set()).add(normalized_region)
    weak = {normalize_muscle(m) for m in (goals.get("weak_muscles") or [])}
    priority = {
        normalize_muscle(m)
        for m in (muscle_priorities_override + list(goals.get("muscle_priorities") or []))
    }
    strong = {normalize_muscle(m) for m in (goals.get("strong_muscles") or [])}

    preferred_names: set[str] = set()
    bank_name_set: set[str] = set()
    if apply_bank:
        for group in bank_groups:
            preferred_names.update(group.favorite_exercises or [])
            bank_name_set.update(group.favorite_exercises or [])
            bank_name_set.update(group.beginner_friendly or [])
            bank_name_set.update(group.professional_friendly or [])
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
    base_sets = _base_sets(level, template, coach=coach)

    allow_superset = False
    if level_rule and level != "beginner":
        techniques = " ".join(level_rule.allowed_techniques or [])
        allow_superset = "سوپرست" in techniques
    elif level == "intermediate":
        allow_superset = True

    days: list[dict] = []
    evidence = {
        "weak_muscles": sorted(weak),
        "priority_muscles": sorted(priority),
        "strong_muscles": sorted(strong),
        "selected_from_coach_bank": [],
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
    }

    structured_technique_keys: set[str] = set()
    structured_technique_evidence: list[dict] = []
    structured_technique_handler = None
    has_superset_override = CoachTechnique.objects.filter(
        coach=coach, base_technique__handler_key="superset"
    ).exists()
    from programming.services.techniques import enabled_techniques_for_level

    allowed_technique_names = set(level_rule.allowed_techniques or []) if level_rule else set()
    for config in enabled_techniques_for_level(
        coach, level, allowed_names=allowed_technique_names
    ):
        if config.base_technique and config.base_technique.handler_key:
            structured_technique_keys.add(config.key)
            if config.base_technique.handler_key == "superset":
                structured_technique_handler = "superset"

    for index, (day_title, target_muscles) in enumerate(parsed):
        style = day_style_target(target_muscles, coach=coach)
        per_muscle_targets = style.get("per_muscle") or {}
        day_budget = session_set_target(template.volume or "", level, coach=coach)
        # Mild weak/strong session bias within a tight band.
        if any(m in weak for m in target_muscles if m not in ARM_MUSCLES | CORE_MUSCLES):
            day_budget += 1
        strong_primary = any(
            m in strong for m in target_muscles if m not in ARM_MUSCLES | CORE_MUSCLES
        )
        if strong_primary:
            day_budget -= 2
        day_budget = max(12 if strong_primary else 14, min(20, day_budget))

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
            if apply_muscle and mp and int(mp.extra_exercises or 0) > 0 and muscle in weak:
                hi = style_count[1]
                if len(roles) < hi:
                    roles = roles + [roles[-1]]
                    roles = roles[:hi]

            candidates, from_bank, from_structured = _candidate_names(
                muscle=muscle,
                bank_groups=bank_groups,
                catalog=catalog,
                structured_catalog_by_name=structured_catalog_by_name,
                preferred_names=preferred_names,
                level=level,
                apply_bank=apply_bank,
                region_keys=(structured_region_filters or {}).get(muscle),
            )
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
            if not filtered:
                warnings.append(f"missing_exercise_candidates:{muscle}")
                for fallback in _FALLBACK.get(muscle, ["حرکت جایگزین کنترل‌شده"]):
                    if (
                        fallback not in used
                        and fallback not in forbidden
                        and not _fuzzy_forbidden(fallback, forbidden)
                        and _passes_equipment_hard(fallback, equipment_tokens, catalog_by_name)
                    ):
                        filtered = [fallback]
                        break
                if not filtered:
                    continue

            historical_map = _historical_usage_map(coach, filtered)
            picked = _pick_for_roles(
                filtered,
                roles,
                muscle,
                preferred_names=preferred_names,
                historical_map=historical_map,
                priority_boost=muscle in priority or muscle in weak,
            )
            for idx, name in enumerate(picked):
                used.add(name)
                used |= _alias_names(coach, {name})
                ex_ref = catalog.get((muscle, name)) or catalog_by_name.get(name)
                movement = _movement_class(name, muscle)
                sets = _sets_for_exercise(
                    movement=movement,
                    muscle=muscle,
                    weak=weak,
                    strong=strong,
                    priority=priority,
                    base_sets=base_sets,
                    is_first_of_muscle=(idx == 0),
                    mp=mp,
                    apply_muscle=apply_muscle,
                )
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
                selection_source = "fallback"
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
                if name in from_bank:
                    if selection_source == "fallback":
                        selection_source = "coach_bank"
                    evidence["selected_from_coach_bank"].append(name)
                if name in preferred_names:
                    evidence["selected_due_to_preference"].append(name)
                    evidence["preferred_selected"].append(name)
                    if selection_source == "fallback":
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
                        "notes": ("حرکت اصلی جلسه؛ با گرم کردن کافی شروع شود." if idx == 0 else ""),
                        "replacement_notes": "",
                        "selection_source": selection_source,
                        "catalog_source": "coach" if ex_ref else "fallback",
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
                                "levels": [
                                    row.level for row in ex_ref.suitable_level_rows.all()
                                ],
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
        day_exercises.sort(key=lambda ex: _session_rank(ex["name"], ex["targetMuscle"]))
        # Keep same-muscle arms adjacent so real supersets can pair.
        arm_block = [e for e in day_exercises if e["targetMuscle"] in ARM_MUSCLES]
        non_arm = [e for e in day_exercises if e["targetMuscle"] not in ARM_MUSCLES]
        core_block = [e for e in non_arm if e["targetMuscle"] in CORE_MUSCLES]
        main_block = [e for e in non_arm if e["targetMuscle"] not in CORE_MUSCLES]
        day_exercises = main_block + arm_block + core_block

        _apply_real_supersets(
            day_exercises,
            allow=(
                allow_superset
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
    )
    evidence["techniques"] = structured_technique_evidence

    if goals_override and days:
        days[0]["notes"] = f"{days[0]['notes']} اهداف: {goals_override}"

    # Deduplicate evidence lists
    evidence["selected_from_coach_bank"] = _unique(evidence["selected_from_coach_bank"])
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
    return days, evidence
