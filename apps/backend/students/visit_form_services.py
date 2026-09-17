"""CRUD helpers for coach visit form templates and visit dynamic answers."""

from __future__ import annotations

import copy
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import CoachProfile
from students.models import Student, Visit
from students.visit_form_models import CoachVisitFormTemplate

VALID_FIELD_TYPES = {
    "text",
    "number",
    "boolean",
    "single_select",
    "multi_select",
    "textarea",
    "date",
}

VALID_VISIT_STATUSES = {c.value for c in Visit.Status}


def _resolve_prefill(student: Student, path: str) -> Any:
    if not path or not path.startswith("student."):
        return None
    parts = path.split(".")[1:]
    cur: Any = student
    for part in parts:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            cur = getattr(cur, part, None)
            if callable(cur):
                return None
    if cur is None:
        return None
    if hasattr(cur, "isoformat"):
        return cur.isoformat()
    if hasattr(cur, "__float__") and not isinstance(cur, bool):
        try:
            return float(cur)
        except (TypeError, ValueError):
            return str(cur)
    return cur


def serialize_template(template: CoachVisitFormTemplate) -> dict:
    return {
        "id": str(template.id),
        "key": template.key,
        "name": template.name,
        "version": template.version,
        "description": template.description,
        "sections": list(template.sections or []),
        "is_active": template.is_active,
        "is_default": template.is_default,
        "created_at": template.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": template.updated_at.isoformat().replace("+00:00", "Z"),
    }


def list_templates(coach: CoachProfile):
    return CoachVisitFormTemplate.objects.filter(coach=coach).order_by("-is_default", "name")


def get_template_for_coach(coach: CoachProfile, template_id) -> CoachVisitFormTemplate:
    return get_object_or_404(CoachVisitFormTemplate, coach=coach, id=template_id)


def get_default_template(coach: CoachProfile) -> CoachVisitFormTemplate | None:
    default = CoachVisitFormTemplate.objects.filter(
        coach=coach, is_active=True, is_default=True
    ).first()
    if default is not None:
        return default
    return (
        CoachVisitFormTemplate.objects.filter(coach=coach, is_active=True)
        .order_by("-updated_at")
        .first()
    )


# Back-compat alias used by older call sites during transition.
get_active_template = get_default_template


def _validate_sections(sections: Any) -> list:
    if sections is None:
        return []
    if not isinstance(sections, list):
        raise ValidationError({"sections": ["Must be a list of sections."]})
    cleaned = []
    for idx, section in enumerate(sections):
        if not isinstance(section, dict):
            raise ValidationError({"sections": [f"Section {idx} must be an object."]})
        fields = section.get("fields") or []
        if not isinstance(fields, list):
            raise ValidationError({"sections": [f"Section {idx} fields must be a list."]})
        clean_fields = []
        for fidx, field in enumerate(fields):
            if not isinstance(field, dict):
                raise ValidationError({"sections": [f"Field {fidx} in section {idx} invalid."]})
            ftype = str(field.get("type") or "text")
            if ftype not in VALID_FIELD_TYPES:
                raise ValidationError(
                    {"sections": [f"Unsupported field type '{ftype}' in section {idx}."]}
                )
            student_visible = bool(field.get("student_visible", False))
            student_editable = bool(field.get("student_editable", False))
            if student_editable:
                student_visible = True
            if "student_visible_when_finalized" in field:
                student_visible_when_finalized = bool(field.get("student_visible_when_finalized"))
            else:
                # Old snapshots / payloads without the key inherit open-visit visibility.
                student_visible_when_finalized = student_visible
            clean_fields.append(
                {
                    "key": str(field.get("key") or "").strip(),
                    "semantic_key": str(field.get("semantic_key") or "").strip(),
                    "label": str(field.get("label") or "").strip(),
                    "type": ftype,
                    "options": list(field.get("options") or []),
                    "required": bool(field.get("required", False)),
                    "enabled": bool(field.get("enabled", True)),
                    "order": int(field.get("order") or fidx),
                    "help_text": str(field.get("help_text") or ""),
                    "prefill_from": str(field.get("prefill_from") or ""),
                    "student_visible": student_visible,
                    "student_visible_when_finalized": student_visible_when_finalized,
                    "student_editable": student_editable,
                    "coach_editable": bool(field.get("coach_editable", True)),
                }
            )
            if not clean_fields[-1]["key"]:
                raise ValidationError({"sections": [f"Field key required in section {idx}."]})
        cleaned.append(
            {
                "key": str(section.get("key") or f"section_{idx}").strip(),
                "label": str(section.get("label") or "").strip(),
                "order": int(section.get("order") or idx),
                "fields": clean_fields,
            }
        )
    return cleaned


