"""Extract recognized semantic visit-form signals for the generator.

Unknown / custom fields are preserved for coach display only and never alter
generation. Missing answers mean NOT ASSESSED — never NORMAL/STRONG/FALSE.
Coach-private notes are never executable.
"""

from __future__ import annotations

from typing import Any

# Semantic keys the engine may interpret.
EXECUTABLE_SEMANTIC_KEYS = frozenset(
    {
        "goal",
        "training_level",
        "sessions_per_week",
        "weak_muscles",
        "muscle_detail",
        "injuries",
        "posture",
        "training_methods",
        "weekly_split",
        "nutrition_plan",
        "assessment_date",
    }
)

# Explicitly advisory — stored/shown, never executable here.
ADVISORY_SEMANTIC_KEYS = frozenset(
    {
        "calorie_target",
        "supplements",
        "medications",
    }
)

GOAL_MAP = {
    "gain_weight": "hypertrophy",
    "lose_weight": "fat_loss",
    "maintain_weight": "maintain",
    "hypertrophy": "hypertrophy",
    "fat_loss": "fat_loss",
    "maintain": "maintain",
}

LEVEL_MAP = {
    "beginner": "beginner",
    "intermediate": "intermediate",
    "semi_professional": "advanced",
    "professional": "advanced",
    "advanced": "advanced",
}

# Map assessment muscle ids to generator / student weak_muscle tokens.
MUSCLE_TO_GENERATOR = {
    "shoulders": "shoulders",
    "triceps": "triceps",
    "calves": "calves",
    "chest": "chest",
    "quadriceps": "legs",
    "forearms": "forearms",
    "back": "back",
    "hamstrings": "hamstrings",
    "abs": "abs",
    "biceps": "biceps",
    "glutes": "glutes",
    "traps": "traps",
    "upper_chest": "upper_chest",
}

INJURY_TYPE_MAP = {
    "neck": "mild_neck",
    "back": "back",
    "knee": "knee",
    "shoulder": "shoulder",
    "other": "other",
}


