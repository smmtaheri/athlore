"""Deterministic rules_v1 program generator (no AI).

Same normalized input → same training/nutrition/supplement structure.
Not medically validated — warnings are returned to the coach.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any

from accounts.models import (
    CoachExercisePreference,
    CoachNutritionTemplate,
    CoachProfile,
    CoachSupplementTemplate,
    Exercise,
    ExerciseAlias,
    ExerciseBankGroup,
    ExerciseHistoricalUsage,
    InjuryRule,
    LevelRule,
    ProgramTemplate,
)
from accounts.rules_services import ensure_rule_set, get_coach_rules_aggregate
from programming.services.assessment_context import (
    build_generation_context_from_visit,
    latest_visit_for_generation,
    merge_student_with_assessment,
)
from programming.services.split_parser import normalize_muscle as _normalize_muscle_canonical
from programming.services.training_selection import build_training_days
from students.models import Student, Visit

GENERATOR_VERSION = "rules_v1"

PRIORITY_ORDER: list[str] = [
    "ownership_active_filter",
    "injury_movement_exclusion",
    "coach_forbidden",
    "equipment_availability",
    "level_suitability",
    "split_requirement",
    "weak_priority_muscle_adjustment",
    "explicit_coach_preference",
    "historical_usage_signal",
    "deterministic_tie_break",
]

FALLBACK_MAIN_EXERCISES: dict[str, list[str]] = {
    "پا": ["پرس پا", "ددلیفت رومانیایی", "جلوپا دستگاه"],
    "سینه": ["پرس سینه هالتر", "پرس بالا سینه دمبل", "کراس اور"],
    "سرشانه": ["نشر جانب دمبل", "پرس سرشانه دستگاه", "فیس پول"],
    "زیربغل": ["لت سیم کش", "روئینگ دستگاه", "بارفیکس کمکی"],
}

# Map English / product codes → Persian muscle / exercise labels used in Coach.docx fixtures.
MUSCLE_ALIASES: dict[str, str] = {
    "chest": "سینه",
    "upper_chest": "سینه",
    "shoulders": "سرشانه",
    "shoulder": "سرشانه",
    "triceps": "پشت بازو",
    "back": "زیربغل",
    "legs": "پا",
    "leg": "پا",
    "abs": "شکم",
    "core": "شکم",
}

EXERCISE_ALIASES: dict[str, list[str]] = {
    "heavy_shoulder_press": ["پرس سرشانه سنگین", "پرس سرشانه هالتر"],
    "heavy_shrug": ["شراگ سنگین", "شراگ"],
}

NECK_INJURY_MARKERS = ("گردن", "neck")
NECK_FORBIDDEN = (
    "پرس سرشانه سنگین",
    "پرس سرشانه هالتر",
    "پرس پشت گردن",
    "شراگ سنگین",
    "شراگ",
)

# Equipment flag key (student.equipment JSON) → Persian token used in Exercise.equipment.
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

NUTRITION_DISCLAIMER = (
    "این بخش صرفاً پیشنهادی و قابل ویرایش است؛ پیش از فعال‌سازی نهایی توسط مربی بررسی شود."
)
SUPPLEMENT_DISCLAIMER = (
    "این بخش صرفاً پیشنهادی است و جای مشاوره پزشکی یا تغذیه تخصصی را نمی‌گیرد؛ "
    "مصرف باید با تایید مربی/پزشک باشد."
)


# --------------------------------------------------------------------------
# Reference-bank lookups (ExerciseAlias / ExerciseHistoricalUsage /
# CoachNutritionTemplate / CoachSupplementTemplate — accounts.nutrition_models).
# --------------------------------------------------------------------------


def _alias_expand(coach: CoachProfile, names: set[str]) -> set[str]:
    """Expand a set of canonical forbidden exercise names via ExerciseAlias."""
    if not names:
        return set()
    rows = ExerciseAlias.objects.filter(coach=coach, exercise__name__in=list(names))
    return {row.alias for row in rows if row.alias}


def _historical_usage_map(coach: CoachProfile, names: list[str]) -> dict[str, dict]:
    """name -> {"count": int, "raw_prescription": str|None}.

    One ExerciseHistoricalUsage row == one historical prescription occurrence,
    so "count" is simply the number of matching rows for that exercise.
    """
    if not names:
        return {}
    rows = ExerciseHistoricalUsage.objects.filter(
        coach=coach, exercise__name__in=names
    ).select_related("exercise")
    out: dict[str, dict] = {}
    for row in rows:
        name = row.exercise.name
        entry = out.setdefault(name, {"count": 0, "raw_prescription": None})
        entry["count"] += 1
        if not entry["raw_prescription"] and row.raw_prescription:
            entry["raw_prescription"] = row.raw_prescription
    return out


def _select_reviewed_template(
    model: Any, coach: CoachProfile, purpose_hint: str
) -> tuple[Any, str]:
    """Pick a coach-reviewed, active, auto-select-eligible template. Deterministic."""
    candidates = list(
        model.objects.filter(
            coach=coach,
            needs_coach_review=False,
            status="active",
            is_eligible_for_auto_select=True,
        )
    )
    if not candidates:
        return None, "no_eligible_template"
    if purpose_hint:
        matched = [t for t in candidates if str(getattr(t, "purpose", "") or "") == purpose_hint]
        if matched:
            candidates = matched
    candidates.sort(key=lambda t: str(getattr(t, "name", "") or ""))
    return candidates[0], "selected"


def _snapshot_template_meals(template: CoachNutritionTemplate) -> list[dict]:
    """Deterministic snapshot: option_index 1 per slot (else lowest sort_order)."""
    out: list[dict] = []
    for slot in template.meal_slots.order_by("sort_order", "slot_key"):
        options = list(slot.options.all())
        chosen = next((o for o in options if o.option_index == 1), None)
        if chosen is None and options:
            chosen = min(options, key=lambda o: (o.sort_order, o.option_index))
        foods: list[dict] = []
        if chosen is not None:
            for item in chosen.items.order_by("sort_order", "food_name"):
                foods.append(
                    {
                        "id": str(item.id),
                        "name": item.food_name,
                        "amount": item.reviewed_quantity or item.quantity_text,
                        "unit": item.unit,
                        "preparation": item.preparation,
                        "alternatives": item.substitution_group,
                        "needs_review": item.needs_review,
                    }
                )
        out.append(
            {
                "id": slot.slot_key,
                "order": slot.sort_order,
                "title": slot.get_slot_key_display(),
                "notes": (chosen.notes if chosen is not None else "") or "",
                "foods": foods,
            }
        )
    return out


def _snapshot_template_items(template: CoachSupplementTemplate) -> list[dict]:
    out: list[dict] = []
    for item in template.items.order_by("sort_order", "name"):
        out.append(
            {
                "id": str(item.id),
                "order": item.sort_order,
                "name": item.name,
                "amount": item.normalized_amount or item.quantity_text,
                "timing": item.timing,
                "instructions": item.instructions,
                "warnings": item.warnings,
                "notes": "",
            }
        )
    return out


# --------------------------------------------------------------------------
# Small pure helpers
# --------------------------------------------------------------------------


def _stable_id(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return digest


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def _normalize_muscle(name: str) -> str:
    return _normalize_muscle_canonical(name)


def _expand_forbidden(names: list[str]) -> set[str]:
    forbidden: set[str] = set()
    for name in names:
        if not name:
            continue
        forbidden.add(name)
        for alias in EXERCISE_ALIASES.get(name, []):
            forbidden.add(alias)
    return forbidden


def _fuzzy_forbidden(name: str, forbidden: set[str]) -> bool:
    """Match when forbidden phrase is contained in exercise name (or vice versa)."""
    for item in forbidden:
        if not item:
            continue
        if item == name:
            return True
        if item in name or name in item:
            return True
    return False


def _injury_applies(injury: InjuryRule, student: Student) -> bool:
    injuries = student.injuries or {}
    if not injuries.get("has_injury"):
        return False
    name = (injury.name or "").lower()
    candidates = [str(injuries.get("injury_type") or "").lower()]
    for extra in injuries.get("injury_types") or []:
        candidates.append(str(extra).lower())
    for injury_type in candidates:
        if not injury_type:
            continue
        if injury_type in name or name in injury_type:
            return True
        if any(m in injury_type for m in NECK_INJURY_MARKERS) and any(
            m in name for m in NECK_INJURY_MARKERS
        ):
            return True
        if any(m in injury_type for m in ("کمر", "back")) and any(
            m in name for m in ("کمر", "back")
        ):
            return True
        if any(m in injury_type for m in ("زانو", "knee")) and any(
            m in name for m in ("زانو", "knee")
        ):
            return True
    return False


def _neck_injury_flagged(student: Student) -> bool:
    injuries = student.injuries or {}
    if not injuries.get("has_injury"):
        return False
    candidates = [str(injuries.get("injury_type") or "").lower()]
    for extra in injuries.get("injury_types") or []:
        candidates.append(str(extra).lower())
    return any(any(m in c for m in NECK_INJURY_MARKERS) for c in candidates if c)


def _student_nutrition_safety_missing(student: Student) -> bool:
    """True when the student has no recorded nutrition safety data at all.

    Fail-safe by design: no data means we can't verify safety, so treat as
    missing (nutrition stays disabled until the coach records something).
    """
    for field in ("food_allergies", "food_intolerances", "dietary_restrictions"):
        value = getattr(student, field, None)
        if value:
            return False
    notes = getattr(student, "nutrition_notes", "") or ""
    if str(notes).strip():
        return False
    return True


def _student_movement_restrictions(student: Student) -> list[str]:
    value = getattr(student, "movement_restrictions", None)
    if not value:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _level_label(level: str) -> str:
    return {
        "beginner": "مبتدی",
        "intermediate": "متوسط",
        "advanced": "پیشرفته",
    }.get(level, level)


def _available_equipment_tokens(student: Student) -> set[str] | None:
    """None => no restriction (unknown or full gym); set() => nothing available."""
    from programming.services.training_selection import available_equipment_tokens

    return available_equipment_tokens(student.equipment)


def _passes_level(
    name: str,
    level: str,
    catalog_by_name: dict[str, Exercise],
    pref_by_exercise_id: dict[str, CoachExercisePreference],
) -> bool:
    ex = catalog_by_name.get(name)
    if ex is None:
        return True
    if not ex.level or ex.level == "all" or ex.level == level:
        return True
    pref = pref_by_exercise_id.get(str(ex.id))
    if pref and level in (pref.suitable_levels or []):
        return True
    return False


# --------------------------------------------------------------------------
# Input snapshot (unchanged shape; kept for API/backwards compatibility)
# --------------------------------------------------------------------------


def build_input_snapshot(
    *,
    coach: CoachProfile,
    student: Student,
    visit: Visit | None,
    template: ProgramTemplate,
    request: dict,
) -> dict:
    rules = get_coach_rules_aggregate(coach)
    return {
        "generator_version": GENERATOR_VERSION,
        "request": request,
        "student": {
            "id": str(student.id),
            "full_name": student.full_name,
            "weight_kg": str(student.weight_kg),
            "goals": student.goals or {},
            "injuries": student.injuries or {},
            "training_background": student.training_background or {},
            "training_conditions": student.training_conditions or {},
        },
        "visit": (
            {
                "id": str(visit.id),
                "visit_date": visit.visit_date.isoformat(),
                "current_weight_kg": str(visit.current_weight_kg),
            }
            if visit
            else None
        ),
        "template": {
            "id": str(template.id),
            "name": template.name,
            "level": template.level,
            "days_per_week": template.days_per_week,
            "split": list(template.split or []),
            "muscle_priority_order": list(template.muscle_priority_order or []),
        },
        "rules_digest": hashlib.sha256(
            json.dumps(rules, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest(),
    }


# --------------------------------------------------------------------------
# Top-level orchestration
# --------------------------------------------------------------------------


def generate_document(
    *,
    coach: CoachProfile,
    student: Student,
    visit: Visit | None,
    template: ProgramTemplate,
    request: dict,
) -> tuple[dict, list[str]]:
    """Return (document sections dict, warnings)."""
    warnings: list[str] = []
    generation_notes: list[str] = []
    if visit is None:
        warnings.append("missing_latest_visit")

    # Unified visit form overlay (in-memory only; never invents "normal" for missing fields).
    context_visit = visit
    if context_visit is None or not (context_visit.answers or {}):
        context_visit = latest_visit_for_generation(student) or visit
    assessment_ctx = build_generation_context_from_visit(context_visit)
    merged = merge_student_with_assessment(
        student_goals=student.goals or {},
        student_injuries=student.injuries or {},
        student_training_background=student.training_background or {},
        student_training_conditions=student.training_conditions or {},
        assessment_ctx=assessment_ctx,
    )
    orig_goals = student.goals
    orig_injuries = student.injuries
    orig_bg = student.training_background
    orig_cond = student.training_conditions
    student.goals = merged["goals"]
    student.injuries = merged["injuries"]
    student.training_background = merged["training_background"]
    student.training_conditions = merged["training_conditions"]

    try:
        return _generate_document_body(
            coach=coach,
            student=student,
            visit=visit,
            template=template,
            request=request,
            warnings=warnings,
            generation_notes=generation_notes,
            assessment_evidence=merged.get("evidence") or {},
            assessment_ctx=assessment_ctx,
        )
    finally:
        student.goals = orig_goals
        student.injuries = orig_injuries
        student.training_background = orig_bg
        student.training_conditions = orig_cond


def _generate_document_body(
    *,
    coach: CoachProfile,
    student: Student,
    visit: Visit | None,
    template: ProgramTemplate,
    request: dict,
    warnings: list[str],
    generation_notes: list[str],
    assessment_evidence: dict,
    assessment_ctx: dict | None,
) -> tuple[dict, list[str]]:
    rule_set = ensure_rule_set(coach)
    level = str(request.get("level") or template.level or "intermediate")
    # Prefer assessed training level when request did not override and assessment set it.
    assessed_level = (student.training_background or {}).get("level")
    if (
        "level" not in request
        and assessed_level in {"beginner", "intermediate", "advanced"}
        and assessment_evidence.get("source") == "student_profile+visit"
        and "training_level"
        in (
            assessment_evidence.get("visit_overrides")
            or assessment_evidence.get("assessment_overrides")
            or []
        )
    ):
        level = assessed_level
    if level not in {"beginner", "intermediate", "advanced"}:
        level = template.level

    # Days must match the template; never silently truncate/extend a split.
    if "days_per_week" in request and request.get("days_per_week") is not None:
        try:
            requested_days = int(request.get("days_per_week"))
        except (TypeError, ValueError) as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {"days_per_week": ["days_per_week must be an integer."]},
                code="invalid_days_per_week",
            ) from exc
        if requested_days != int(template.days_per_week):
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {
                    "days_per_week": [
                        f"days_per_week ({requested_days}) must match template "
                        f"days_per_week ({template.days_per_week})."
                    ]
                },
                code="incompatible_days_per_week",
            )
        days_per_week = requested_days
    else:
        days_per_week = int(template.days_per_week)
    if days_per_week < 1 or days_per_week > 7:
        days_per_week = int(template.days_per_week)

    if template.split and len(template.split) != days_per_week:
        from rest_framework.exceptions import ValidationError

        raise ValidationError(
            {"template_id": ["Template split is inconsistent with days_per_week."]},
            code="incompatible_template",
        )

    program_type = str(request.get("program_type") or "complete")
    include_training = program_type in {"workout", "complete"}
    include_nutrition = program_type in {"nutrition", "complete"}
    include_supplements = program_type in {"supplement", "complete"}
    if request.get("include_training") is False:
        include_training = False
    if request.get("include_nutrition") is False:
        include_nutrition = False
    if request.get("include_supplements") is False:
        include_supplements = False

    if not any([include_training, include_nutrition, include_supplements]):
        warnings.append("no_sections_enabled")

    apply_injury = bool(request.get("apply_injury_rules", True))
    apply_level = bool(request.get("apply_level_rules", True))
    apply_muscle = bool(request.get("apply_muscle_priority_rules", True))
    apply_bank = bool(request.get("apply_exercise_bank", True))
    apply_general = bool(request.get("apply_general_rules", True))

    title = str(request.get("title") or f"برنامه {template.name}").strip()
    duration_weeks = int(request.get("duration_weeks") or 4)
    date_range_label = str(request.get("date_range_label") or f"{duration_weeks} هفته").strip()

    training = None
    training_evidence: dict[str, Any] = {}
    if include_training:
        training, train_warnings, training_evidence = _build_training(
            coach=coach,
            student=student,
            template=template,
            level=level,
            days_per_week=days_per_week,
            apply_injury=apply_injury,
            apply_level=apply_level,
            apply_muscle=apply_muscle,
            apply_bank=apply_bank,
            apply_general=apply_general,
            muscle_priorities_override=_as_str_list(request.get("muscle_priorities")),
            goals_override=str(request.get("goals") or ""),
            target_muscle=str(request.get("target_muscle") or ""),
            target_region=str(request.get("target_region") or ""),
            target_exercise_count=(
                int(request.get("exercise_count"))
                if request.get("exercise_count") is not None
                else None
            ),
        )
        warnings.extend(train_warnings)

    nutrition_evidence: dict[str, Any] = {"selected_template_id": None, "reason": "not_requested"}
    nutrition = None
    if include_nutrition:
        nutrition, nut_warnings, nutrition_evidence = _build_nutrition(
            coach=coach, student=student, visit=visit, request=request
        )
        warnings.extend(nut_warnings)

    supplements_evidence: dict[str, Any] = {
        "selected_template_id": None,
        "reason": "not_requested",
    }
    supplements = None
    if include_supplements:
        supplements, supp_warnings, supplements_evidence = _build_supplements(
            coach=coach, student=student, request=request
        )
        warnings.extend(supp_warnings)

    pdf_settings = {
        "contactInfo": "شماره تماس مربی",
        "fileTitle": title,
        "includeCoachName": True,
        "includeCoachNotes": True,
        "includeNutrition": include_nutrition,
        "includeStudentName": True,
        "includeSupplements": include_supplements,
        "includeTraining": include_training,
        "pageSize": "A4",
        "style": "modern",
        "coachNotes": "",
        "subtitle": date_range_label,
    }

    evidence = {
        "generator_version": GENERATOR_VERSION,
        "priority_order": list(PRIORITY_ORDER),
        "template": {"id": str(template.id), "name": template.name},
        "student": {
            "id": str(student.id),
            "goal": str((student.goals or {}).get("primary_goal") or ""),
            "level": level,
            "profile_updated_at": student.updated_at.isoformat().replace("+00:00", "Z"),
        },
        "visit": (
            {
                "id": str(visit.id),
                "date": visit.visit_date.isoformat(),
                "status": visit.status,
                "form_template_key": visit.form_template_key or None,
                "form_template_version": visit.form_template_version,
            }
            if visit
            else None
        ),
        "visit_form": {
            "present": assessment_ctx is not None,
            "id": (assessment_ctx or {}).get("visit_id")
            or (assessment_ctx or {}).get("assessment_id"),
            "date": (assessment_ctx or {}).get("visit_date")
            or (assessment_ctx or {}).get("assessment_date"),
            "template_key": (assessment_ctx or {}).get("template_key"),
            "template_version": (assessment_ctx or {}).get("template_version"),
            "applied": bool((assessment_ctx or {}).get("applied")),
            "overrides": list(
                assessment_evidence.get("visit_overrides")
                or assessment_evidence.get("assessment_overrides")
                or []
            ),
            "muscle_detail": assessment_evidence.get("muscle_detail"),
            "training_methods": assessment_evidence.get("training_methods"),
            "weekly_split": assessment_evidence.get("weekly_split"),
            "posture": assessment_evidence.get("posture"),
            "advisory_keys": assessment_evidence.get("advisory_keys") or [],
            "custom_field_keys": assessment_evidence.get("custom_field_keys") or [],
            "note": (
                "Missing visit form fields mean not assessed; they do not imply normal/strong."
            ),
        },
        # Legacy key for older consumers/tests.
        "assessment": {
            "present": assessment_ctx is not None,
            "id": (assessment_ctx or {}).get("visit_id")
            or (assessment_ctx or {}).get("assessment_id"),
            "date": (assessment_ctx or {}).get("visit_date")
            or (assessment_ctx or {}).get("assessment_date"),
            "applied": bool((assessment_ctx or {}).get("applied")),
            "overrides": list(
                assessment_evidence.get("visit_overrides")
                or assessment_evidence.get("assessment_overrides")
                or []
            ),
            "muscle_detail": assessment_evidence.get("muscle_detail"),
            "training_methods": assessment_evidence.get("training_methods"),
            "weekly_split": assessment_evidence.get("weekly_split"),
            "posture": assessment_evidence.get("posture"),
            "advisory_keys": assessment_evidence.get("advisory_keys") or [],
            "custom_field_keys": assessment_evidence.get("custom_field_keys") or [],
            "note": (
                "Missing visit form fields mean not assessed; they do not imply normal/strong."
            ),
        },        "ruleset": {
            "id": str(rule_set.id),
            "updated_at": rule_set.updated_at.isoformat().replace("+00:00", "Z"),
            "style_profile_source": (rule_set.style_profile or {}).get("source")
            or ("coach_style_profile" if rule_set.style_profile else "platform_defaults"),
        },
        "training_days": days_per_week,
        "weak_muscles": training_evidence.get("weak_muscles", []),
        "priority_muscles": training_evidence.get("priority_muscles", []),
        "strong_muscles": training_evidence.get("strong_muscles", []),
        "injury_rules_applied": training_evidence.get("injury_rules_applied", []),
        "excluded_injury": training_evidence.get("excluded_injury", []),
        "excluded_forbidden": training_evidence.get("excluded_forbidden", []),
        "excluded_due_to_injury": training_evidence.get(
            "excluded_due_to_injury", training_evidence.get("excluded_injury", [])
        ),
        "excluded_due_to_forbidden": training_evidence.get(
            "excluded_due_to_forbidden", training_evidence.get("excluded_forbidden", [])
        ),
        "excluded_due_to_equipment": training_evidence.get(
            "excluded_due_to_equipment", training_evidence.get("equipment_filters", [])
        ),
        "selected_from_coach_bank": training_evidence.get("selected_from_coach_bank", []),
        "selected_due_to_preference": training_evidence.get("selected_due_to_preference", []),
        "selected_due_to_historical_signal": training_evidence.get(
            "selected_due_to_historical_signal", []
        ),
        "replacements_applied": training_evidence.get("replacements_applied", []),
        "preferred_selected": training_evidence.get("preferred_selected", []),
        "historical_selected": training_evidence.get("historical_selected", []),
        "equipment_filters": training_evidence.get("equipment_filters", []),
        "split_resolved": training_evidence.get("split_resolved", []),
        "structured_catalog_selected": training_evidence.get("structured_catalog_selected", []),
        "structured_catalog_excluded": training_evidence.get("structured_catalog_excluded", []),
        "techniques": training_evidence.get("techniques", []),
        "nutrition": nutrition_evidence,
        "supplements": supplements_evidence,
        "warnings": list(warnings),
        "generation_notes": generation_notes,
    }

    document = {
        "title": title,
        "program_type": program_type,
        "date_range_label": date_range_label,
        "training": training,
        "nutrition": nutrition,
        "supplements": supplements,
        "pdf_settings": pdf_settings,
        "generator": {
            "version": GENERATOR_VERSION,
            "template_id": str(template.id),
            "template_name": template.name,
            "level": level,
            "days_per_week": days_per_week,
            "warnings": list(warnings),
            "not_medical_advice": True,
            "evidence": evidence,
        },
    }
    return document, warnings


def _as_str_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    return [str(value).strip()]


# --------------------------------------------------------------------------
# Training / exercise selection
# --------------------------------------------------------------------------


def _load_catalog(
    coach: CoachProfile,
) -> tuple[
    dict[tuple[str, str], Exercise],
    dict[str, Exercise],
    dict[str, dict],
    dict[str, str],
]:
    """Priority #1: ownership + active-state filtering."""
    by_pair: dict[tuple[str, str], Exercise] = {}
    by_name: dict[str, Exercise] = {}
    metadata: dict[str, dict] = {}
    excluded: dict[str, str] = {
        exercise.name: "archived" if exercise.is_archived else "inactive"
        for exercise in Exercise.objects.filter(coach=coach).only("name", "is_active", "is_archived")
        if exercise.is_archived or not exercise.is_active
    }
    rows = (
        Exercise.objects.filter(coach=coach, is_archived=False, is_active=True)
        .prefetch_related(
            "muscle_targets__muscle",
            "muscle_targets__region",
            "suitable_level_rows",
            "equipment_rows__equipment",
        )
    )
    for ex in rows:
        by_pair[(ex.primary_muscle, ex.name)] = ex
        by_name.setdefault(ex.name, ex)
        targets = list(ex.muscle_targets.all())
        primary_target = next((target for target in targets if target.role == "primary"), None)
        metadata.setdefault(
            ex.name,
            {
                "primary_muscle": primary_target.muscle.name if primary_target else ex.primary_muscle,
                "region_keys": [
                    target.region.key
                    for target in targets
                    if target.role == "primary" and target.region
                ],
                "levels": [row.level for row in ex.suitable_level_rows.all()],
                "equipment_names": [row.equipment.name for row in ex.equipment_rows.all()],
                "priority": 0,
            },
        )
    return by_pair, by_name, metadata, excluded


