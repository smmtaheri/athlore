"""On-demand Coach Rules and Student profile PDF exports (no PdfArtifact)."""

from __future__ import annotations

import html
from datetime import date
from typing import Any

from django.template.loader import render_to_string
from django.utils import timezone

from accounts.models import CoachProfile, CoachRuleSet
from accounts.rules_services import get_coach_rules_aggregate
from delivery.services.render import resolve_font_path
from students.models import Student, Visit


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _list_or_empty(items: list[str]) -> list[str]:
    cleaned = [_esc(x) for x in items if str(x).strip()]
    return cleaned or ["— (خالی)"]


def _slug_name(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in " _-" else "-" for ch in name)
    return "-".join(cleaned.split()) or "export"


def render_html_to_pdf(html_document: str) -> bytes:
    try:
        from delivery.services.pdf_security import render_html_to_pdf_safe
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("WeasyPrint is not installed.") from exc
    return render_html_to_pdf_safe(html_document)


def build_coach_rules_pdf(*, coach: CoachProfile) -> tuple[bytes, str]:
    rule_set = CoachRuleSet.objects.filter(coach=coach).first()
    aggregate = get_coach_rules_aggregate(coach)
    export_at = timezone.now()
    user = coach.user
    templates = []
    for item in aggregate.get("templates") or []:
        templates.append(
            {
                "name": _esc(item.get("name")),
                "goal": _esc(item.get("goal")),
                "main_goal": _esc(item.get("main_goal")),
                "level": _esc(item.get("level")),
                "days_per_week": _esc(item.get("days_per_week")),
                "intensity": _esc(item.get("intensity")),
                "volume": _esc(item.get("volume")),
                "rest_time": _esc(item.get("rest_time")),
                "split": _list_or_empty(_as_list(item.get("split"))),
                "muscle_priority_order": _list_or_empty(
                    _as_list(item.get("muscle_priority_order"))
                ),
                "special_rules": _list_or_empty(_as_list(item.get("special_rules"))),
                "is_active": bool(item.get("is_active")),
            }
        )
    levels = []
    for item in aggregate.get("levels") or []:
        levels.append(
            {
                "id": _esc(item.get("id")),
                "intensity": _esc(item.get("intensity")),
                "volume": _esc(item.get("volume")),
                "allowed_techniques": _list_or_empty(_as_list(item.get("allowed_techniques"))),
                "forbidden_exercises": _list_or_empty(_as_list(item.get("forbidden_exercises"))),
                "required_exercises": _list_or_empty(_as_list(item.get("required_exercises"))),
                "coach_notes": _esc(item.get("coach_notes")),
            }
        )
    injuries = []
    for item in aggregate.get("injuries") or []:
        injuries.append(
            {
                "name": _esc(item.get("name")),
                "forbidden_exercises": _list_or_empty(_as_list(item.get("forbidden_exercises"))),
                "alternatives": _list_or_empty(_as_list(item.get("alternatives"))),
                "notes": _esc(item.get("notes")),
            }
        )
    muscle_priorities = []
    for item in aggregate.get("muscle_priorities") or []:
        muscle_priorities.append(
            {
                "muscle": _esc(item.get("muscle")),
                "extra_exercises": _esc(item.get("extra_exercises")),
                "extra_sets": _esc(item.get("extra_sets")),
                "order_change": _esc(item.get("order_change")),
                "notes": _esc(item.get("notes")),
            }
        )
    exercise_bank = []
    for item in aggregate.get("exercise_bank") or []:
        exercise_bank.append(
            {
                "group": _esc(item.get("group") or item.get("group_name")),
                "favorite_exercises": _list_or_empty(_as_list(item.get("favorite_exercises"))),
                "beginner_friendly": _list_or_empty(_as_list(item.get("beginner_friendly"))),
                "professional_friendly": _list_or_empty(
                    _as_list(item.get("professional_friendly"))
                ),
                "forbidden_exercises": _list_or_empty(_as_list(item.get("forbidden_exercises"))),
            }
        )
    general = _as_dict(aggregate.get("general_rules"))
    general_items = []
    for item in general.get("items") or []:
        general_items.append(
            {
                "title": _esc(item.get("title")),
                "description": _esc(item.get("description")),
                "category": _esc(item.get("category")),
                "importance": _esc(item.get("importance")),
                "is_active": bool(item.get("is_active", True)),
            }
        )

    prefs = list(
        coach.exercise_preferences.select_related("exercise").order_by("exercise__name")[:200]
    )
    preferred = [_esc(p.exercise.name) for p in prefs if getattr(p, "is_preferred", False)]
    forbidden_prefs = [_esc(p.exercise.name) for p in prefs if getattr(p, "is_prohibited", False)]

    context = {
        "font_path": resolve_font_path().as_uri(),
        "coach_id": _esc(coach.id),
        "coach_name": _esc(coach.display_name),
        "coach_email": _esc(user.email),
        "coach_phone": _esc(coach.phone_number or "—"),
        "control_mode": _esc(coach.control_mode),
        "style_notes": _esc(coach.style_notes or "— (خالی)"),
        "default_session_minutes": _esc(coach.default_session_minutes),
        "ruleset_id": _esc(rule_set.id if rule_set else "—"),
        "rules_updated_at": _esc(aggregate.get("updated_at") or ""),
        "export_at": _esc(export_at.strftime("%Y-%m-%d %H:%M UTC")),
        "schema_version": _esc(aggregate.get("schema_version")),
        "templates": templates or None,
        "levels": levels or None,
        "injuries": injuries or None,
        "muscle_priorities": muscle_priorities or None,
        "exercise_bank": exercise_bank or None,
        "general_extra_notes": _esc(general.get("extra_notes") or "— (خالی)"),
        "general_items": general_items or None,
        "preferred_exercises": preferred or ["— (خالی)"],
        "forbidden_preference_exercises": forbidden_prefs or ["— (خالی)"],
        "nutrition_templates": [
            {
                "name": _esc(t.get("name")),
                "status": _esc(t.get("status")),
                "needs_coach_review": bool(t.get("needs_coach_review")),
                "is_eligible_for_auto_select": bool(t.get("is_eligible_for_auto_select")),
                "purpose": _esc(t.get("purpose") or "—"),
            }
            for t in (aggregate.get("nutrition_templates") or [])
        ]
        or None,
        "supplement_templates": [
            {
                "name": _esc(t.get("name")),
                "status": _esc(t.get("status")),
                "needs_coach_review": bool(t.get("needs_coach_review")),
                "is_eligible_for_auto_select": bool(t.get("is_eligible_for_auto_select")),
                "source_documents": _list_or_empty(_as_list(t.get("source_documents"))),
            }
            for t in (aggregate.get("supplement_templates") or [])
        ]
        or None,
    }
    html_document = render_to_string("delivery/coach_rules_pdf.html", context)
    pdf = render_html_to_pdf(html_document)
    filename = f"قوانین-مربی-{_slug_name(coach.display_name)}-{date.today().isoformat()}.pdf"
    return pdf, filename