def _clear_other_defaults(coach: CoachProfile, keep_id=None) -> None:
    qs = CoachVisitFormTemplate.objects.filter(coach=coach, is_default=True)
    if keep_id is not None:
        qs = qs.exclude(pk=keep_id)
    qs.update(is_default=False)


@transaction.atomic
def create_template(coach: CoachProfile, payload: dict) -> CoachVisitFormTemplate:
    key = str(payload.get("key") or "default").strip()
    if not key:
        raise ValidationError({"key": ["Required."]})
    if CoachVisitFormTemplate.objects.filter(coach=coach, key=key).exists():
        raise ValidationError({"key": ["Template key already exists for this coach."]})
    is_default = bool(payload.get("is_default", False))
    if is_default:
        _clear_other_defaults(coach)
    elif not CoachVisitFormTemplate.objects.filter(coach=coach, is_default=True).exists():
        # First template for a coach becomes default when none set.
        is_default = True
    return CoachVisitFormTemplate.objects.create(
        coach=coach,
        key=key,
        name=str(payload.get("name") or key).strip() or key,
        version=int(payload.get("version") or 1),
        description=str(payload.get("description") or ""),
        sections=_validate_sections(payload.get("sections")),
        is_active=bool(payload.get("is_active", True)),
        is_default=is_default,
    )


@transaction.atomic
def update_template(
    template: CoachVisitFormTemplate, payload: dict, *, bump_version: bool = True
) -> CoachVisitFormTemplate:
    if "name" in payload:
        template.name = str(payload.get("name") or template.name).strip()
    if "description" in payload:
        template.description = str(payload.get("description") or "")
    if "is_active" in payload:
        template.is_active = bool(payload.get("is_active"))
        if not template.is_active:
            template.is_default = False
    if "is_default" in payload and payload.get("is_default"):
        if not template.is_active:
            raise ValidationError({"is_default": ["Cannot default an inactive template."]})
        _clear_other_defaults(template.coach, keep_id=template.id)
        template.is_default = True
    elif "is_default" in payload and not payload.get("is_default"):
        template.is_default = False
    if "sections" in payload:
        template.sections = _validate_sections(payload.get("sections"))
        if bump_version:
            template.version = int(template.version or 1) + 1
    if "version" in payload and not bump_version:
        template.version = int(payload["version"])
    template.save()
    return template


@transaction.atomic
def set_default_template(
    coach: CoachProfile, template: CoachVisitFormTemplate
) -> CoachVisitFormTemplate:
    if template.coach_id != coach.id:
        raise PermissionDenied("Template belongs to another coach.")
    if not template.is_active:
        raise ValidationError({"is_active": ["Cannot default an inactive template."]})
    _clear_other_defaults(coach, keep_id=template.id)
    template.is_default = True
    template.save(update_fields=["is_default", "updated_at"])
    return template


@transaction.atomic
def duplicate_template(
    coach: CoachProfile, template: CoachVisitFormTemplate, *, new_key: str | None = None
) -> CoachVisitFormTemplate:
    if template.coach_id != coach.id:
        raise PermissionDenied("Template belongs to another coach.")
    base_key = (new_key or f"{template.key}_copy").strip()
    key = base_key
    n = 2
    while CoachVisitFormTemplate.objects.filter(coach=coach, key=key).exists():
        key = f"{base_key}_{n}"
        n += 1
    return CoachVisitFormTemplate.objects.create(
        coach=coach,
        key=key,
        name=f"{template.name} (کپی)",
        version=1,
        description=template.description,
        sections=copy.deepcopy(template.sections or []),
        is_active=True,
        is_default=False,
    )


