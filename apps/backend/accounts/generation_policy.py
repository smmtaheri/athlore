"""Typed coach policy; the sole automatic prescription source for new programs."""

from copy import deepcopy

from rest_framework.exceptions import ValidationError

from accounts.exercise_metadata import JOINTS, PATTERNS


def _default_profiles():
    from programming.services.volume_planning import default_volume_profiles

    return default_volume_profiles()


DEFAULT_POLICY = {
    "sets": 3,
    "reps_min": 8,
    "reps_max": 12,
    "rest_seconds": 90,
    "rir": 2,
    "weakness_auto_focus": False,
    "warmup_minutes": 5,
    "progression": "double_progression",
    "volume_profiles": _default_profiles(),
    "movement_restrictions": [],
}


def validate_policy(raw):
    if not isinstance(raw, dict) or set(raw) - set(DEFAULT_POLICY):
        raise ValidationError({"generation_rules": ["Unknown rule or invalid rule object."]})
    policy = {**deepcopy(DEFAULT_POLICY), **raw}
    limits = {
        "sets": (2, 5),
        "reps_min": (1, 30),
        "reps_max": (1, 30),
        "rest_seconds": (30, 300),
        "rir": (1, 5),
        "warmup_minutes": (0, 20),
    }
    for key, (lo, hi) in limits.items():
        value = policy[key]
        if type(value) is not int or not lo <= value <= hi:
            raise ValidationError({"generation_rules": [f"{key}: expected {lo}..{hi}."]})
    if policy["reps_min"] > policy["reps_max"]:
        raise ValidationError({"generation_rules": ["Minimum reps must not exceed maximum reps."]})
    if type(policy["weakness_auto_focus"]) is not bool:
        raise ValidationError({"generation_rules": ["weakness_auto_focus must be boolean."]})
    if policy["progression"] not in {"double_progression", "maintain"}:
        raise ValidationError({"generation_rules": ["Unsupported progression rule."]})
    profiles = policy["volume_profiles"]
    defaults = _default_profiles()
    if not isinstance(profiles, dict) or set(profiles) != set(defaults):
        raise ValidationError({"volume_profiles": ["All three training levels are required."]})
    for level, muscles in profiles.items():
        if not isinstance(muscles, dict) or set(muscles) != set(defaults[level]):
            raise ValidationError({"volume_profiles": ["Every supported muscle needs a profile."]})
        for row in muscles.values():
            if not isinstance(row, dict) or set(row) != set(next(iter(defaults[level].values()))):
                raise ValidationError({"volume_profiles": ["Unsupported volume profile fields."]})
            if any(type(value) is not int or not 0 <= value <= 50 for value in row.values()):
                raise ValidationError(
                    {"volume_profiles": ["Volume values must be integers from 0 to 50."]}
                )
            if (
                not (
                    row["maintenance"]
                    <= row["growth_start"]
                    <= row["target_min"]
                    <= row["target_max"]
                    <= row["weekly_cap"]
                )
                or not 1 <= row["session_cap"] <= row["weekly_cap"]
            ):
                raise ValidationError(
                    {"volume_profiles": ["Volume bounds are not in a valid order."]}
                )
    restrictions = policy["movement_restrictions"]
    if not isinstance(restrictions, list) or len(restrictions) > 100:
        raise ValidationError(
            {"movement_restrictions": ["Expected at most 100 structured restrictions."]}
        )
    for row in restrictions:
        if (
            not isinstance(row, dict)
            or set(row) != {"injury_key", "joint_keys", "movement_patterns"}
            or not isinstance(row.get("injury_key"), str)
            or row["injury_key"]
            not in {"neck", "back", "knee", "shoulder", "elbow", "wrist", "hip", "ankle", "other"}
        ):
            raise ValidationError({"movement_restrictions": ["Invalid injury selector."]})
        for field, vocabulary in (("joint_keys", JOINTS), ("movement_patterns", PATTERNS)):
            if not isinstance(row[field], list) or any(
                not isinstance(value, str) or value not in vocabulary for value in row[field]
            ):
                raise ValidationError({"movement_restrictions": ["Invalid movement restriction."]})
        if not row["joint_keys"] and not row["movement_patterns"]:
            raise ValidationError(
                {"movement_restrictions": ["Choose a joint or movement pattern."]}
            )
    return policy


def coach_policy(coach):
    from accounts.models import CoachRuleSet

    style = CoachRuleSet.objects.filter(coach=coach).values_list("style_profile", flat=True).first()
    stored = dict((style or {}).get("generation_rules", {}))
    # Old policies are converted on read until the data migration is applied.
    stored.pop("focus_extra_sets", None)
    return validate_policy(stored)