def _build_training(
    *,
    coach: CoachProfile,
    student: Student,
    template: ProgramTemplate,
    level: str,
    days_per_week: int,
    apply_injury: bool,
    apply_level: bool,
    apply_muscle: bool,
    apply_bank: bool,
    apply_general: bool,
    muscle_priorities_override: list[str],
    goals_override: str,
    target_muscle: str = "",
    target_region: str = "",
    target_exercise_count: int | None = None,
) -> tuple[dict, list[str], dict]:
    warnings: list[str] = []
    rule_set = ensure_rule_set(coach)

    # Priority #1 — ownership + active-state catalog.
    catalog, catalog_by_name, structured_catalog_by_name, excluded_catalog_by_name = _load_catalog(coach)
    pref_by_exercise_id = {
        str(p.exercise_id): p
        for p in CoachExercisePreference.objects.filter(coach=coach).select_related("exercise")
    }

    forbidden: set[str] = set()
    excluded_injury: list[dict] = []
    excluded_forbidden: list[dict] = []
    injury_rules_applied: list[dict] = []
    injury_alternative_map: dict[str, dict] = {}

    def _add_injury_forbidden(
        names: set[str], reason: str, rule_id: str | None, rule_name: str, alternatives: list[str]
    ) -> None:
        for nm in names:
            if nm not in forbidden:
                excluded_injury.append({"name": nm, "reason": reason})
            forbidden.add(nm)
            if alternatives:
                injury_alternative_map.setdefault(
                    nm,
                    {
                        "rule_id": rule_id,
                        "rule_name": rule_name,
                        "alternatives": list(alternatives),
                    },
                )
            else:
                injury_alternative_map.setdefault(
                    nm, {"rule_id": rule_id, "rule_name": rule_name, "alternatives": []}
                )

    # Priority #2 — student injury + movement restriction exclusions.
    injuries = student.injuries or {}
    student_profile_forbidden = _expand_forbidden(
        list(injuries.get("disallowed_exercises") or [])
        + list(injuries.get("aggravating_movements") or [])
    )
    if student_profile_forbidden:
        _add_injury_forbidden(
            student_profile_forbidden, "student_injury_profile", None, "student_profile", []
        )

    movement_restrictions = _expand_forbidden(_student_movement_restrictions(student))
    if movement_restrictions:
        _add_injury_forbidden(
            movement_restrictions, "movement_restriction", None, "movement_restriction", []
        )

    if apply_injury:
        for injury in rule_set.injury_rules.filter(is_active=True).order_by("sort_order"):
            if _injury_applies(injury, student):
                injury_rules_applied.append({"id": str(injury.id), "name": injury.name})
                expanded = _expand_forbidden(list(injury.forbidden_exercises or []))
                name_l = (injury.name or "").lower()
                if any(m in name_l for m in NECK_INJURY_MARKERS):
                    expanded |= set(NECK_FORBIDDEN)
                    expanded |= _expand_forbidden(["heavy_shoulder_press", "heavy_shrug"])
                expanded |= _alias_expand(coach, expanded)
                _add_injury_forbidden(
                    expanded,
                    f"injury_rule:{injury.name}",
                    str(injury.id),
                    injury.name,
                    list(injury.alternatives or []),
                )

        # Safety-net: always exclude heavy shoulder press / shrug patterns when the
        # student profile itself flags a neck injury, even if no matching InjuryRule
        # is configured yet. CRITICAL: this can never be overridden by historical usage.
        if _neck_injury_flagged(student):
            neck_set = set(NECK_FORBIDDEN) | _expand_forbidden(
                ["heavy_shoulder_press", "heavy_shrug"]
            )
            neck_set |= _alias_expand(coach, neck_set)
            _add_injury_forbidden(neck_set, "neck_injury_safety_default", None, "neck_default", [])

    # Priority #3 — coach forbidden (prefs prohibited + bank forbidden).
    for pref in pref_by_exercise_id.values():
        if pref.is_prohibited:
            name = pref.exercise.name
            if name not in forbidden:
                excluded_forbidden.append({"name": name, "reason": "coach_prohibited_preference"})
            forbidden.add(name)

    bank_groups = list(
        ExerciseBankGroup.objects.filter(rule_set=rule_set).order_by("sort_order", "group_name")
    )
    for group in bank_groups:
        for nm in group.forbidden_exercises or []:
            if not nm:
                continue
            if nm not in forbidden:
                excluded_forbidden.append(
                    {"name": nm, "reason": f"bank_forbidden:{group.group_name}"}
                )
            forbidden.add(nm)

    # Priority #4 — level suitability (global LevelRule forbidden list).
    if apply_level:
        level_rule = LevelRule.objects.filter(rule_set=rule_set, level_key=level).first()
        if level_rule:
            for nm in level_rule.forbidden_exercises or []:
                if not nm:
                    continue
                if nm not in forbidden:
                    excluded_forbidden.append({"name": nm, "reason": "level_rule"})
                forbidden.add(nm)
        else:
            warnings.append("missing_level_rule")
    else:
        level_rule = None

    days, selection_evidence = build_training_days(
        coach=coach,
        student=student,
        template=template,
        level=level,
        days_per_week=days_per_week,
        apply_level=apply_level,
        apply_muscle=apply_muscle,
        apply_bank=apply_bank,
        apply_general=apply_general,
        bank_groups=bank_groups if apply_bank else [],
        catalog=catalog,
        catalog_by_name=catalog_by_name,
        structured_catalog_by_name=structured_catalog_by_name,
        excluded_catalog_by_name=excluded_catalog_by_name,
        pref_by_exercise_id=pref_by_exercise_id,
        forbidden=forbidden,
        injury_alternative_map=injury_alternative_map,
        level_rule=level_rule,
        muscle_priorities_override=muscle_priorities_override,
        goals_override=goals_override,
        target_muscle=target_muscle,
        target_region=target_region,
        target_exercise_count=target_exercise_count,
        warnings=warnings,
    )

    summary = f"{days_per_week} روز تمرین بر اساس {template.name} و سطح {_level_label(level)}"
    training_evidence = {
        "weak_muscles": selection_evidence.get("weak_muscles", []),
        "priority_muscles": selection_evidence.get("priority_muscles", []),
        "strong_muscles": selection_evidence.get("strong_muscles", []),
        "injury_rules_applied": injury_rules_applied,
        "excluded_injury": excluded_injury,
        "excluded_forbidden": excluded_forbidden,
        "excluded_due_to_injury": excluded_injury,
        "excluded_due_to_forbidden": excluded_forbidden,
        "excluded_due_to_equipment": selection_evidence.get("equipment_filters", []),
        "selected_from_coach_bank": selection_evidence.get("selected_from_coach_bank", []),
        "selected_due_to_preference": selection_evidence.get("selected_due_to_preference", []),
        "selected_due_to_historical_signal": selection_evidence.get(
            "selected_due_to_historical_signal", []
        ),
        "replacements_applied": selection_evidence.get("replacements_applied", []),
        "preferred_selected": selection_evidence.get("preferred_selected", []),
        "historical_selected": selection_evidence.get("historical_selected", []),
        "equipment_filters": selection_evidence.get("equipment_filters", []),
        "split_resolved": selection_evidence.get("split_resolved", []),
        "structured_catalog_selected": selection_evidence.get("structured_catalog_selected", []),
        "structured_catalog_excluded": selection_evidence.get("structured_catalog_excluded", []),
        "techniques": selection_evidence.get("techniques", []),
    }
    return {"summary": summary, "days": days}, warnings, training_evidence