def ensure_visit_form_from_fixture(
    coach: CoachProfile, fixture: dict, *, create_only: bool = True
) -> tuple[CoachVisitFormTemplate, bool]:
    """Create visit form template from fixture if missing. Never overwrite when create_only."""
    key = str(fixture.get("key") or "default")
    existing = CoachVisitFormTemplate.objects.filter(coach=coach, key=key).first()
    if existing is not None:
        return existing, False
    is_default = bool(fixture.get("is_default", False))
    if is_default:
        _clear_other_defaults(coach)
    elif not CoachVisitFormTemplate.objects.filter(coach=coach, is_default=True).exists():
        is_default = bool(fixture.get("is_default", False))
    template = CoachVisitFormTemplate.objects.create(
        coach=coach,
        key=key,
        name=str(fixture.get("name") or key),
        version=int(fixture.get("version") or 1),
        description=str(fixture.get("description") or ""),
        sections=copy.deepcopy(fixture.get("sections") or []),
        is_active=bool(fixture.get("is_active", True)),
        is_default=is_default,
    )
    return template, True


# Alias for seed call sites during rename.
ensure_template_from_fixture = ensure_visit_form_from_fixture


def build_prefill_answers(student: Student, template: CoachVisitFormTemplate) -> dict:
    answers: dict[str, Any] = {}
    for section in template.sections or []:
        for field in section.get("fields") or []:
            path = str(field.get("prefill_from") or "")
            if not path:
                continue
            value = _resolve_prefill(student, path)
            if value is not None and value != "":
                answers[str(field["key"])] = value
    return answers


def snapshot_template(template: CoachVisitFormTemplate) -> dict:
    return {
        "id": str(template.id),
        "key": template.key,
        "name": template.name,
        "version": template.version,
        "sections": copy.deepcopy(template.sections or []),
    }


def iter_template_fields(sections: list | None):
    for section in sections or []:
        yield from section.get("fields") or []


STUDENT_MODE_OPEN = "open"
STUDENT_MODE_FINALIZED = "finalized"


def visit_student_mode(visit: Visit) -> str:
    """Which visibility ruleset applies for the student view of this visit.

    Finalized visits use `student_visible_when_finalized`; every other status
    uses `student_visible`.
    """
    return STUDENT_MODE_FINALIZED if visit.status == Visit.Status.FINALIZED else STUDENT_MODE_OPEN


def _field_visible_for_mode(field: dict, mode: str) -> bool:
    if not field.get("enabled", True):
        return False
    if mode == STUDENT_MODE_FINALIZED:
        if "student_visible_when_finalized" in field:
            return bool(field.get("student_visible_when_finalized"))
        # Old snapshots taken before this field existed fall back to open visibility.
        return bool(field.get("student_visible"))
    return bool(field.get("student_visible"))


def filter_answers_for_student(
    answers: dict, snapshot: dict, *, mode: str = STUDENT_MODE_OPEN
) -> dict:
    """Return only field answers visible to the student for the given mode."""
    visible_keys = {
        str(f.get("key"))
        for f in iter_template_fields(snapshot.get("sections") if snapshot else None)
        if _field_visible_for_mode(f, mode)
    }
    return {k: v for k, v in (answers or {}).items() if k in visible_keys}


def student_editable_field_keys(snapshot: dict) -> list[str]:
    return [
        str(f.get("key"))
        for f in iter_template_fields(snapshot.get("sections") if snapshot else None)
        if f.get("student_editable") and f.get("enabled", True) and f.get("key")
    ]


def coach_editable_field_map(snapshot: dict) -> dict[str, bool]:
    """Map of field key -> coach_editable flag for every field defined on the snapshot."""
    return {
        str(f.get("key")): bool(f.get("coach_editable", True))
        for f in iter_template_fields(snapshot.get("sections") if snapshot else None)
        if f.get("key")
    }


