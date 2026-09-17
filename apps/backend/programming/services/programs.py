"""Program aggregate services: draft, finalize, new-version, duplicate, archive."""

from __future__ import annotations

import copy
from typing import Any

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from accounts.models import CoachProfile, ProgramTemplate
from accounts.rules_services import ensure_rule_set
from common.exceptions import ConflictError, GenerationFailedError, InvalidStateError
from programming.models import GenerationRun, Program, ProgramVersion
from programming.services.generator import (
    GENERATOR_VERSION,
    build_input_snapshot,
    generate_document,
)
from students.models import Student, Visit


def programs_for_coach(coach: CoachProfile):
    return Program.objects.filter(coach=coach).select_related("student", "active_version")


def get_program_for_coach(coach: CoachProfile, program_id) -> Program:
    try:
        return programs_for_coach(coach).get(pk=program_id)
    except Program.DoesNotExist as exc:
        raise NotFound(detail="Not found.") from exc


def get_version_for_coach(coach: CoachProfile, program: Program, version_id) -> ProgramVersion:
    try:
        return ProgramVersion.objects.get(pk=version_id, program=program, coach=coach)
    except ProgramVersion.DoesNotExist as exc:
        raise NotFound(detail="Not found.") from exc


def _deep_copy(value: Any) -> Any:
    return copy.deepcopy(value)


def compute_list_status(
    program: Program, draft: ProgramVersion | None, latest_final: ProgramVersion | None
) -> str:
    if program.archived_at:
        return "archived"
    if program.active_version_id:
        return "active"
    if draft:
        return "draft"
    if latest_final:
        return "ready"
    return "draft"


def serialize_version_summary(v: ProgramVersion) -> dict:
    return {
        "id": str(v.id),
        "version_number": v.version_number,
        "status": v.status,
        "finalized_at": v.finalized_at.isoformat().replace("+00:00", "Z")
        if v.finalized_at
        else None,
        "created_at": v.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": v.updated_at.isoformat().replace("+00:00", "Z"),
        "source_version_id": str(v.source_version_id) if v.source_version_id else None,
        "copied_from_program_id": str(v.copied_from_program_id)
        if v.copied_from_program_id
        else None,
        "generation_run_id": str(v.generation_run_id) if v.generation_run_id else None,
    }


def serialize_version_detail(v: ProgramVersion) -> dict:
    data = serialize_version_summary(v)
    data.update(
        {
            "training": _deep_copy(v.training),
            "nutrition": _deep_copy(v.nutrition),
            "supplements": _deep_copy(v.supplements),
            "pdf_settings": _deep_copy(v.pdf_settings or {}),
            "content_schema_version": v.content_schema_version,
            "finalized_by": str(v.finalized_by_id) if v.finalized_by_id else None,
        }
    )
    return data


def serialize_program_summary(program: Program) -> dict:
    versions = (
        list(program.versions.all())
        if hasattr(program, "_prefetched_objects_cache")
        and "versions" in getattr(program, "_prefetched_objects_cache", {})
        else list(program.versions.order_by("-version_number"))
    )
    draft = next((v for v in versions if v.status == ProgramVersion.Status.DRAFT), None)
    latest_final = next((v for v in versions if v.status == ProgramVersion.Status.FINALIZED), None)
    current = draft or latest_final or (versions[0] if versions else None)
    status = compute_list_status(program, draft, latest_final)
    return {
        "id": str(program.id),
        "student_id": str(program.student_id),
        "student_name": program.student.full_name,
        "title": program.title,
        "program_type": program.program_type,
        "status": status,
        "version": current.version_number if current else 0,
        "version_label": str(current.version_number) if current else "0",
        "is_current": bool(
            program.active_version_id and current and program.active_version_id == current.id
        ),
        "date_range": program.date_range_label,
        "pdf_status": "none",
        "archived_at": program.archived_at.isoformat().replace("+00:00", "Z")
        if program.archived_at
        else None,
        "created_at": program.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": program.updated_at.isoformat().replace("+00:00", "Z"),
    }