def _is_answered(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    if isinstance(value, (list, dict)) and len(value) == 0:
        return False
    return True


def _iter_template_fields(sections: list | dict | None) -> list[dict]:
    if isinstance(sections, dict):
        sections = sections.get("sections") or []
    if not isinstance(sections, list):
        return []
    fields: list[dict] = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        for field in section.get("fields") or []:
            if isinstance(field, dict) and field.get("enabled", True):
                fields.append(field)
    return fields


def _parse_muscle_detail_key(field_key: str) -> tuple[str, str] | None:
    # muscle_detail.chest.upper
    parts = str(field_key).split(".")
    if len(parts) >= 3 and parts[0] == "muscle_detail":
        return parts[1], parts[2]
    return None


def extract_semantic_answers(
    *,
    answers: dict | None,
    sections: list | dict | None,
) -> dict[str, Any]:
    """Map field answers onto semantic buckets using template field metadata."""
    answers = answers or {}
    semantic: dict[str, Any] = {}
    advisory: dict[str, Any] = {}
    custom: dict[str, Any] = {}
    muscle_detail: dict[str, dict[str, str]] = {}
    weekly_split: dict[str, str] = {}

    for field in _iter_template_fields(sections):
        key = str(field.get("key") or "")
        if not key or key not in answers:
            continue
        value = answers[key]
        if not _is_answered(value):
            continue
        semantic_key = str(field.get("semantic_key") or "").strip()
        if not semantic_key:
            custom[key] = value
            continue
        if semantic_key in ADVISORY_SEMANTIC_KEYS:
            advisory[semantic_key] = value
            continue
        if semantic_key not in EXECUTABLE_SEMANTIC_KEYS:
            custom[key] = value
            continue

        if semantic_key == "muscle_detail":
            parsed = _parse_muscle_detail_key(key)
            if parsed:
                group, sub = parsed
                muscle_detail.setdefault(group, {})[sub] = str(value)
            elif isinstance(value, dict):
                for g, subs in value.items():
                    if isinstance(subs, dict):
                        muscle_detail.setdefault(str(g), {}).update(
                            {str(sk): str(sv) for sk, sv in subs.items() if _is_answered(sv)}
                        )
            continue

        if semantic_key == "weekly_split":
            day = key.replace("split_", "") if key.startswith("split_") else key
            weekly_split[day] = str(value)
            continue

        semantic[semantic_key] = value

    if muscle_detail:
        semantic["muscle_detail"] = muscle_detail
    if weekly_split:
        semantic["weekly_split"] = weekly_split

    return {
        "executable": semantic,
        "advisory": advisory,
        "custom": custom,
    }


def _weak_from_detail(detail: dict[str, dict[str, str]]) -> list[str]:
    weak: list[str] = []
    for group, subs in detail.items():
        if any(str(v).lower() in {"weak", "asymmetry"} for v in subs.values()):
            mapped = MUSCLE_TO_GENERATOR.get(group, group)
            if mapped not in weak:
                weak.append(mapped)
            # Surface upper_chest when chest.upper is weak.
            if group == "chest" and str(subs.get("upper", "")).lower() == "weak":
                if "upper_chest" not in weak:
                    weak.append("upper_chest")
    return weak


def build_generation_context_from_visit(visit) -> dict[str, Any] | None:
    """Build generator context from a Visit's dynamic form answers + snapshot."""
    if visit is None:
        return None
    sections = (visit.form_template_snapshot or {}).get("sections") or []
    if not sections and visit.form_template_id:
        template = visit.form_template
        if template is not None:
            sections = template.sections or []
    extracted = extract_semantic_answers(answers=visit.answers or {}, sections=sections)
    executable = extracted["executable"]
    visit_date = visit.visit_date.isoformat() if visit.visit_date else ""
    base = {
        "visit_id": str(visit.id),
        "assessment_id": str(visit.id),  # legacy evidence key
        "visit_date": visit_date,
        "assessment_date": visit_date,
        "template_key": visit.form_template_key or "",
        "template_version": visit.form_template_version or 1,
        "executable": {},
        "advisory": {},
        "custom_keys": [],
        "applied": False,
    }
    if not executable and not extracted["advisory"] and not extracted["custom"]:
        return base

    detail = executable.get("muscle_detail") or {}
    if detail and "weak_muscles" not in executable:
        derived = _weak_from_detail(detail)
        if derived:
            executable["weak_muscles"] = derived
    elif detail and executable.get("weak_muscles"):
        existing = [str(x) for x in executable["weak_muscles"]]
        for item in _weak_from_detail(detail):
            if item not in existing:
                existing.append(item)
        executable["weak_muscles"] = existing

    base.update(
        {
            "executable": executable,
            "advisory": extracted["advisory"],
            "custom_keys": sorted(extracted["custom"].keys()),
            "applied": bool(executable),
        }
    )
    return base


# Back-compat name used by older call sites / tests.
build_generation_context_from_assessment = build_generation_context_from_visit


def merge_student_with_assessment(
    *,
    student_goals: dict,
    student_injuries: dict,
    student_training_background: dict,
    student_training_conditions: dict,
    assessment_ctx: dict | None,
) -> dict[str, Any]:
    """Overlay visit form semantic values onto student profile without inventing defaults.

    Missing visit answers => student fields unchanged.
    Missing semantic field => leave student value (or empty) alone.
    """
    goals = dict(student_goals or {})
    injuries = dict(student_injuries or {})
    training_background = dict(student_training_background or {})
    training_conditions = dict(student_training_conditions or {})
    evidence_bits: dict[str, Any] = {
        "source": "student_profile",
        "assessment_overrides": [],
        "visit_overrides": [],
    }

    if not assessment_ctx or not assessment_ctx.get("applied"):
        return {
            "goals": goals,
            "injuries": injuries,
            "training_background": training_background,
            "training_conditions": training_conditions,
            "assessment": assessment_ctx,
            "visit": assessment_ctx,
            "evidence": evidence_bits,
        }

    exe = assessment_ctx.get("executable") or {}
    evidence_bits["source"] = "student_profile+visit"
    evidence_bits["visit_id"] = assessment_ctx.get("visit_id") or assessment_ctx.get(
        "assessment_id"
    )
    evidence_bits["assessment_id"] = evidence_bits["visit_id"]
    evidence_bits["template_key"] = assessment_ctx.get("template_key")
    evidence_bits["template_version"] = assessment_ctx.get("template_version")

    if "goal" in exe and _is_answered(exe["goal"]):
        mapped = GOAL_MAP.get(str(exe["goal"]), str(exe["goal"]))
        goals["primary_goal"] = mapped
        evidence_bits["assessment_overrides"].append("goal")
        evidence_bits["visit_overrides"].append("goal")

    if "training_level" in exe and _is_answered(exe["training_level"]):
        mapped = LEVEL_MAP.get(str(exe["training_level"]), str(exe["training_level"]))
        training_background["level"] = mapped
        evidence_bits["assessment_overrides"].append("training_level")
        evidence_bits["visit_overrides"].append("training_level")

    if "sessions_per_week" in exe and _is_answered(exe["sessions_per_week"]):
        try:
            training_conditions["training_days_per_week"] = int(exe["sessions_per_week"])
            evidence_bits["assessment_overrides"].append("sessions_per_week")
            evidence_bits["visit_overrides"].append("sessions_per_week")
        except (TypeError, ValueError):
            pass

    if "weak_muscles" in exe and _is_answered(exe["weak_muscles"]):
        raw = exe["weak_muscles"]
        if isinstance(raw, list):
            mapped = [MUSCLE_TO_GENERATOR.get(str(m), str(m)) for m in raw if str(m).strip()]
            goals["weak_muscles"] = mapped
            if not goals.get("muscle_priorities"):
                goals["muscle_priorities"] = list(mapped)
            evidence_bits["assessment_overrides"].append("weak_muscles")
            evidence_bits["visit_overrides"].append("weak_muscles")

    if "muscle_detail" in exe and _is_answered(exe["muscle_detail"]):
        evidence_bits["muscle_detail"] = exe["muscle_detail"]
        evidence_bits["assessment_overrides"].append("muscle_detail")
        evidence_bits["visit_overrides"].append("muscle_detail")

    if "injuries" in exe and _is_answered(exe["injuries"]):
        raw = exe["injuries"]
        items = raw if isinstance(raw, list) else [raw]
        items = [str(x) for x in items if str(x).strip()]
        if items:
            injuries["has_injury"] = True
            injuries["injury_types"] = items
            injuries["injury_type"] = INJURY_TYPE_MAP.get(items[0], items[0])
            evidence_bits["assessment_overrides"].append("injuries")
            evidence_bits["visit_overrides"].append("injuries")

    if "training_methods" in exe and _is_answered(exe["training_methods"]):
        evidence_bits["training_methods"] = exe["training_methods"]
        evidence_bits["assessment_overrides"].append("training_methods")
        evidence_bits["visit_overrides"].append("training_methods")

    if "weekly_split" in exe and _is_answered(exe["weekly_split"]):
        evidence_bits["weekly_split"] = exe["weekly_split"]
        evidence_bits["assessment_overrides"].append("weekly_split")
        evidence_bits["visit_overrides"].append("weekly_split")

    if "posture" in exe and _is_answered(exe["posture"]):
        evidence_bits["posture"] = exe["posture"]
        evidence_bits["assessment_overrides"].append("posture")
        evidence_bits["visit_overrides"].append("posture")

    if assessment_ctx.get("advisory"):
        evidence_bits["advisory_keys"] = sorted(assessment_ctx["advisory"].keys())
    if assessment_ctx.get("custom_keys"):
        evidence_bits["custom_field_keys"] = list(assessment_ctx["custom_keys"])

    return {
        "goals": goals,
        "injuries": injuries,
        "training_background": training_background,
        "training_conditions": training_conditions,
        "assessment": assessment_ctx,
        "visit": assessment_ctx,
        "evidence": evidence_bits,
    }


def latest_visit_for_generation(student):
    """Prefer latest finalized visit with answers; else latest visit with answers; else latest."""
    from students.models import Visit

    qs = Visit.objects.filter(student=student).order_by("-visit_date", "-created_at")
    finalized = qs.filter(status=Visit.Status.FINALIZED).exclude(answers={}).first()
    if finalized is not None:
        return finalized
    with_answers = qs.exclude(answers={}).first()
    if with_answers is not None:
        return with_answers
    return qs.first()


def latest_assessment_for_student(student):
    """Deprecated alias — returns the visit used as unified assessment context."""
    return latest_visit_for_generation(student)