def serialize_visit_form_payload(
    visit: Visit, *, for_student: bool = False, mode: str | None = None
) -> dict:
    """Extra form fields for visit API (coach full vs student filtered)."""
    snapshot = visit.form_template_snapshot or {}
    answers = dict(visit.answers or {})
    if for_student:
        if mode is None:
            mode = visit_student_mode(visit)
        answers = filter_answers_for_student(answers, snapshot, mode=mode)
        # Filter snapshot sections to fields visible for this mode only.
        filtered_sections = []
        for section in snapshot.get("sections") or []:
            fields = [f for f in (section.get("fields") or []) if _field_visible_for_mode(f, mode)]
            if fields:
                filtered_sections.append({**section, "fields": fields})
        snapshot = {**snapshot, "sections": filtered_sections}
        return {
            "form_template_id": str(visit.form_template_id) if visit.form_template_id else None,
            "form_template_key": visit.form_template_key,
            "form_template_version": visit.form_template_version,
            "form_template_snapshot": snapshot,
            "form_template_name": (snapshot.get("name") or visit.form_template_key or ""),
            "answers": answers,
            "answer_sources": {
                k: v for k, v in (visit.answer_sources or {}).items() if k in answers
            },
            "status": visit.status,
            "student_editable_fields": (
                student_editable_field_keys(snapshot)
                if visit.status == Visit.Status.WAITING_FOR_STUDENT and not is_visit_expired(visit)
                else []
            ),
            "sent_at": (
                visit.sent_at.isoformat().replace("+00:00", "Z") if visit.sent_at else None
            ),
            "expires_at": (
                visit.expires_at.isoformat().replace("+00:00", "Z") if visit.expires_at else None
            ),
            "is_expired": is_visit_expired(visit),
            "submitted_by_student_at": (
                visit.submitted_by_student_at.isoformat().replace("+00:00", "Z")
                if visit.submitted_by_student_at
                else None
            ),
            "finalized_at": (
                visit.finalized_at.isoformat().replace("+00:00", "Z")
                if visit.finalized_at
                else None
            ),
        }
    return {
        "form_template_id": str(visit.form_template_id) if visit.form_template_id else None,
        "form_template_key": visit.form_template_key,
        "form_template_version": visit.form_template_version,
        "form_template_snapshot": snapshot,
        "form_template_name": (snapshot.get("name") or visit.form_template_key or ""),
        "answers": answers,
        "answer_sources": dict(visit.answer_sources or {}),
        "status": visit.status,
        "coach_private_notes": visit.coach_private_notes,
        "sent_at": (visit.sent_at.isoformat().replace("+00:00", "Z") if visit.sent_at else None),
        "expires_at": (
            visit.expires_at.isoformat().replace("+00:00", "Z") if visit.expires_at else None
        ),
        "submitted_by_student_at": (
            visit.submitted_by_student_at.isoformat().replace("+00:00", "Z")
            if visit.submitted_by_student_at
            else None
        ),
        "finalized_at": (
            visit.finalized_at.isoformat().replace("+00:00", "Z") if visit.finalized_at else None
        ),
    }


def serialize_visit_for_student(visit: Visit) -> dict:
    """Student-safe visit representation (no coach-private fields, no revisions)."""
    from students.serializers import VisitSerializer

    data = VisitSerializer(visit).data
    # Strip coach-private core fields.
    data.pop("coach_notes", None)
    data.pop("coach_assessment", None)
    data.pop("coach_private_notes", None)
    data.pop("answer_history", None)
    data.update(serialize_visit_form_payload(visit, for_student=True))
    return data


def serialize_answer_revision(revision) -> dict:
    return {
        "id": str(revision.id),
        "field_key": revision.field_key,
        "value": revision.value,
        "source": revision.source,
        "actor_id": str(revision.actor_id) if revision.actor_id else None,
        "created_at": revision.created_at.isoformat().replace("+00:00", "Z"),
    }


def list_answer_revisions(visit: Visit, *, field_key: str | None = None):
    qs = visit.answer_revisions.all()
    if field_key:
        qs = qs.filter(field_key=field_key)
    return qs.order_by("-created_at")


def resolve_form_template(coach: CoachProfile, payload: dict) -> CoachVisitFormTemplate | None:
    template_id = payload.get("form_template_id") or payload.get("template_id")
    if template_id:
        return get_template_for_coach(coach, template_id)
    if payload.get("skip_form_template"):
        return None
    return get_default_template(coach)


