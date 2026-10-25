"""Deterministic session distribution / prescription calibration.

Platform defaults are generic safety/ergonomics fallbacks. Coaches may override
via CoachRuleSet.style_profile (JSON). Historical Arman calibration is seeded as
coach data — never selected by coach name/id in this module.
"""

from __future__ import annotations

from typing import Any

# Generic platform fallbacks (not coach-identity keyed).
DEFAULT_DAY_TARGETS: dict[tuple[str, ...], dict[str, Any]] = {
    ("سینه", "پشت بازو"): {
        "total_exercises": (5, 6),
        "per_muscle": {"سینه": (3, 4), "پشت بازو": (2, 2)},
        "supersets": 1,
    },
    ("زیربغل", "جلو بازو"): {
        "total_exercises": (5, 6),
        "per_muscle": {"زیربغل": (3, 4), "جلو بازو": (2, 3)},
        "supersets": 1,
    },
    ("پا",): {
        "total_exercises": (4, 5),
        "per_muscle": {"پا": (4, 5)},
        "supersets": 0,
    },
    ("سرشانه", "شکم"): {
        "total_exercises": (5, 6),
        "per_muscle": {"سرشانه": (3, 3), "شکم": (2, 2)},
        "supersets": 0,
    },
}

DEFAULT_SESSION_SETS = {"کم": 14, "متوسط": 18, "زیاد": 22}


def _key_for_muscles(muscles: list[str]) -> tuple[str, ...]:
    return tuple(muscles)


def _day_key_to_tuple(key: str | list | tuple) -> tuple[str, ...]:
    if isinstance(key, (list, tuple)):
        return tuple(str(x) for x in key)
    text = str(key).strip()
    if "|" in text:
        return tuple(p for p in text.split("|") if p)
    if " و " in text:
        return tuple(p.strip() for p in text.split(" و ") if p.strip())
    return (text,) if text else tuple()


def _normalize_range(value: Any, default: tuple[int, int] = (3, 4)) -> tuple[int, int]:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            return (int(value[0]), int(value[1]))
        except (TypeError, ValueError):
            return default
    if isinstance(value, int):
        return (value, value)
    return default


def _normalize_day_targets(raw: dict | None) -> dict[tuple[str, ...], dict[str, Any]]:
    if not isinstance(raw, dict) or not raw:
        return {k: dict(v) for k, v in DEFAULT_DAY_TARGETS.items()}
    out: dict[tuple[str, ...], dict[str, Any]] = {}
    for key, value in raw.items():
        if not isinstance(value, dict):
            continue
        muscle_key = _day_key_to_tuple(key)
        if not muscle_key:
            continue
        per_raw = value.get("per_muscle") or {}
        per: dict[str, tuple[int, int]] = {}
        if isinstance(per_raw, dict):
            for m, rng in per_raw.items():
                per[str(m)] = _normalize_range(rng, (2, 2))
        out[muscle_key] = {
            "total_exercises": _normalize_range(value.get("total_exercises"), (4, 6)),
            "per_muscle": per,
            "supersets": int(value.get("supersets") or 0),
        }
    return out or {k: dict(v) for k, v in DEFAULT_DAY_TARGETS.items()}


def platform_default_style_profile() -> dict[str, Any]:
    return {
        "day_targets": dict(DEFAULT_DAY_TARGETS),
        "session_sets": dict(DEFAULT_SESSION_SETS),
        "max_supersets_per_day": 1,
        "source": "platform_defaults",
    }


def load_style_profile(coach=None) -> dict[str, Any]:
    """Load coach style_profile when present; otherwise platform defaults."""
    profile = platform_default_style_profile()
    raw = None
    if coach is not None:
        coach_id = getattr(coach, "id", None) or getattr(coach, "pk", None)
        if coach_id is not None:
            from accounts.models import CoachRuleSet

            # Always read from DB to avoid stale reverse-OneToOne cache.
            row = (
                CoachRuleSet.objects.filter(coach_id=coach_id)
                .values_list("style_profile", flat=True)
                .first()
            )
            raw = row if isinstance(row, dict) else {}
        else:
            rule_set = getattr(coach, "rule_set", None)
            raw = getattr(rule_set, "style_profile", None) if rule_set is not None else {}

    if isinstance(raw, dict) and raw:
        if raw.get("day_targets"):
            profile["day_targets"] = _normalize_day_targets(raw.get("day_targets"))
        if isinstance(raw.get("session_sets"), dict) and raw["session_sets"]:
            profile["session_sets"] = {
                str(k): int(v) for k, v in raw["session_sets"].items() if str(k)
            }
        if raw.get("max_supersets_per_day") is not None:
            try:
                profile["max_supersets_per_day"] = int(raw["max_supersets_per_day"])
            except (TypeError, ValueError):
                pass
        profile["source"] = str(raw.get("source") or "coach_style_profile")
    return profile


def day_style_target(muscles: list[str], coach=None) -> dict[str, Any]:
    profile = load_style_profile(coach)
    key = _key_for_muscles(muscles)
    targets = profile["day_targets"]
    if key in targets:
        return targets[key]
    if not muscles:
        return {"total_exercises": (4, 6), "per_muscle": {}, "supersets": 0}
    per = {}
    for i, m in enumerate(muscles):
        per[m] = (3, 4) if i == 0 else (2, 2)
        if m == "شکم":
            per[m] = (2, 2)
        if m in {"جلو بازو", "پشت بازو"}:
            per[m] = (2, 2)
    return {
        "total_exercises": (5, 6),
        "per_muscle": per,
        "supersets": 1 if any(m in {"جلو بازو", "پشت بازو"} for m in muscles) else 0,
    }


def session_set_target(volume_text: str, level: str, coach=None) -> int:
    profile = load_style_profile(coach)
    text = (volume_text or "").lower()
    sets = profile["session_sets"]
    if "کم" in text or level == "beginner":
        return int(sets.get("کم", 14))
    if "زیاد" in text or "بالا" in text or level == "advanced":
        return int(sets.get("زیاد", 22))
    return int(sets.get("متوسط", 18))