def serialize_program_detail(program: Program) -> dict:
    versions = list(program.versions.order_by("-version_number"))
    draft = next((v for v in versions if v.status == ProgramVersion.Status.DRAFT), None)
    latest_final = next((v for v in versions if v.status == ProgramVersion.Status.FINALIZED), None)
    summary = serialize_program_summary(program)
    generator_meta = None
    if draft and draft.generation_run_id:
        run = draft.generation_run
        output = run.output_snapshot or {}
        generator_meta = {
            "generation_run_id": str(run.id),
            "engine": run.engine,
            "warnings": list(run.warnings or []),
            "seed": run.seed,
            "evidence": (output.get("generator") or {}).get("evidence"),
        }
    elif draft and isinstance((draft.training or {}), dict):
        # fallback from document
        pass

    content_source = draft or latest_final
    return {
        **summary,
        "date_range_start": program.date_range_start.isoformat()
        if program.date_range_start
        else None,
        "date_range_end": program.date_range_end.isoformat() if program.date_range_end else None,
        "date_range_label": program.date_range_label,
        "active_version_id": str(program.active_version_id) if program.active_version_id else None,
        "current_draft": serialize_version_detail(draft) if draft else None,
        "latest_finalized_version": serialize_version_summary(latest_final)
        if latest_final
        else None,
        "versions": [serialize_version_summary(v) for v in versions],
        "training": _deep_copy(content_source.training) if content_source else None,
        "nutrition": _deep_copy(content_source.nutrition) if content_source else None,
        "supplements": _deep_copy(content_source.supplements) if content_source else None,
        "pdf_settings": _deep_copy(content_source.pdf_settings) if content_source else {},
        "generator": generator_meta,
        "provenance": {
            "copied_from_program_id": (
                str(versions[-1].copied_from_program_id)
                if versions and versions[-1].copied_from_program_id
                else (
                    str(
                        next(
                            (
                                v.copied_from_program_id
                                for v in versions
                                if v.copied_from_program_id
                            ),
                            None,
                        )
                    )
                    if any(v.copied_from_program_id for v in versions)
                    else None
                )
            ),
        },
    }


def _get_owned_student(coach: CoachProfile, student_id) -> Student:
    try:
        return Student.objects.get(pk=student_id, coach=coach)
    except Student.DoesNotExist as Exc:
        raise NotFound(detail="Not found.") from Exc


def _latest_visit(student: Student) -> Visit | None:
    return student.visits.order_by("-visit_date", "-created_at").first()


@transaction.atomic
def create_empty_draft(
    coach: CoachProfile,
    *,
    student_id,
    title: str,
    program_type: str,
    date_range_label: str = "",
    date_range_start=None,
    date_range_end=None,
) -> Program:
    student = _get_owned_student(coach, student_id)
    if student.archived_at:
        raise InvalidStateError(detail="Student is archived.", code="archived_student")
    if program_type not in Program.ProgramType.values:
        raise ValidationError({"program_type": ["Invalid program_type."]})
    title = (title or "").strip()
    if not title:
        raise ValidationError({"title": ["title is required."]})

    program = Program.objects.create(
        coach=coach,
        student=student,
        title=title,
        program_type=program_type,
        date_range_label=date_range_label or "",
        date_range_start=date_range_start,
        date_range_end=date_range_end,
    )
    ProgramVersion.objects.create(
        program=program,
        coach=coach,
        version_number=1,
        status=ProgramVersion.Status.DRAFT,
        training={"summary": "", "days": []} if program_type in {"workout", "complete"} else None,
        nutrition={"enabled": True, "meals": [], "notes": ""}
        if program_type in {"nutrition", "complete"}
        else None,
        supplements={"enabled": True, "items": [], "notes": ""}
        if program_type in {"supplement", "complete"}
        else None,
        pdf_settings={
            "fileTitle": title,
            "includeTraining": program_type in {"workout", "complete"},
            "includeNutrition": program_type in {"nutrition", "complete"},
            "includeSupplements": program_type in {"supplement", "complete"},
            "pageSize": "A4",
            "style": "modern",
        },
    )
    return program