def apply_form_template_to_visit(
    visit: Visit,
    template: CoachVisitFormTemplate | None,
    *,
    answers: dict | None = None,
    answer_source: str = "coach",
    prefill_student: Student | None = None,
    set_answers: bool = True,
) -> None:
    """Assign template metadata (and optionally initial answers) to a visit.

    When `set_answers` is False, only the form_template/snapshot fields are
    touched; callers should populate `visit.answers` via `record_answer_changes`
    so field-level revisions are tracked.
    """
    if template is None:
        visit.form_template = None
        visit.form_template_key = ""
        visit.form_template_version = 1
        visit.form_template_snapshot = {}
        if set_answers and answers is not None:
            visit.answers = answers
        return
    visit.form_template = template
    visit.form_template_key = template.key
    visit.form_template_version = template.version
    visit.form_template_snapshot = snapshot_template(template)
    if not set_answers:
        return
    if answers is None:
        answers = build_prefill_answers(prefill_student, template) if prefill_student else {}
        source = "prefill"
    else:
        source = answer_source
    if not isinstance(answers, dict):
        raise ValidationError({"answers": ["Must be an object."]})
    visit.answers = answers
    sources = dict(visit.answer_sources or {})
    for key in answers:
        sources.setdefault(key, source)
    visit.answer_sources = sources


# ---------------------------------------------------------------------------
# Answer revisions
# ---------------------------------------------------------------------------


def record_answer_changes(
    visit: Visit,
    new_answers_partial: dict,
    *,
    source: str,
    actor=None,
) -> dict:
    """Merge changed keys into visit.answers, recording a VisitAnswerRevision per change.

    Mutates `visit.answers` / `visit.answer_sources` in place; does not save().
    Only creates revisions (and requires visit.pk) for keys whose value actually changed.
    """
    from students.models import VisitAnswerRevision

    if not isinstance(new_answers_partial, dict):
        raise ValidationError({"answers": ["Must be an object."]})

    current = dict(visit.answers or {})
    sources = dict(visit.answer_sources or {})
    changed_keys = []
    for key, value in new_answers_partial.items():
        key = str(key)
        if key in current and current[key] == value:
            continue
        changed_keys.append(key)
        current[key] = value
        sources[key] = source

    visit.answers = current
    visit.answer_sources = sources

    if changed_keys and visit.pk:
        actor_user = actor if (actor is not None and getattr(actor, "pk", None)) else None
        VisitAnswerRevision.objects.bulk_create(
            [
                VisitAnswerRevision(
                    visit=visit,
                    field_key=key,
                    value=current[key],
                    source=source,
                    actor=actor_user,
                )
                for key in changed_keys
            ]
        )
    return current


def update_visit_answers_as_coach(visit: Visit, answers_partial: dict, *, actor=None) -> dict:
    """Apply a coach-initiated partial answers update, enforcing coach_editable + lock state."""
    if not isinstance(answers_partial, dict):
        raise ValidationError({"answers": ["Must be an object."]})
    if visit.status == Visit.Status.FINALIZED:
        raise ValidationError(
            {"answers": ["Visit is finalized; answers cannot be modified."]},
            code="visit_finalized",
        )
    # Avoid racing the student while the form is open, and require an explicit
    # start-coach-review before editing answers after student_submitted.
    if visit.status in {
        Visit.Status.WAITING_FOR_STUDENT,
        Visit.Status.STUDENT_SUBMITTED,
    }:
        raise ValidationError(
            {
                "answers": [
                    "Coach cannot edit answers while the student form is open or "
                    "before starting coach review."
                ]
            },
            code="invalid_visit_status",
        )
    if visit.status not in {Visit.Status.DRAFT, Visit.Status.COACH_REVIEW}:
        raise ValidationError(
            {"answers": [f"Cannot edit answers from status '{visit.status}'."]},
            code="invalid_visit_status",
        )
    editable_map = coach_editable_field_map(visit.form_template_snapshot or {})
    if editable_map:
        # Frontend often posts the full answers object (including student-only
        # keys). Ignore non-editable keys instead of failing the whole save —
        # otherwise "send to student" (save-then-send) breaks after a successful create.
        answers_partial = {
            k: v
            for k, v in answers_partial.items()
            if editable_map.get(str(k), True) is not False
        }
    if not answers_partial:
        return visit.answers or {}
    return record_answer_changes(visit, answers_partial, source="coach", actor=actor)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

