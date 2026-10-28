"""Program aggregate services: draft, finalize, new-version, duplicate, archive."""

from __future__ import annotations

import copy
from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError

from accounts.models import CoachProfile, Exercise, ProgramTemplate
from accounts.rules_services import ensure_rule_set
from common.exceptions import ConflictError, GenerationFailedError, InvalidStateError
from programming.models import GenerationRun, Program, ProgramVersion
from programming.services.generator import (
    GENERATOR_VERSION,
    build_input_snapshot,
    generate_document,
)
from programming.services.split_parser import CANONICAL_MUSCLES, normalize_muscle
from programming.services.workout_schedule import ensure_workout_schedule
from students.models import Student, Visit
from students.services import ensure_student_active

PROGRAM_SECTIONS = ("workout", "nutrition", "supplement")


def program_sections_for_type(program_type: str) -> list[str]:
    if program_type == Program.ProgramType.COMPLETE:
        return list(PROGRAM_SECTIONS)
    return [program_type] if program_type in PROGRAM_SECTIONS else []


def programs_for_coach(coach: CoachProfile):
    return Program.objects.filter(coach=coach).select_related("student", "active_version")


def get_program_for_coach(coach: CoachProfile, program_id) -> Program:
    try:
        return programs_for_coach(coach).get(pk=program_id)
    except Program.DoesNotExist as exc:
        raise NotFound(detail="Not found.") from exc


def programs_for_student(student: Student):
    """Return only finalized, non-archived programs owned by the student's coach."""
    return (
        Program.objects.filter(
            student=student,
            coach_id=student.coach_id,
            archived_at__isnull=True,
            active_version__status=ProgramVersion.Status.FINALIZED,
        )
        .select_related("student", "active_version")
        .prefetch_related("versions")
        .distinct()
    )


def current_program_section_map(student: Student) -> dict[str, list[str]]:
    """Resolve the newest active program independently for workout, food, and supplements."""
    return current_program_section_maps([student]).get(str(student.id), {})


def current_program_section_maps(students) -> dict[str, dict[str, list[str]]]:
    """Resolve current section ownership for a batch of students in a single query."""
    student_ids = [student.id for student in students]
    programs = (
        Program.objects.filter(
            student_id__in=student_ids,
            archived_at__isnull=True,
            active_version__status=ProgramVersion.Status.FINALIZED,
        )
        .select_related("active_version")
        .order_by("student_id", "-updated_at", "-created_at", "-id")
    )
    claimed_by_student: dict[str, set[str]] = {}
    by_student: dict[str, dict[str, list[str]]] = {}
    for program in programs:
        student_key = str(program.student_id)
        claimed = claimed_by_student.setdefault(student_key, set())
        sections = set(program.sections or program_sections_for_type(program.program_type))
        sections.intersection_update(PROGRAM_SECTIONS)
        current_here = sections - claimed
        if current_here:
            by_student.setdefault(student_key, {})[str(program.id)] = [
                section
                for section in ("workout", "nutrition", "supplement")
                if section in current_here
            ]
            claimed.update(current_here)
    return by_student


def get_program_for_student(student: Student, program_id) -> Program:
    try:
        return programs_for_student(student).get(pk=program_id)
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
        "delivery_source": v.delivery_source,
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
        "sections": list(program.sections or program_sections_for_type(program.program_type)),
        "delivery_source": current.delivery_source
        if current
        else ProgramVersion.DeliverySource.GENERATED,
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


def _latest_student_version(program: Program) -> ProgramVersion | None:
    versions = list(program.versions.all())
    finalized = [v for v in versions if v.status == ProgramVersion.Status.FINALIZED]
    if not finalized:
        return None
    if program.active_version_id:
        active = next((v for v in finalized if v.id == program.active_version_id), None)
        if active:
            return active
    return None


def serialize_student_program_summary(
    program: Program, *, current_sections: dict[str, list[str]] | None = None
) -> dict:
    version = _latest_student_version(program)
    if current_sections is None:
        current_sections = current_program_section_map(program.student)
    current_for_program = current_sections.get(str(program.id), [])
    return {
        "id": str(program.id),
        "student_id": str(program.student_id),
        "title": program.title,
        "program_type": program.program_type,
        "sections": list(program.sections or program_sections_for_type(program.program_type)),
        "delivery_source": version.delivery_source
        if version
        else ProgramVersion.DeliverySource.GENERATED,
        "status": "active" if current_for_program else "ready",
        "version": version.version_number if version else 0,
        "is_current": bool(version and current_for_program),
        "current_sections": current_for_program,
        "date_range": program.date_range_label,
        "created_at": program.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": program.updated_at.isoformat().replace("+00:00", "Z"),
    }