@transaction.atomic
def generate_program(coach: CoachProfile, request_data: dict) -> tuple[Program, GenerationRun]:
    if not isinstance(request_data, dict):
        raise ValidationError({"detail": "Body must be an object."})
    for banned in ("coach", "coach_id"):
        if banned in request_data:
            raise ValidationError({banned: ["Client-controlled ownership is not allowed."]})

    student_id = request_data.get("student_id")
    template_id = request_data.get("template_id")
    if not student_id or not template_id:
        raise ValidationError({"student_id": ["student_id and template_id are required."]})

    student = _get_owned_student(coach, student_id)
    if student.archived_at:
        raise InvalidStateError(detail="Student is archived.", code="archived_student")

    try:
        template = ProgramTemplate.objects.get(pk=template_id, coach=coach)
    except ProgramTemplate.DoesNotExist as Exc:
        raise NotFound(detail="Not found.") from Exc

    if template.is_archived or not template.is_active:
        raise InvalidStateError(
            detail="Template is archived or inactive.", code="archived_template"
        )

    # Soft compatibility: warn via generation if level mismatches; hard fail if explicitly incompatible days
    if template.split and len(template.split) != template.days_per_week:
        raise ValidationError(
            {"template_id": ["Template split is inconsistent with days_per_week."]},
            code="incompatible_template",
        )

    if "days_per_week" in request_data and request_data.get("days_per_week") is not None:
        try:
            requested_days = int(request_data.get("days_per_week"))
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                {"days_per_week": ["days_per_week must be an integer."]},
                code="invalid_days_per_week",
            ) from exc
        if requested_days != int(template.days_per_week):
            raise ValidationError(
                {
                    "days_per_week": [
                        f"days_per_week ({requested_days}) must match template "
                        f"days_per_week ({template.days_per_week})."
                    ]
                },
                code="incompatible_days_per_week",
            )

    # Optional hard incompatibility: requesting beginner template for advanced-only override
    req_level = request_data.get("level")
    if req_level and req_level != template.level and request_data.get("require_level_match"):
        raise ValidationError(
            {"template_id": ["Template level is incompatible with requested level."]},
            code="incompatible_template",
        )

    visit = _latest_visit(student)
    ensure_rule_set(coach)

    run = GenerationRun.objects.create(
        coach=coach,
        student=student,
        engine=str(request_data.get("engine") or GENERATOR_VERSION),
        seed=str(request_data.get("seed") or ""),
        status=GenerationRun.Status.PENDING,
        request=request_data,
    )

    try:
        document, warnings = generate_document(
            coach=coach,
            student=student,
            visit=visit,
            template=template,
            request=request_data,
        )
        if any(w.startswith("missing_exercise_candidates") for w in warnings) and request_data.get(
            "fail_on_missing_exercises"
        ):
            raise GenerationFailedError(
                detail="Missing exercise candidates for one or more muscles."
            )

        input_snapshot = build_input_snapshot(
            coach=coach,
            student=student,
            visit=visit,
            template=template,
            request=request_data,
        )
        title = document["title"]
        program_type = document["program_type"]
        if program_type not in Program.ProgramType.values:
            program_type = Program.ProgramType.COMPLETE

        program = Program.objects.create(
            coach=coach,
            student=student,
            title=title,
            program_type=program_type,
            date_range_label=document.get("date_range_label") or "",
            date_range_start=request_data.get("date_range_start"),
            date_range_end=request_data.get("date_range_end"),
        )
        version = ProgramVersion.objects.create(
            program=program,
            coach=coach,
            version_number=1,
            status=ProgramVersion.Status.DRAFT,
            training=document.get("training"),
            nutrition=document.get("nutrition"),
            supplements=document.get("supplements"),
            pdf_settings=document.get("pdf_settings") or {},
            generation_run=run,
        )
        run.program = program
        run.resulting_version = version
        run.input_snapshot = input_snapshot
        run.output_snapshot = document
        run.warnings = warnings
        run.status = GenerationRun.Status.SUCCEEDED
        run.save()
        return program, run
    except (ValidationError, InvalidStateError, GenerationFailedError):
        run.status = GenerationRun.Status.FAILED
        run.error_message = "generation_failed"
        run.save(update_fields=["status", "error_message", "updated_at"])
        raise
    except Exception as Exc:
        run.status = GenerationRun.Status.FAILED
        run.error_message = str(Exc)[:500]
        run.save(update_fields=["status", "error_message", "updated_at"])
        raise GenerationFailedError(detail="Generation failed.") from Exc


