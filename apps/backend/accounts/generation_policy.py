"""Typed coach policy; the sole automatic prescription source for new programs."""

from rest_framework.exceptions import ValidationError

DEFAULT_POLICY = {
    "sets": 3,
    "reps_min": 8,
    "reps_max": 12,
    "rest_seconds": 90,
    "rir": 2,
    "focus_extra_sets": 1,
    "weakness_auto_focus": False,
    "warmup_minutes": 5,
    "progression": "double_progression",
}


def validate_policy(raw):
    if not isinstance(raw, dict) or set(raw) - set(DEFAULT_POLICY):
        raise ValidationError({"generation_rules": ["Unknown rule or invalid rule object."]})
    policy = {**DEFAULT_POLICY, **raw}
    limits = {
        "sets": (2, 5),
        "reps_min": (1, 30),
        "reps_max": (1, 30),
        "rest_seconds": (30, 300),
        "rir": (1, 5),
        "focus_extra_sets": (0, 2),
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
    return policy


def coach_policy(coach):
    from accounts.models import CoachRuleSet

    style = CoachRuleSet.objects.filter(coach=coach).values_list("style_profile", flat=True).first()
    return validate_policy((style or {}).get("generation_rules", {}))