def serialize_student_program_detail(program: Program) -> dict:
    """Expose finalized program content without coach-only evidence or draft data."""
    version = _latest_student_version(program)
    if version is None:
        raise NotFound(detail="Not found.")
    training = _deep_copy(version.training)
    if isinstance(training, dict):
        for private_key in (
            "volume_plan",
            "volume_policy",
            "volume_audit",
            "volume_warnings",
            "eligible_exercise_ids",
            "planning_version",
            "system_warnings",
            "required_system_keys",
        ):
            training.pop(private_key, None)
        ensure_workout_schedule(training, program.date_range_start, program.date_range_end)
    # Instructional media and public education are live catalog data, not a frozen prescription.
    # Resolve replacements/removals for old programs without changing their
    # immutable training or progress, and only from this program's coach.
    if isinstance(training, dict):
        exercises = [
            exercise
            for day in training.get("days", [])
            if isinstance(day, dict)
            for exercise in day.get("exercises", [])
            if isinstance(exercise, dict)
        ]
        catalog_ids = set()
        for exercise in exercises:
            try:
                catalog_ids.add(UUID(str(exercise.get("exercise_id"))))
            except (ValueError, TypeError, AttributeError):
                continue
        if exercises:
            catalog_rows = {
                str(item.id): item
                for item in Exercise.objects.select_related("media_asset").filter(
                    coach_id=program.coach_id,
                    id__in=catalog_ids,
                )
            }
            for exercise in exercises:
                exercise["tutorial_url"] = ""
                exercise["tutorial_source_url"] = ""
                catalog_row = catalog_rows.get(str(exercise.get("exercise_id")))
                if not catalog_row:
                    exercise["media"] = None
                    if exercise.get("exercise_id"):
                        exercise["execution_guide"] = {}
                    continue
                from accounts.exercise_media_services import media_payload

                exercise["media"] = media_payload(catalog_row)
                exercise["execution_guide"] = _deep_copy(catalog_row.execution_guide or {})
                if not exercise.get("primary_muscle"):
                    exercise["primary_muscle"] = catalog_row.primary_muscle
    return {
        **serialize_student_program_summary(program),
        "date_range_start": program.date_range_start.isoformat()
        if program.date_range_start
        else None,
        "date_range_end": program.date_range_end.isoformat() if program.date_range_end else None,
        "program_version_id": str(version.id),
        "section_methods": (version.pdf_settings or {}).get("deliverySections") or {},
        "delivery_source": version.delivery_source,
        "training": training,
        "nutrition": _deep_copy(version.nutrition),
        "supplements": _deep_copy(version.supplements),
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
    from delivery.models import StagedProgramPdf

    staged_pdfs = []
    if content_source:
        staged_pdfs = [
            {
                "id": str(staged.id),
                "section": staged.section,
                "file_name": staged.original_filename,
                "size_bytes": staged.size_bytes,
                "expires_at": staged.expires_at.isoformat().replace("+00:00", "Z"),
            }
            for staged in StagedProgramPdf.objects.filter(
                program_version=content_source,
                expires_at__gt=timezone.now(),
            ).order_by("section", "created_at")
        ]
    staged_pdf = staged_pdfs[0] if staged_pdfs else None
    return {
        **summary,
        "date_range_start": program.date_range_start.isoformat()
        if program.date_range_start
        else None,
        "date_range_end": program.date_range_end.isoformat() if program.date_range_end else None,
        "date_range_label": program.date_range_label,
        "active_version_id": str(program.active_version_id) if program.active_version_id else None,
        "current_draft": serialize_version_detail(draft) if draft else None,
        "draft_revision": draft.updated_at.isoformat() if draft else None,
        "latest_finalized_version": serialize_version_summary(latest_final)
        if latest_final
        else None,
        "versions": [serialize_version_summary(v) for v in versions],
        "training": _deep_copy(content_source.training) if content_source else None,
        "nutrition": _deep_copy(content_source.nutrition) if content_source else None,
        "supplements": _deep_copy(content_source.supplements) if content_source else None,
        "pdf_settings": _deep_copy(content_source.pdf_settings) if content_source else {},
        "delivery_source": (
            content_source.delivery_source
            if content_source
            else ProgramVersion.DeliverySource.GENERATED
        ),
        "staged_pdf": staged_pdf,
        "staged_pdfs": staged_pdfs,
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


def _visit_for_generation(
    coach: CoachProfile, student: Student, request_data: dict
) -> Visit | None:
    request_id = request_data.get("program_request_id")
    if request_id:
        from programming.models import ProgramRequest

        program_request = ProgramRequest.objects.filter(
            pk=request_id,
            coach=coach,
            student=student,
            status__in=["submitted", "awaiting_info", "in_progress"],
        ).first()
        if program_request is None:
            raise NotFound(detail="درخواست برنامهٔ باز برای این شاگرد پیدا نشد.")
        return program_request.visit
    visit_id = request_data.get("visit_id")
    if visit_id:
        try:
            return Visit.objects.get(pk=visit_id, coach=coach, student=student)
        except Visit.DoesNotExist as exc:
            raise NotFound(detail="Visit not found for this student.") from exc
    return _latest_visit(student)


def _program_dates(start, end):
    """Validate API date values before persisting and serializing a program."""
    dates = {}
    for name, value in (("date_range_start", start), ("date_range_end", end)):
        try:
            dates[name] = serializers.DateField(allow_null=True).run_validation(value)
        except ValidationError as exc:
            raise ValidationError({name: exc.detail}) from exc
    start, end = dates["date_range_start"], dates["date_range_end"]
    if start and end and end < start:
        raise ValidationError({"date_range_end": ["تاریخ پایان نمی‌تواند قبل از شروع باشد."]})
    return start, end


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
    ensure_student_active(student)
    if program_type not in Program.ProgramType.values:
        raise ValidationError({"program_type": ["Invalid program_type."]})
    title = (title or "").strip()
    if not title:
        raise ValidationError({"title": ["title is required."]})

    date_range_start, date_range_end = _program_dates(date_range_start, date_range_end)
    program = Program.objects.create(
        coach=coach,
        student=student,
        title=title,
        program_type=program_type,
        sections=program_sections_for_type(program_type),
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
def create_uploaded_pdf_draft(
    coach: CoachProfile,
    *,
    student_id,
    staged_pdf_id,
    title: str,
    program_type: str,
    date_range_label: str = "",
    date_range_start=None,
    date_range_end=None,
) -> Program:
    from delivery.models import StagedProgramPdf

    student = _get_owned_student(coach, student_id)
    ensure_student_active(student)
    if program_type not in Program.ProgramType.values:
        raise ValidationError({"program_type": ["Invalid program_type."]})
    title = (title or "").strip()
    if not title:
        raise ValidationError({"title": ["عنوان برنامه الزامی است."]})

    start, end = _program_dates(date_range_start, date_range_end)
    if not start or not end:
        raise ValidationError({"date_range_start": ["تاریخ شروع و پایان برنامه الزامی است."]})

    try:
        staged = StagedProgramPdf.objects.select_for_update().get(
            pk=staged_pdf_id,
            coach=coach,
            student=student,
            program_version__isnull=True,
            expires_at__gt=timezone.now(),
        )
    except StagedProgramPdf.DoesNotExist as exc:
        raise ValidationError(
            {"staged_pdf_id": ["فایل موقت معتبر نیست یا منقضی شده است؛ دوباره بارگذاری کنید."]}
        ) from exc

    program = Program.objects.create(
        coach=coach,
        student=student,
        title=title,
        program_type=program_type,
        sections=program_sections_for_type(program_type),
        date_range_label=(date_range_label or "").strip(),
        date_range_start=start,
        date_range_end=end,
    )
    version = ProgramVersion.objects.create(
        program=program,
        coach=coach,
        version_number=1,
        status=ProgramVersion.Status.DRAFT,
        delivery_source=ProgramVersion.DeliverySource.UPLOADED_PDF,
        pdf_settings={"fileTitle": title},
    )
    staged.program_version = version
    staged.expires_at = timezone.now() + timedelta(days=7)
    staged.save(update_fields=["program_version", "expires_at"])
    return program


@transaction.atomic
def attach_staged_pdf_to_version(
    coach: CoachProfile, version: ProgramVersion, staged_pdf_id, *, section: str | None = None
) -> ProgramVersion:
    from delivery.models import StagedProgramPdf

    version = (
        ProgramVersion.objects.select_for_update().select_related("program").get(pk=version.pk)
    )
    if version.coach_id != coach.id or version.program.coach_id != coach.id:
        raise NotFound(detail="Not found.")
    ensure_student_active(version.program.student)
    if version.status != ProgramVersion.Status.DRAFT:
        raise InvalidStateError(detail="فقط پیش‌نویس برنامه قابل تغییر است.")
    if section not in (None, "", "workout", "nutrition", "supplement"):
        raise ValidationError({"section": ["نوع بخش برنامه معتبر نیست."]})
    try:
        staged = StagedProgramPdf.objects.select_for_update().get(
            pk=staged_pdf_id,
            coach=coach,
            student=version.program.student,
            program_version__isnull=True,
            expires_at__gt=timezone.now(),
        )
    except StagedProgramPdf.DoesNotExist as exc:
        raise ValidationError(
            {"staged_pdf_id": ["فایل موقت معتبر نیست یا منقضی شده است."]}
        ) from exc

    resolved_section = section if section is not None else staged.section
    if not resolved_section and version.program.program_type in {
        "workout",
        "nutrition",
        "supplement",
    }:
        resolved_section = version.program.program_type
    previous = (
        StagedProgramPdf.objects.select_for_update()
        .filter(program_version=version, section=resolved_section)
        .exclude(pk=staged.pk)
    )
    staged.program_version = version
    staged.section = resolved_section
    staged.expires_at = timezone.now() + timedelta(days=7)
    staged.save(update_fields=["program_version", "section", "expires_at"])
    for old in previous:
        filename = old.file.name
        storage = old.file.storage
        old.delete()
        transaction.on_commit(lambda storage=storage, filename=filename: storage.delete(filename))
    return version


@transaction.atomic
def generate_program(coach: CoachProfile, request_data: dict) -> tuple[Program, GenerationRun]:
    if not isinstance(request_data, dict):
        raise ValidationError({"detail": "Body must be an object."})
    for banned in ("coach", "coach_id"):
        if banned in request_data:
            raise ValidationError({banned: ["Client-controlled ownership is not allowed."]})

    student_id = request_data.get("student_id")
    template_id = request_data.get("template_id")
    if not student_id:
        raise ValidationError({"student_id": ["انتخاب شاگرد الزامی است."]})

    student = _get_owned_student(coach, student_id)
    ensure_student_active(student)

    generation_data = request_data
    request_id = request_data.get("program_request_id")
    if request_id:
        from programming.models import ProgramRequest

        try:
            request_id = UUID(str(request_id))
            program_request = ProgramRequest.objects.get(
                pk=request_id,
                coach=coach,
                student=student,
                status__in=["submitted", "awaiting_info", "in_progress"],
            )
        except (ProgramRequest.DoesNotExist, ValueError, TypeError, AttributeError) as exc:
            raise NotFound(detail="درخواست برنامهٔ باز برای این شاگرد پیدا نشد.") from exc
        supplied_visit_id = request_data.get("visit_id")
        if supplied_visit_id and str(supplied_visit_id) != str(program_request.visit_id):
            raise ValidationError(
                {"visit_id": ["ویزیت انتخاب‌شده با ویزیت متصل به درخواست یکسان نیست."]}
            )
        requested_sections = list(program_request.sections or [])
        type_sections = set(
            program_sections_for_type(str(request_data.get("program_type") or "complete"))
        )
        selected_sections = [
            section
            for section in PROGRAM_SECTIONS
            if section in requested_sections and section in type_sections
        ]
        if not selected_sections:
            raise ValidationError(
                {"program_type": ["نوع برنامه با بخش‌های درخواست‌شده هم‌خوانی ندارد."]}
            )
        generation_data = {
            **request_data,
            "program_request_id": str(program_request.id),
            "athlete_requested_goal": program_request.goal or "",
            "program_sections": selected_sections,
            "program_request_constraints": {
                **(
                    {"training_environment": program_request.training_environment}
                    if program_request.training_environment
                    else {}
                ),
                **(
                    {"session_duration_minutes": program_request.session_duration_minutes}
                    if program_request.session_duration_minutes is not None
                    else {}
                ),
                **(
                    {"equipment_available": list(program_request.equipment_available)}
                    if program_request.equipment_available
                    else {}
                ),
            },
        }
        if program_request.visit_id:
            generation_data["visit_id"] = str(program_request.visit_id)

    visit = _visit_for_generation(coach, student, generation_data)
    requested_sessions = _visit_sessions_per_week(visit)
    if requested_sessions is None and request_id:
        requested_sessions = program_request.sessions_per_week
    if requested_sessions is None:
        requested_sessions = (student.training_conditions or {}).get("training_days_per_week")
    explicit_sessions = request_data.get("days_per_week")
    if requested_sessions not in (None, "") and explicit_sessions not in (None, ""):
        try:
            matches_final_sessions = int(explicit_sessions) == int(requested_sessions)
        except (TypeError, ValueError):
            matches_final_sessions = False
        if not matches_final_sessions:
            raise ValidationError(
                {
                    "days_per_week": [
                        f"تعداد جلسات نهایی شاگرد {requested_sessions} است؛ این مقدار با ویزیت یا "
                        "درخواست برنامه هم‌خوان نیست."
                    ]
                },
                code="incompatible_visit_sessions",
            )

    if template_id:
        try:
            template = ProgramTemplate.objects.get(pk=template_id, coach=coach)
        except ProgramTemplate.DoesNotExist as Exc:
            raise NotFound(detail="Not found.") from Exc

        if template.is_archived or not template.is_active:
            raise InvalidStateError(
                detail="Template is archived or inactive.", code="archived_template"
            )
        if requested_sessions and int(template.days_per_week) != int(requested_sessions):
            raise ValidationError(
                {
                    "template_id": [
                        f"این قالب {template.days_per_week} جلسه دارد، اما تعداد جلسات نهایی شاگرد "
                        f"{requested_sessions} است. قالب هم‌تعداد را انتخاب کنید یا قالب را بردارید."
                    ]
                },
                code="incompatible_template_sessions",
            )
        generation_data = {**generation_data, "template_mode": "template"}
    else:
        template, quick_settings = _build_quick_generation_template(
            coach=coach,
            student=student,
            request_data=generation_data,
            requested_sessions=requested_sessions,
        )
        generation_data = {
            **generation_data,
            **quick_settings,
            "template_mode": "quick",
        }

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

    start, end = _program_dates(
        generation_data.get("date_range_start"), generation_data.get("date_range_end")
    )
    ensure_rule_set(coach)

    generation_seed = str(generation_data.get("seed") or uuid4().hex)
    generation_data["seed"] = generation_seed
    run = GenerationRun.objects.create(
        coach=coach,
        student=student,
        engine=str(generation_data.get("engine") or GENERATOR_VERSION),
        seed=generation_seed,
        status=GenerationRun.Status.PENDING,
        request=generation_data,
    )

    try:
        document, warnings = generate_document(
            coach=coach,
            student=student,
            visit=visit,
            template=template,
            request=generation_data,
        )
        if isinstance(document.get("training"), dict):
            ensure_workout_schedule(document["training"], start, end)
        if any(
            w.startswith("missing_exercise_candidates") for w in warnings
        ) and generation_data.get("fail_on_missing_exercises"):
            missing = "، ".join(
                w.split(":", 1)[1] for w in warnings if w.startswith("missing_exercise_candidates:")
            )
            raise GenerationFailedError(
                detail=f"در کاتالوگ برای {missing} حرکت مجاز کافی نیست؛ بانک حرکت یا تقسیم جلسات را اصلاح کنید."
            )

        input_snapshot = build_input_snapshot(
            coach=coach,
            student=student,
            visit=visit,
            template=template,
            request=generation_data,
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
            sections=document.get("program_sections") or program_sections_for_type(program_type),
            date_range_label=document.get("date_range_label") or "",
            date_range_start=start,
            date_range_end=end,
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


def _build_quick_generation_template(
    *,
    coach: CoachProfile,
    student: Student,
    request_data: dict,
    requested_sessions: int | None,
) -> tuple[ProgramTemplate, dict]:
    """Adapt visit-time quick settings to the existing rules_v1 generation contract."""
    raw_days = request_data.get("days_per_week")
    if raw_days in (None, ""):
        raw_days = (
            requested_sessions
            or (student.training_conditions or {}).get("training_days_per_week")
            or 4
        )
    try:
        if isinstance(raw_days, bool) or str(raw_days).strip() != str(int(raw_days)):
            raise ValueError
        days_per_week = int(raw_days)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"days_per_week": ["تعداد جلسه باید عدد صحیح باشد."]}) from exc
    if not 1 <= days_per_week <= 7:
        raise ValidationError({"days_per_week": ["تعداد جلسه باید بین ۱ تا ۷ باشد."]})

    raw_split = request_data.get("session_muscles")
    if raw_split is None:
        raw_split = [[] for _ in range(days_per_week)]
    if not isinstance(raw_split, list) or len(raw_split) != days_per_week:
        raise ValidationError(
            {"session_muscles": ["برای هر جلسه باید یک چیدمان عضلانی جداگانه فرستاده شود."]}
        )

    session_muscles: list[list[str]] = []
    split_labels: list[str] = []
    allowed_muscles = set(CANONICAL_MUSCLES)
    for day_index, raw_muscles in enumerate(raw_split):
        if not isinstance(raw_muscles, list) or len(raw_muscles) > len(CANONICAL_MUSCLES):
            raise ValidationError({"session_muscles": [f"چیدمان جلسهٔ {day_index + 1} معتبر نیست."]})
        normalized: list[str] = []
        for raw_muscle in raw_muscles:
            if not isinstance(raw_muscle, str) or not raw_muscle.strip():
                continue
            muscle = normalize_muscle(raw_muscle)
            if muscle not in allowed_muscles:
                raise ValidationError(
                    {
                        "session_muscles": [
                            f"عضلهٔ «{raw_muscle}» برای جلسهٔ {day_index + 1} معتبر نیست."
                        ]
                    }
                )
            if muscle in normalized:
                raise ValidationError(
                    {"session_muscles": [f"عضلهٔ «{muscle}» در جلسهٔ {day_index + 1} تکراری است."]}
                )
            normalized.append(muscle)
        session_muscles.append(normalized)
        split_labels.append(" و ".join(normalized))

    variety = str(request_data.get("exercise_variety") or "balanced")
    if variety not in {"stable", "balanced", "varied"}:
        raise ValidationError(
            {"exercise_variety": ["سطح تنوع حرکت باید یکی از گزینه‌های موجود باشد."]}
        )

    raw_level = (
        request_data.get("level")
        or (student.training_background or {}).get("level")
        or "intermediate"
    )
    if raw_level not in ProgramTemplate.Level.values:
        raise ValidationError({"level": ["سطح تمرین معتبر نیست."]})
    from accounts.exercise_metadata import MUSCLE_NAMES, muscle_key

    decisions = request_data.get("muscle_decisions")
    muscle_priorities = (
        [
            MUSCLE_NAMES[muscle_key(key)]
            for key, mode in decisions.items()
            if muscle_key(key) in MUSCLE_NAMES and mode == "focus"
        ]
        if isinstance(decisions, dict)
        else []
    )
    rule_set = ensure_rule_set(coach)
    template = ProgramTemplate(
        rule_set=rule_set,
        coach=coach,
        name="تنظیم سریع",
        goal=str(request_data.get("goals") or "").strip(),
        main_goal=str(request_data.get("goals") or "").strip()[:120],
        level=raw_level,
        days_per_week=days_per_week,
        intensity="متوسط",
        volume="متوسط",
        rest_time="۹۰ ثانیه",
        split=split_labels,
        muscle_priority_order=muscle_priorities,
        special_rules=[],
        execution_plan={},
    )
    return template, {
        "days_per_week": days_per_week,
        "session_muscles": session_muscles,
        "exercise_variety": variety,
    }


def _visit_sessions_per_week(visit: Visit | None) -> int | None:
    if visit is None:
        return None
    answers = visit.answers or {}
    sections = (visit.form_template_snapshot or {}).get("sections") or []
    raw_value = answers.get("sessions_per_week")
    for section in sections:
        if not isinstance(section, dict):
            continue
        for field in section.get("fields") or []:
            if (
                isinstance(field, dict)
                and field.get("semantic_key") == "sessions_per_week"
                and field.get("key") in answers
            ):
                raw_value = answers[field["key"]]
                break
        if raw_value is not None:
            break
    if isinstance(raw_value, bool) or raw_value in (None, ""):
        return None
    if isinstance(raw_value, float) and not raw_value.is_integer():
        return None
    if isinstance(raw_value, str):
        raw_value = raw_value.translate(
            str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
        )
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return None
    return value if 1 <= value <= 7 else None


@transaction.atomic
def update_program_lineage(program: Program, payload: dict) -> Program:
    if program.archived_at:
        raise InvalidStateError(detail="Archived program cannot be updated.")
    ensure_student_active(program.student)
    start, end = _program_dates(
        payload.get("date_range_start", program.date_range_start),
        payload.get("date_range_end", program.date_range_end),
    )
    if "title" in payload:
        title = str(payload["title"] or "").strip()
        if not title:
            raise ValidationError({"title": ["title is required."]})
        program.title = title
    if "date_range_label" in payload:
        program.date_range_label = str(payload["date_range_label"] or "")
    program.date_range_start = start
    program.date_range_end = end
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
    previous_volume_contract = {
        key: _deep_copy((version.training or {}).get(key))
        for key in (
            "volume_plan",
            "volume_policy",
            "session_duration_minutes",
            "eligible_exercise_ids",
            "planning_version",
            "system_warnings",
            "required_system_keys",
        )
        if key in (version.training or {})
    }
    previous_exercises = {
        str(item.get("id")): item
        for day in (version.training or {}).get("days", [])
        for item in day.get("exercises", [])
    }
    ensure_student_active(version.program.student)
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
    training.update(previous_volume_contract)
    days = training.get("days") or []
    if isinstance(days, list):
        from accounts.models import Exercise

        for day in days:
            if not isinstance(day, dict):
                raise ValidationError({"training": ["Malformed day."]})
            for ex in day.get("exercises") or []:
                if not isinstance(ex, dict):
                    raise ValidationError({"training": ["Malformed exercise."]})
                if "sets" in ex and (
                    isinstance(ex["sets"], bool)
                    or not isinstance(ex["sets"], int)
                    or not 1 <= ex["sets"] <= 100
                ):
                    raise ValidationError(
                        {"training": ["تعداد ست هر حرکت باید عدد صحیح بین ۱ و ۱۰۰ باشد."]}
                    )
                old = previous_exercises.get(str(ex.get("id")), {})
                if any(ex.get(key) != old.get(key) for key in ("sets", "reps", "rest", "rpe")):
                    raw = f"{ex.get('sets', '')}×{ex.get('reps', '')}"
                    ex["raw_prescription"] = raw
                    ex["prescription"] = {
                        **(ex.get("prescription") or {}),
                        "sets": ex.get("sets"),
                        "reps_text": ex.get("reps"),
                        "raw_prescription": raw,
                    }
                    if ex["prescription"].get("version") == 2:
                        ex["prescription"]["set_plan"] = [
                            {
                                "set": n + 1,
                                "reps_text": ex.get("reps"),
                                "rest": ex.get("rest"),
                                "effort": ex.get("rpe"),
                            }
                            for n in range(ex.get("sets", 0))
                        ]
                ex_id = ex.get("exercise_id")
                if (
                    "eligible_exercise_ids" in training
                    and str(ex_id) not in training["eligible_exercise_ids"]
                ):
                    raise ValidationError(
                        {
                            "training": [
                                "این حرکت با سطح، تجهیزات یا محدودیت‌های تأییدشدهٔ همین ویزیت سازگار نیست."
                            ]
                        }
                    )
                if ex_id:
                    reference = (
                        Exercise.objects.filter(pk=ex_id, coach_id=version.coach_id)
                        .prefetch_related(
                            "muscle_targets__muscle",
                            "muscle_targets__region",
                            "equipment_rows__equipment",
                            "suitable_level_rows",
                        )
                        .first()
                    )
                    if reference is None:
                        raise ValidationError(
                            {"training": ["Unknown or cross-coach exercise reference."]},
                            code="unknown_exercise",
                        )
                    from accounts.exercise_metadata import exercise_snapshot

                    ex["exercise_snapshot"] = (
                        _deep_copy(old["exercise_snapshot"])
                        if old.get("exercise_id") == ex_id and old.get("exercise_snapshot")
                        else exercise_snapshot(reference)
                    )
    from programming.services.volume_planning import refresh_volume_audit

    refresh_volume_audit(training)
    version.save()
    version.program.updated_at = timezone.now()
    version.program.save(update_fields=["updated_at"])
    return version


@transaction.atomic
def finalize_version(version: ProgramVersion, *, actor) -> ProgramVersion:
    version = ProgramVersion.objects.select_for_update().get(pk=version.pk)
    ensure_student_active(version.program.student)
    if version.status == ProgramVersion.Status.FINALIZED:
        return version  # idempotent
    if version.status != ProgramVersion.Status.DRAFT:
        raise InvalidStateError(detail="Only draft versions can be finalized.")
    from programming.services.volume_planning import refresh_volume_audit

    refresh_volume_audit(version.training or {}, require_complete=True)
    from programming.services.split_parser import normalize_muscle

    for day in (version.training or {}).get("days", []):
        required = {normalize_muscle(muscle) for muscle in day.get("targetMuscles", [])}
        present = {
            normalize_muscle(exercise.get("targetMuscle", ""))
            for exercise in day.get("exercises", [])
        }
        missing = required - present
        volume_muscles = ((version.training or {}).get("volume_audit") or {}).get("muscles", {})
        fulfilled_maintenance = {
            normalize_muscle(row.get("name") or key)
            for key, row in volume_muscles.items()
            if row.get("decision") == "maintenance"
            and int(row.get("actual") or 0) >= int(row.get("target") or 0)
        }
        missing -= fulfilled_maintenance
        lower_body_muscles = {"چهارسر ران", "پشت پا", "باسن", "ساق"}
        if "پا" in missing and present.intersection(lower_body_muscles):
            missing.remove("پا")
        if missing:
            raise ValidationError(
                {
                    "training": [
                        f"پوشش عضلات جلسه ناقص است: {', '.join(sorted(missing))}. کاتالوگ یا پیش‌نویس را اصلاح کنید."
                    ]
                }
            )
    from delivery.models import StagedProgramPdf
    from delivery.services.staged_program_pdfs import promote_staged_pdfs

    has_staged_uploads = StagedProgramPdf.objects.filter(program_version=version).exists()
    if version.delivery_source == ProgramVersion.DeliverySource.UPLOADED_PDF or has_staged_uploads:
        promote_staged_pdfs(version, actor=actor)
    version.status = ProgramVersion.Status.FINALIZED
    version.finalized_at = timezone.now()
    version.finalized_by = actor
    version.save(update_fields=["status", "finalized_at", "finalized_by", "training", "updated_at"])
    version.program.updated_at = timezone.now()
    version.program.save(update_fields=["updated_at"])
    return version


@transaction.atomic
def activate_version(program: Program, version_id) -> Program:
    program = Program.objects.select_for_update().get(pk=program.pk)
    ensure_student_active(program.student)
    version = get_version_for_coach(program.coach, program, version_id)
    if version.status != ProgramVersion.Status.FINALIZED:
        raise InvalidStateError(detail="Only finalized versions can be activated.")
    from delivery.models import PdfArtifact
    from programming.services import program_requests

    methods = (version.pdf_settings or {}).get("deliverySections") or {}
    required_sections = [key for key, method in methods.items() if method != "omitted"]
    ready_sections = set(
        PdfArtifact.objects.filter(program_version=version, status="ready").values_list(
            "section", flat=True
        )
    )
    if required_sections and not set(required_sections).issubset(ready_sections):
        raise InvalidStateError(detail="فایل‌های این نسخه هنوز آماده نشده‌اند.", code="pdf_not_ready")
    program_requests.validate_activation_for_requests(program, version)
    program.active_version = version
    program.save(update_fields=["active_version", "updated_at"])
    student = program.student
    student.summary_current_program_title = program.title
    student.save(update_fields=["summary_current_program_title", "updated_at"])
    program_requests.reconcile_fulfillment(program)
    from programming.services.program_notifications import schedule_program_ready_sms

    schedule_program_ready_sms(version)
    return program


@transaction.atomic
def create_new_version(source: ProgramVersion) -> ProgramVersion:
    """Same lineage; next version_number; new draft deep-copy."""
    program = Program.objects.select_for_update().get(pk=source.program_id)
    if program.archived_at:
        raise InvalidStateError(detail="Archived program cannot receive new versions.")
    ensure_student_active(program.student)
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

    version = ProgramVersion.objects.create(
        program=program,
        coach=program.coach,
        version_number=next_number,
        status=ProgramVersion.Status.DRAFT,
        delivery_source=source.delivery_source,
        training=_deep_copy(source.training),
        nutrition=_deep_copy(source.nutrition),
        supplements=_deep_copy(source.supplements),
        pdf_settings=_deep_copy(source.pdf_settings or {}),
        content_schema_version=source.content_schema_version,
        source_version=source,
    )
    if version.delivery_source == ProgramVersion.DeliverySource.UPLOADED_PDF:
        from delivery.services.staged_program_pdfs import clone_program_pdf_to_draft

        clone_program_pdf_to_draft(source, version)
    return version


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
    ensure_student_active(student)

    new_program = Program.objects.create(
        coach=coach,
        student=student,
        title=f"{source_program.title} (کپی)",
        program_type=source_program.program_type,
        sections=list(
            source_program.sections or program_sections_for_type(source_program.program_type)
        ),
        date_range_label=source_program.date_range_label,
        date_range_start=source_program.date_range_start,
        date_range_end=source_program.date_range_end,
    )
    version = ProgramVersion.objects.create(
        program=new_program,
        coach=coach,
        version_number=1,
        status=ProgramVersion.Status.DRAFT,
        delivery_source=source_version.delivery_source,
        training=_deep_copy(source_version.training),
        nutrition=_deep_copy(source_version.nutrition),
        supplements=_deep_copy(source_version.supplements),
        pdf_settings=_deep_copy(source_version.pdf_settings or {}),
        content_schema_version=source_version.content_schema_version,
        source_version=None,
        copied_from_program=source_program,
    )
    if version.delivery_source == ProgramVersion.DeliverySource.UPLOADED_PDF:
        from delivery.services.staged_program_pdfs import clone_program_pdf_to_draft

        clone_program_pdf_to_draft(source_version, version)
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