@transaction.atomic
def update_program_lineage(program: Program, payload: dict) -> Program:
    if program.archived_at:
        raise InvalidStateError(detail="Archived program cannot be updated.")
    if "title" in payload:
        title = str(payload["title"] or "").strip()
        if not title:
            raise ValidationError({"title": ["title is required."]})
        program.title = title
    if "date_range_label" in payload:
        program.date_range_label = str(payload["date_range_label"] or "")
    if "date_range_start" in payload:
        program.date_range_start = payload["date_range_start"]
    if "date_range_end" in payload:
        program.date_range_end = payload["date_range_end"]
    program.save()
    return program


@transaction.atomic
def update_draft_version(version: ProgramVersion, payload: dict) -> ProgramVersion:
    """Mutate draft content, or pdf_settings on a finalized version.

    Training/nutrition/supplements stay immutable after finalize. PDF include
    flags are presentation prefs and may be updated on finalized versions so
    coaches can regenerate PDFs without opening a new draft.
    """
    version = ProgramVersion.objects.select_for_update().get(pk=version.pk)
    if version.status == ProgramVersion.Status.ARCHIVED:
        raise InvalidStateError(
            detail="Archived versions cannot be mutated.",
            code="immutable_version",
        )

    content_keys = ("training", "nutrition", "supplements")
    has_content = any(key in payload for key in content_keys)
    has_pdf = "pdf_settings" in payload

    if version.status == ProgramVersion.Status.FINALIZED:
        if has_content:
            raise InvalidStateError(
                detail="Finalized or archived versions cannot be mutated.",
                code="immutable_version",
            )
        if not has_pdf:
            raise InvalidStateError(
                detail="Finalized or archived versions cannot be mutated.",
                code="immutable_version",
            )
        value = payload.get("pdf_settings")
        if value is not None and not isinstance(value, dict):
            raise ValidationError({"pdf_settings": ["Must be an object or null."]})
        if isinstance(value, dict) and isinstance(version.pdf_settings, dict):
            version.pdf_settings = {**(version.pdf_settings or {}), **value}
        else:
            version.pdf_settings = _deep_copy(value)
        version.save(update_fields=["pdf_settings", "updated_at"])
        version.program.updated_at = timezone.now()
        version.program.save(update_fields=["updated_at"])
        return version

    if version.status != ProgramVersion.Status.DRAFT:
        raise InvalidStateError(
            detail="Finalized or archived versions cannot be mutated.",
            code="immutable_version",
        )

    for section in ("training", "nutrition", "supplements", "pdf_settings"):
        if section in payload:
            value = payload[section]
            if value is not None and not isinstance(value, dict):
                raise ValidationError({section: ["Must be an object or null."]})
            # Shallow merge for pdf_settings; replace for document sections if full object sent
            if (
                section == "pdf_settings"
                and isinstance(value, dict)
                and isinstance(version.pdf_settings, dict)
            ):
                merged = {**(version.pdf_settings or {}), **value}
                setattr(version, section, merged)
            else:
                setattr(version, section, _deep_copy(value))

    # Reject unknown exercise_id references belonging to other coaches
    training = version.training or {}
    days = training.get("days") or []
    if isinstance(days, list):
        from accounts.models import Exercise

        for day in days:
            if not isinstance(day, dict):
                raise ValidationError({"training": ["Malformed day."]})
            for ex in day.get("exercises") or []:
                if not isinstance(ex, dict):
                    raise ValidationError({"training": ["Malformed exercise."]})
                ex_id = ex.get("exercise_id")
                if ex_id:
                    if not Exercise.objects.filter(pk=ex_id, coach_id=version.coach_id).exists():
                        raise ValidationError(
                            {"training": ["Unknown or cross-coach exercise reference."]},
                            code="unknown_exercise",
                        )
    version.save()
    version.program.updated_at = timezone.now()
    version.program.save(update_fields=["updated_at"])
    return version