def _select_day_exercises(*_args, **_kwargs):
    """Deprecated: day construction lives in ``training_selection.build_training_days``."""
    raise RuntimeError("_select_day_exercises was replaced by build_training_days")


# --------------------------------------------------------------------------
# Nutrition
# --------------------------------------------------------------------------


def _build_nutrition(
    *, coach: CoachProfile, student: Student, visit: Visit | None, request: dict
) -> tuple[dict, list[str], dict]:
    warnings: list[str] = []
    weight = visit.current_weight_kg if visit else student.weight_kg
    weight_f = float(weight) if isinstance(weight, Decimal) else float(weight)

    base = {
        "enabled": False,
        "dailyWater": f"{round(weight_f * 35)} میلی لیتر در روز",
        "notes": "",
        "goals": str((student.goals or {}).get("primary_goal") or ""),
        "meals": [],
    }

    if _student_nutrition_safety_missing(student):
        warnings.append("nutrition_safety_data_missing")
        base["notes"] = (
            "اطلاعات ایمنی تغذیه (حساسیت غذایی/عدم تحمل/رژیم خاص) برای این شاگرد ثبت نشده است؛ "
            "برنامه غذایی غیرفعال ماند تا مربی پیش از فعال‌سازی بررسی کند."
        )
        return (
            base,
            warnings,
            {
                "selected_template_id": None,
                "selected_template_name": None,
                "reason": "safety_data_missing",
            },
        )

    goal = str((student.goals or {}).get("primary_goal") or "")
    template, reason = _select_reviewed_template(CoachNutritionTemplate, coach, goal)
    if template is None:
        warnings.append("no_reviewed_nutrition_template")
        base["notes"] = (
            f"{NUTRITION_DISCLAIMER} الگوی تغذیه بازبینی‌شده و فعالی برای انتخاب خودکار یافت نشد."
        )
        return (
            base,
            warnings,
            {"selected_template_id": None, "selected_template_name": None, "reason": reason},
        )

    base["enabled"] = True
    base["meals"] = _snapshot_template_meals(template)
    template_name = str(getattr(template, "name", ""))
    base["notes"] = f"بر اساس الگوی «{template_name}» انتخاب شد؛ {NUTRITION_DISCLAIMER}"
    return (
        base,
        warnings,
        {
            "selected_template_id": str(getattr(template, "id", "")),
            "selected_template_name": template_name,
            "reason": "selected",
        },
    )