DEFAULT_EXPIRES_IN_DAYS = 30


def is_visit_expired(visit: Visit) -> bool:
    return bool(visit.expires_at and timezone.now() > visit.expires_at)


@transaction.atomic
def send_visit_to_student(visit: Visit, *, expires_in_days: int = DEFAULT_EXPIRES_IN_DAYS) -> Visit:
    """Open the visit for student self-report; extends expiry on resend."""
    allowed = {
        Visit.Status.DRAFT,
        Visit.Status.WAITING_FOR_STUDENT,
        Visit.Status.STUDENT_SUBMITTED,
        Visit.Status.COACH_REVIEW,
    }
    if visit.status not in allowed:
        raise ValidationError(
            {"status": [f"Cannot send visit to student from status '{visit.status}'."]},
            code="invalid_visit_status",
        )
    now = timezone.now()
    visit.status = Visit.Status.WAITING_FOR_STUDENT
    visit.sent_at = now
    visit.expires_at = now + timedelta(days=int(expires_in_days))
    visit.save(update_fields=["status", "sent_at", "expires_at", "updated_at"])
    return visit


@transaction.atomic
def student_update_answers(visit: Visit, answers_partial: dict, *, actor=None) -> Visit:
    """Student partial answers update; only while waiting_for_student and not expired."""
    if visit.status != Visit.Status.WAITING_FOR_STUDENT:
        raise ValidationError(
            {"status": ["Visit is not open for student edits."]}, code="visit_not_open"
        )
    if is_visit_expired(visit):
        raise ValidationError({"status": ["Visit link has expired."]}, code="visit_expired")
    if not isinstance(answers_partial, dict):
        raise ValidationError({"answers": ["Must be an object."]})

    editable_keys = set(student_editable_field_keys(visit.form_template_snapshot or {}))
    invalid = [k for k in answers_partial if str(k) not in editable_keys]
    if invalid:
        raise ValidationError(
            {"answers": [f"Field '{invalid[0]}' is not student-editable."]},
            code="field_not_student_editable",
        )
    record_answer_changes(visit, answers_partial, source="student", actor=actor)
    visit.save(update_fields=["answers", "answer_sources", "updated_at"])
    return visit


@transaction.atomic
def student_submit_visit(visit: Visit, *, actor=None) -> Visit:
    """Student marks the visit as submitted; only while waiting_for_student and not expired."""
    if visit.status != Visit.Status.WAITING_FOR_STUDENT:
        raise ValidationError(
            {"status": ["Visit is not open for student submission."]}, code="visit_not_open"
        )
    if is_visit_expired(visit):
        raise ValidationError({"status": ["Visit link has expired."]}, code="visit_expired")
    visit.status = Visit.Status.STUDENT_SUBMITTED
    visit.submitted_by_student_at = timezone.now()
    visit.save(update_fields=["status", "submitted_by_student_at", "updated_at"])
    return visit


@transaction.atomic
def start_coach_review(visit: Visit, *, actor=None) -> Visit:
    """Lock the student form and open coach review: student_submitted → coach_review."""
    if visit.status != Visit.Status.STUDENT_SUBMITTED:
        raise ValidationError(
            {"status": [f"Cannot start coach review from status '{visit.status}'."]},
            code="invalid_visit_status",
        )
    visit.status = Visit.Status.COACH_REVIEW
    visit.save(update_fields=["status", "updated_at"])
    return visit


@transaction.atomic
def finalize_visit(visit: Visit, *, actor=None) -> Visit:
    """Coach locks the visit permanently; from draft (in-person) or coach_review."""
    allowed = {Visit.Status.DRAFT, Visit.Status.COACH_REVIEW}
    if visit.status not in allowed:
        raise ValidationError(
            {"status": [f"Cannot finalize visit from status '{visit.status}'."]},
            code="invalid_visit_status",
        )
    visit.status = Visit.Status.FINALIZED
    visit.finalized_at = timezone.now()
    visit.save(update_fields=["status", "finalized_at", "updated_at"])
    return visit