@transaction.atomic
def finalize_version(version: ProgramVersion, *, actor) -> ProgramVersion:
    version = ProgramVersion.objects.select_for_update().get(pk=version.pk)
    if version.status == ProgramVersion.Status.FINALIZED:
        return version  # idempotent
    if version.status != ProgramVersion.Status.DRAFT:
        raise InvalidStateError(detail="Only draft versions can be finalized.")
    version.status = ProgramVersion.Status.FINALIZED
    version.finalized_at = timezone.now()
    version.finalized_by = actor
    version.save(update_fields=["status", "finalized_at", "finalized_by", "updated_at"])
    version.program.updated_at = timezone.now()
    version.program.save(update_fields=["updated_at"])
    return version


@transaction.atomic
def activate_version(program: Program, version_id) -> Program:
    program = Program.objects.select_for_update().get(pk=program.pk)
    version = get_version_for_coach(program.coach, program, version_id)
    if version.status != ProgramVersion.Status.FINALIZED:
        raise InvalidStateError(detail="Only finalized versions can be activated.")
    program.active_version = version
    program.save(update_fields=["active_version", "updated_at"])
    student = program.student
    student.summary_current_program_title = program.title
    student.save(update_fields=["summary_current_program_title", "updated_at"])
    return program


@transaction.atomic
def create_new_version(source: ProgramVersion) -> ProgramVersion:
    """Same lineage; next version_number; new draft deep-copy."""
    program = Program.objects.select_for_update().get(pk=source.program_id)
    if program.archived_at:
        raise InvalidStateError(detail="Archived program cannot receive new versions.")
    # Close existing draft if any by archiving it (preserve history of abandoned drafts)
    existing_drafts = ProgramVersion.objects.select_for_update().filter(
        program=program, status=ProgramVersion.Status.DRAFT
    )
    for draft in existing_drafts:
        draft.status = ProgramVersion.Status.ARCHIVED
        draft.save(update_fields=["status", "updated_at"])

    agg = ProgramVersion.objects.filter(program=program).aggregate(m=Max("version_number"))
    next_number = int(agg["m"] or 0) + 1
    # Guard unique constraint races as far as SQLite allows
    if ProgramVersion.objects.filter(program=program, version_number=next_number).exists():
        raise ConflictError(detail="Version number conflict.", code="duplicate_version_number")

    return ProgramVersion.objects.create(
        program=program,
        coach=program.coach,
        version_number=next_number,
        status=ProgramVersion.Status.DRAFT,
        training=_deep_copy(source.training),
        nutrition=_deep_copy(source.nutrition),
        supplements=_deep_copy(source.supplements),
        pdf_settings=_deep_copy(source.pdf_settings or {}),
        content_schema_version=source.content_schema_version,
        source_version=source,
    )


