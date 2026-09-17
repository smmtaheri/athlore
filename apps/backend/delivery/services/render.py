"""PDF rendering constants and HTML→PDF engine (WeasyPrint)."""

from __future__ import annotations

import html
from pathlib import Path
from typing import Any

from django.template.loader import render_to_string
from django.utils import timezone

# Bump when template structure or CSS layout changes in a meaningful way.
RENDER_TEMPLATE_VERSION = "1.0.0"
RENDER_ENGINE_NAME = "weasyprint"
RENDER_ENGINE_VERSION = "66"

# System font — Noto Naskh Arabic connects Persian glyphs correctly; no CDN fetch.
DEFAULT_FONT_PATH = Path("/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf")
FALLBACK_FONT_PATHS = (
    Path("/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
)


def resolve_font_path() -> Path:
    if DEFAULT_FONT_PATH.is_file():
        return DEFAULT_FONT_PATH
    for path in FALLBACK_FONT_PATHS:
        if path.is_file():
            return path
    raise FileNotFoundError("No Unicode Arabic-capable font found for PDF rendering.")


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _pdf_include_flag(pdf_settings: dict, key: str, *, default: bool = True) -> bool:
    """Respect explicit False; only fall back when the key is absent."""
    if key not in pdf_settings:
        return default
    return bool(pdf_settings.get(key))


def build_pdf_context(
    *,
    artifact,
    program,
    version,
    student,
    coach,
    pdf_settings_override: dict | None = None,
) -> dict:
    """Build escaped template context from immutable ProgramVersion snapshots."""
    pdf_settings = {**_as_dict(version.pdf_settings), **_as_dict(pdf_settings_override)}
    training = _as_dict(version.training)
    nutrition = _as_dict(version.nutrition)
    supplements = _as_dict(version.supplements)

    include_training = _pdf_include_flag(pdf_settings, "includeTraining", default=True)
    include_nutrition = _pdf_include_flag(pdf_settings, "includeNutrition", default=True)
    include_supplements = _pdf_include_flag(pdf_settings, "includeSupplements", default=True)
    include_coach_name = _pdf_include_flag(pdf_settings, "includeCoachName", default=True)
    include_student_name = _pdf_include_flag(pdf_settings, "includeStudentName", default=True)
    include_coach_notes = _pdf_include_flag(pdf_settings, "includeCoachNotes", default=True)

    goals = _as_dict(student.goals)
    training_bg = _as_dict(student.training_background)
    injuries = _as_dict(student.injuries)
    conditions = _as_dict(student.training_conditions)

    days_out = []
    if include_training:
        for day in _as_list(training.get("days")):
            day_d = _as_dict(day)
            exercises_out = []
            for ex in _as_list(day_d.get("exercises")):
                ex_d = _as_dict(ex)
                exercises_out.append(
                    {
                        "name": _esc(ex_d.get("name") or ex_d.get("exercise_name") or ""),
                        "sets": _esc(ex_d.get("sets") or ""),
                        "reps": _esc(ex_d.get("reps") or ex_d.get("repetitions") or ""),
                        "rest": _esc(ex_d.get("rest") or ex_d.get("rest_seconds") or ""),
                        "tempo": _esc(ex_d.get("tempo") or ex_d.get("intensity") or ""),
                        "notes": _esc(ex_d.get("notes") or ex_d.get("coach_notes") or ""),
                    }
                )
            days_out.append(
                {
                    "order": _esc(day_d.get("order") or day_d.get("day_order") or ""),
                    "title": _esc(day_d.get("title") or day_d.get("name") or ""),
                    "focus": _esc(
                        ", ".join(_as_list(day_d.get("focus_muscles") or day_d.get("muscles")))
                        if isinstance(day_d.get("focus_muscles") or day_d.get("muscles"), list)
                        else (day_d.get("focus_muscles") or day_d.get("muscles") or "")
                    ),
                    "notes": _esc(day_d.get("notes") or ""),
                    "exercises": exercises_out,
                }
            )

    meals_out = []
    if include_nutrition and nutrition:
        for meal in _as_list(nutrition.get("meals")):
            meal_d = _as_dict(meal)
            items_out = []
            for item in _as_list(meal_d.get("items") or meal_d.get("foods")):
                item_d = _as_dict(item) if isinstance(item, dict) else {"description": item}
                items_out.append(
                    {
                        "description": _esc(item_d.get("description") or item_d.get("name") or ""),
                        "quantity": _esc(item_d.get("quantity") or item_d.get("amount") or ""),
                        "notes": _esc(item_d.get("notes") or ""),
                    }
                )
            meals_out.append(
                {
                    "title": _esc(meal_d.get("title") or meal_d.get("name") or ""),
                    "notes": _esc(meal_d.get("notes") or ""),
                    "items": items_out,
                }
            )

    supplement_items = []
    if include_supplements and supplements:
        for item in _as_list(supplements.get("items")):
            item_d = _as_dict(item)
            supplement_items.append(
                {
                    "name": _esc(item_d.get("name") or ""),
                    "amount": _esc(item_d.get("amount") or item_d.get("dose") or ""),
                    "timing": _esc(item_d.get("timing") or ""),
                    "instructions": _esc(item_d.get("instructions") or ""),
                    "notes": _esc(item_d.get("notes") or item_d.get("warnings") or ""),
                }
            )

    limitations = []
    if injuries.get("has_injury"):
        note = injuries.get("note") or injuries.get("description") or "محدودیت جسمی ثبت شده"
        limitations.append(_esc(note))
    if student.summary_medical_note:
        limitations.append(_esc(student.summary_medical_note))

    file_title = pdf_settings.get("fileTitle") or program.title
    subtitle = pdf_settings.get("subtitle") or program.date_range_label or ""
    coach_notes = pdf_settings.get("coachNotes") or ""
    contact = pdf_settings.get("contactInfo") or ""

    return {
        "font_path": resolve_font_path().as_uri(),
        "product_title": "Athlore",
        "file_title": _esc(file_title),
        "subtitle": _esc(subtitle),
        "coach_name": _esc(coach.display_name) if include_coach_name else "",
        "student_name": _esc(student.full_name) if include_student_name else "",
        "program_title": _esc(program.title),
        "program_id": _esc(getattr(program, "id", "")),
        "program_version_id": _esc(getattr(version, "id", "")),
        "pdf_artifact_id": _esc(getattr(artifact, "id", "")),
        "program_type": _esc(program.program_type),
        "version_number": version.version_number,
        "version_label": _esc(f"v{version.version_number}"),
        "finalized_at": _esc(
            version.finalized_at.isoformat() if getattr(version, "finalized_at", None) else ""
        ),
        "date_range": _esc(program.date_range_label or ""),
        "generated_at": _esc(timezone.now().strftime("%Y-%m-%d %H:%M UTC")),
        "template_version": RENDER_TEMPLATE_VERSION,
        "goal": _esc(goals.get("primary_goal") or goals.get("goal") or ""),
        "level": _esc(training_bg.get("level") or ""),
        "weekly_days": _esc(
            conditions.get("days_per_week") or training_bg.get("days_per_week") or ""
        ),
        "limitations": limitations,
        "coach_notes": _esc(coach_notes) if include_coach_notes else "",
        "student_coach_notes": _esc(student.coach_notes) if include_coach_notes else "",
        "contact_info": _esc(contact),
        "include_training": include_training and bool(days_out),
        "include_nutrition": include_nutrition and bool(nutrition),
        "include_supplements": include_supplements and bool(supplements),
        "training_summary": _esc(training.get("summary") or ""),
        "days": days_out,
        "nutrition_notes": _esc(nutrition.get("notes") or ""),
        "meals": meals_out,
        "supplement_notes": _esc(supplements.get("notes") or ""),
        "supplement_items": supplement_items,
        "safety_notice": (
            "این برنامه توسط مربی تهیه شده و جایگزین مشاوره پزشکی نیست. "
            "مکمل‌ها نسخه پزشکی محسوب نمی‌شوند."
        ),
    }


def render_program_pdf_bytes(
    *,
    artifact,
    program,
    version,
    student,
    coach,
    pdf_settings_override: dict | None = None,
) -> bytes:
    context = build_pdf_context(
        artifact=artifact,
        program=program,
        version=version,
        student=student,
        coach=coach,
        pdf_settings_override=pdf_settings_override,
    )
    html_document = render_to_string("delivery/program_pdf.html", context)
    try:
        from delivery.services.pdf_security import render_html_to_pdf_safe
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("WeasyPrint is not installed.") from exc

    return render_html_to_pdf_safe(html_document)