def build_student_profile_pdf(*, student: Student, coach: CoachProfile) -> tuple[bytes, str]:
    goals = _as_dict(student.goals)
    injuries = _as_dict(student.injuries)
    equipment = _as_dict(student.equipment)
    lifestyle = _as_dict(student.lifestyle)
    preferences = _as_dict(student.preferences)
    training_bg = _as_dict(student.training_background)
    conditions = _as_dict(student.training_conditions)
    visits = list(Visit.objects.filter(student=student).order_by("-visit_date")[:8])
    latest = visits[0] if visits else None
    export_at = timezone.now()

    visit_rows = []
    for visit in visits:
        visit_rows.append(
            {
                "id": _esc(visit.id),
                "date": _esc(visit.visit_date),
                "weight": _esc(visit.current_weight_kg),
                "prev_weight": _esc(visit.previous_weight_kg),
                "energy": _esc(visit.daily_energy_level),
                "sleep": _esc(visit.sleep_quality),
                "stress": _esc(visit.stress_level),
                "waist": _esc(visit.waist_cm),
                "chest": _esc(visit.chest_cm),
                "arm": _esc(visit.arm_cm),
                "thigh": _esc(visit.thigh_cm),
                "hip": _esc(visit.hip_cm),
                "notes": _esc(visit.coach_notes or visit.coach_assessment or ""),
            }
        )

    context = {
        "font_path": resolve_font_path().as_uri(),
        "student_id": _esc(student.id),
        "student_name": _esc(student.full_name),
        "phone": _esc(student.phone_number or "—"),
        "coach_id": _esc(coach.id),
        "coach_name": _esc(coach.display_name),
        "coach_email": _esc(coach.user.email),
        "profile_updated_at": _esc(
            student.updated_at.isoformat().replace("+00:00", "Z") if student.updated_at else ""
        ),
        "export_at": _esc(export_at.strftime("%Y-%m-%d %H:%M UTC")),
        "age": _esc(student.age),
        "gender": _esc(student.gender),
        "height_cm": _esc(student.height_cm),
        "weight_kg": _esc(student.weight_kg),
        "status": _esc(student.status),
        "archived_at": _esc(student.archived_at or "—"),
        "primary_goal": _esc(goals.get("primary_goal")),
        "secondary_goal": _esc(goals.get("secondary_goal")),
        "weak_muscles": _list_or_empty(_as_list(goals.get("weak_muscles"))),
        "strong_muscles": _list_or_empty(_as_list(goals.get("strong_muscles"))),
        "muscle_priorities": _list_or_empty(_as_list(goals.get("muscle_priorities"))),
        "training_level": _esc(training_bg.get("level")),
        "training_experience": _esc(training_bg.get("training_experience")),
        "free_weight": _esc(training_bg.get("has_free_weight_experience")),
        "basic_form": _esc(training_bg.get("basic_movement_familiarity")),
        "days_per_week": _esc(conditions.get("training_days_per_week")),
        "session_duration": _esc(conditions.get("session_duration_minutes")),
        "training_preference": _esc(conditions.get("training_preference")),
        "intensity_preference": _esc(preferences.get("intensity_preference")),
        "cardio_preference": _esc(conditions.get("cardio_interest")),
        "has_injury": _esc(injuries.get("has_injury")),
        "injury_type": _esc(injuries.get("injury_type")),
        "disallowed_exercises": _list_or_empty(_as_list(injuries.get("disallowed_exercises"))),
        "aggravating_movements": _list_or_empty(_as_list(injuries.get("aggravating_movements"))),
        "disliked_exercises": _esc(preferences.get("disliked_training_styles")),
        "favorite_exercises": _esc(preferences.get("favorite_exercises")),
        "eq_dumbbell": _esc(equipment.get("hasDumbbell", equipment.get("has_dumbbell", "—"))),
        "eq_barbell": _esc(equipment.get("hasBarbell", equipment.get("has_barbell", "—"))),
        "eq_cable": _esc(equipment.get("hasCable", equipment.get("has_cable", "—"))),
        "eq_machines": _esc(equipment.get("hasMachines", equipment.get("has_machines", "—"))),
        "eq_full_gym": _esc(equipment.get("hasFullGym", equipment.get("has_full_gym", "—"))),
        "occupation": _esc(lifestyle.get("occupation")),
        "daily_activity": _esc(lifestyle.get("daily_activity_level")),
        "sleep": _esc(lifestyle.get("sleep_quality")),
        "stress": _esc(lifestyle.get("stress_level")),
        "coach_notes": _esc(student.coach_notes or "— (خالی)"),
        "food_allergies": _list_or_empty(_as_list(getattr(student, "food_allergies", None) or [])),
        "food_intolerances": _list_or_empty(
            _as_list(getattr(student, "food_intolerances", None) or [])
        ),
        "dietary_restrictions": _list_or_empty(
            _as_list(getattr(student, "dietary_restrictions", None) or [])
        ),
        "dietary_preferences": _list_or_empty(
            _as_list(getattr(student, "dietary_preferences", None) or [])
        ),
        "supplement_restrictions": _list_or_empty(
            _as_list(getattr(student, "supplement_restrictions", None) or [])
        ),
        "relevant_medical_notes": _esc(
            getattr(student, "relevant_medical_notes", "") or "— (خالی)"
        ),
        "nutrition_notes": _esc(getattr(student, "nutrition_notes", "") or "— (خالی)"),
        "equipment_summary": _esc(
            " · ".join(
                [
                    f"دمبل={equipment.get('has_dumbbell') or equipment.get('hasDumbbell')}",
                    f"هالتر={equipment.get('has_barbell') or equipment.get('hasBarbell')}",
                    f"کابل={equipment.get('has_cable') or equipment.get('hasCable')}",
                    f"دستگاه={equipment.get('has_machines') or equipment.get('hasMachines')}",
                    f"باشگاه کامل={equipment.get('has_full_gym') or equipment.get('hasFullGym')}",
                ]
            )
        ),
        "latest_visit_id": _esc(latest.id if latest else "—"),
        "latest_visit_date": _esc(latest.visit_date if latest else "—"),
        "visit_rows": visit_rows or None,
    }
    html_document = render_to_string("delivery/student_profile_pdf.html", context)
    pdf = render_html_to_pdf(html_document)
    filename = f"اطلاعات-شاگرد-{_slug_name(student.full_name)}-{date.today().isoformat()}.pdf"
    return pdf, filename