@transaction.atomic
def duplicate_program(
    source_version: ProgramVersion, *, target_student: Student | None = None
) -> Program:
    """New Program lineage; version 1 draft deep-copy; provenance via copied_from_program."""
    source_program = source_version.program
    coach = source_program.coach
    student = target_student or source_program.student
    if student.coach_id != coach.id:
        raise NotFound(detail="Not found.")
    if student.archived_at:
        raise InvalidStateError(detail="Student is archived.", code="archived_student")

    new_program = Program.objects.create(
        coach=coach,
        student=student,
        title=f"{source_program.title} (کپی)",
        program_type=source_program.program_type,
        date_range_label=source_program.date_range_label,
        date_range_start=source_program.date_range_start,
        date_range_end=source_program.date_range_end,
    )
    ProgramVersion.objects.create(
        program=new_program,
        coach=coach,
        version_number=1,
        status=ProgramVersion.Status.DRAFT,
        training=_deep_copy(source_version.training),
        nutrition=_deep_copy(source_version.nutrition),
        supplements=_deep_copy(source_version.supplements),
        pdf_settings=_deep_copy(source_version.pdf_settings or {}),
        content_schema_version=source_version.content_schema_version,
        source_version=None,
        copied_from_program=source_program,
    )
    return new_program


@transaction.atomic
def archive_program(program: Program) -> Program:
    program = Program.objects.select_for_update().get(pk=program.pk)
    if not program.archived_at:
        program.archived_at = timezone.now()
        program.save(update_fields=["archived_at", "updated_at"])
    return program


@transaction.atomic
def delete_program(program: Program) -> None:
    if program.versions.filter(status=ProgramVersion.Status.FINALIZED).exists():
        raise ConflictError(
            detail="Cannot delete program with finalized versions; archive instead."
        )
    program.delete()


def filter_programs(qs, params):
    search = (params.get("search") or "").strip()
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(student__full_name__icontains=search))
    student_id = params.get("student_id") or params.get("student")
    if student_id:
        qs = qs.filter(student_id=student_id)
    program_type = params.get("program_type")
    if program_type and program_type != "all":
        qs = qs.filter(program_type=program_type)

    status_filter = params.get("status")
    if status_filter and status_filter != "all":
        if status_filter == "archived":
            qs = qs.filter(archived_at__isnull=False)
        elif status_filter == "draft":
            qs = qs.filter(
                archived_at__isnull=True,
                versions__status=ProgramVersion.Status.DRAFT,
            ).distinct()
        elif status_filter == "ready":
            qs = (
                qs.filter(
                    archived_at__isnull=True,
                    active_version__isnull=True,
                    versions__status=ProgramVersion.Status.FINALIZED,
                )
                .exclude(versions__status=ProgramVersion.Status.DRAFT)
                .distinct()
            )
        elif status_filter == "active":
            qs = qs.filter(archived_at__isnull=True, active_version__isnull=False)
        elif status_filter == "finalized":
            qs = qs.filter(
                archived_at__isnull=True,
                versions__status=ProgramVersion.Status.FINALIZED,
            ).distinct()

    # PDF status placeholder filter (always none until PDF milestone)
    pdf_status = params.get("pdf_status")
    if pdf_status and pdf_status not in {"all", "none"}:
        qs = qs.none()

    created_from = params.get("created_from") or params.get("date_from")
    created_to = params.get("created_to") or params.get("date_to")
    if created_from:
        qs = qs.filter(created_at__date__gte=created_from)
    if created_to:
        qs = qs.filter(created_at__date__lte=created_to)
    updated_from = params.get("updated_from")
    updated_to = params.get("updated_to")
    if updated_from:
        qs = qs.filter(updated_at__date__gte=updated_from)
    if updated_to:
        qs = qs.filter(updated_at__date__lte=updated_to)

    ordering = params.get("ordering") or "-updated_at"
    allowed = {
        "updated_at",
        "-updated_at",
        "created_at",
        "-created_at",
        "title",
        "-title",
    }
    if ordering in allowed:
        qs = qs.order_by(ordering)
    return qs