# --------------------------------------------------------------------------
# Supplements
# --------------------------------------------------------------------------


def _build_supplements(
    *, coach: CoachProfile, student: Student, request: dict
) -> tuple[dict, list[str], dict]:
    warnings: list[str] = []
    base = {"enabled": False, "notes": SUPPLEMENT_DISCLAIMER, "items": []}

    if request.get("supplement_opt_in") is not True:
        warnings.append("supplement_opt_in_required")
        return (
            base,
            warnings,
            {
                "selected_template_id": None,
                "selected_template_name": None,
                "reason": "opt_in_required",
            },
        )

    goal = str((student.goals or {}).get("primary_goal") or "")
    template, reason = _select_reviewed_template(CoachSupplementTemplate, coach, goal)
    if template is None:
        warnings.append("no_reviewed_supplement_template")
        return (
            base,
            warnings,
            {"selected_template_id": None, "selected_template_name": None, "reason": reason},
        )

    base["enabled"] = True
    base["items"] = _snapshot_template_items(template)
    template_name = str(getattr(template, "name", ""))
    disclaimer = str(getattr(template, "medical_disclaimer", "") or SUPPLEMENT_DISCLAIMER)
    base["notes"] = f"{disclaimer} بر اساس الگوی «{template_name}»."
    return (
        base,
        warnings,
        {
            "selected_template_id": str(getattr(template, "id", "")),
            "selected_template_name": template_name,
            "reason": "selected",
        },
    )
