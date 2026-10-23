"""Shared lifecycle for athlete program requests and coach fulfillment."""

from __future__ import annotations

from copy import deepcopy
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from programming.models import Program, ProgramRequest, ProgramVersion
from students.models import Student, Visit

SECTIONS = ("workout", "nutrition", "supplement")
OPEN_STATUSES = (
    ProgramRequest.Status.SUBMITTED,
    ProgramRequest.Status.AWAITING_INFO,
    ProgramRequest.Status.IN_PROGRESS,
)


def _profile_snapshot(student: Student) -> dict:
    """Return only athlete-facing profile fields; never include coach/account data."""
    return {
        "age": student.age,
        "gender": student.gender,
        "height_cm": str(student.height_cm),
        "weight_kg": str(student.weight_kg),
        "goals": deepcopy(student.goals or {}),
        "injuries": deepcopy(student.injuries or {}),
        "equipment": deepcopy(student.equipment or {}),
        "lifestyle": deepcopy(student.lifestyle or {}),
        "preferences": deepcopy(student.preferences or {}),
        "training_background": deepcopy(student.training_background or {}),
        "training_conditions": deepcopy(student.training_conditions or {}),
        "food_allergies": deepcopy(student.food_allergies or []),
        "food_intolerances": deepcopy(student.food_intolerances or []),
        "dietary_restrictions": deepcopy(student.dietary_restrictions or []),
        "dietary_preferences": deepcopy(student.dietary_preferences or []),
        "supplement_restrictions": deepcopy(student.supplement_restrictions or []),
        "relevant_medical_notes": student.relevant_medical_notes,
        "nutrition_notes": student.nutrition_notes,
    }


def _apply_request_answers_to_profile(student: Student, data: dict) -> None:
    """Keep athlete-entered plan context on their profile while preserving coach fields."""
    changed = []
    goals = deepcopy(student.goals or {})
    injuries = deepcopy(student.injuries or {})
    conditions = deepcopy(student.training_conditions or {})
    lifestyle = deepcopy(student.lifestyle or {})
    if "goal" in data:
        goals["secondary_goal"] = data["goal"].strip()
        student.goals = goals
        changed.append("goals")
    if "injury_notes" in data:
        injuries["student_notes"] = data["injury_notes"].strip()
        student.injuries = injuries
        changed.append("injuries")
    if "training_environment" in data:
        if data["training_environment"]:
            conditions["environment"] = data["training_environment"]
        else:
            conditions.pop("environment", None)
        student.training_conditions = conditions
        if "training_conditions" not in changed:
            changed.append("training_conditions")
    if "session_duration_minutes" in data:
        if data["session_duration_minutes"] is None:
            conditions.pop("session_duration_minutes", None)
        else:
            conditions["session_duration_minutes"] = data["session_duration_minutes"]
        student.training_conditions = conditions
        if "training_conditions" not in changed:
            changed.append("training_conditions")
    if "equipment_available" in data:
        selected_equipment = list(data["equipment_available"] or [])
        # An empty selection means "not specified", not "erase known profile
        # constraints". The explicit full_gym/bodyweight_only options express
        # a confirmed choice when the student wants one.
        if selected_equipment:
            equipment = deepcopy(student.equipment or {})
            equipment["available_equipment"] = selected_equipment
            student.equipment = equipment
            changed.append("equipment")
    if "sessions_per_week" in data:
        if data["sessions_per_week"] is None:
            conditions.pop("training_days_per_week", None)
        else:
            conditions["training_days_per_week"] = data["sessions_per_week"]
        student.training_conditions = conditions
        if "training_conditions" not in changed:
            changed.append("training_conditions")
    if "training_time_notes" in data:
        conditions["time_notes"] = data["training_time_notes"].strip()
        student.training_conditions = conditions
        if "training_conditions" not in changed:
            changed.append("training_conditions")
    if "sleep_notes" in data:
        lifestyle["student_sleep_notes"] = data["sleep_notes"].strip()
        student.lifestyle = lifestyle
        changed.append("lifestyle")
    if "nutrition_notes" in data:
        student.nutrition_notes = data["nutrition_notes"].strip()
        changed.append("nutrition_notes")
    if changed:
        student.save(update_fields=[*changed, "updated_at"])


def serialize_student_profile(student: Student) -> dict:
    """Public self-profile response, deliberately excluding coach-controlled fields."""
    return _profile_snapshot(student)


def _active_sections(student: Student) -> list[str]:
    sections: set[str] = set()
    current_programs = Program.objects.filter(
        coach_id=student.coach_id,
        student=student,
        archived_at__isnull=True,
        active_version__isnull=False,
    ).values_list("program_type", "sections")
    for program_type, program_sections in current_programs:
        if program_sections:
            sections.update(set(program_sections).intersection(SECTIONS))
        elif program_type == Program.ProgramType.COMPLETE:
            sections.update(SECTIONS)
        elif program_type in SECTIONS:
            sections.add(program_type)
    return [section for section in SECTIONS if section in sections]


def _available_equipment_defaults(student: Student) -> list[str]:
    equipment = student.equipment or {}
    configured = equipment.get("available_equipment")
    if isinstance(configured, list) and configured:
        return list(configured)
    if equipment.get("has_full_gym") or equipment.get("hasFullGym"):
        return ["full_gym"]

    legacy_flags = {
        "has_dumbbell": "dumbbell",
        "hasDumbbell": "dumbbell",
        "has_barbell": "barbell",
        "hasBarbell": "barbell",
        "has_cable": "cable",
        "hasCable": "cable",
        "has_machines": "machines",
        "hasMachines": "machines",
        "has_resistance_band": "resistance_band",
        "hasResistanceBand": "resistance_band",
    }
    selected = list(
        dict.fromkeys(
            token for key, token in legacy_flags.items() if equipment.get(key) is True
        )
    )
    if selected:
        return selected
    if any(key in equipment for key in legacy_flags):
        return ["bodyweight_only"]
    return []


def request_defaults(student: Student) -> dict:
    prior = (
        ProgramRequest.objects.filter(student=student, status=ProgramRequest.Status.FULFILLED)
        .order_by("-fulfilled_at", "-created_at")
        .first()
    )
    goals = student.goals or {}
    injuries = student.injuries or {}
    conditions = student.training_conditions or {}
    lifestyle = student.lifestyle or {}
    if prior:
        return {
            "purpose": ProgramRequest.Purpose.NEXT,
            "sections": prior.sections,
            "sessions_per_week": prior.sessions_per_week
            or conditions.get("training_days_per_week"),
            "session_duration_minutes": prior.session_duration_minutes
            or conditions.get("session_duration_minutes"),
            "training_environment": prior.training_environment or conditions.get("environment", ""),
            "equipment_available": list(prior.equipment_available or [])
            or _available_equipment_defaults(student),
            "assessment_mode": ProgramRequest.AssessmentMode.ONLINE,
            "goal": prior.goal,
            "injury_notes": prior.injury_notes,
            "training_time_notes": prior.training_time_notes,
            "sleep_notes": prior.sleep_notes,
            "nutrition_notes": prior.nutrition_notes,
        }
    return {
        "purpose": (
            ProgramRequest.Purpose.NEXT
            if ProgramRequest.objects.filter(student=student).exists()
            else ProgramRequest.Purpose.FIRST
        ),
        "sections": _active_sections(student) or ["workout"],
        "sessions_per_week": conditions.get("training_days_per_week"),
        "session_duration_minutes": conditions.get("session_duration_minutes"),
        "training_environment": conditions.get("environment", ""),
        "equipment_available": _available_equipment_defaults(student),
        "assessment_mode": ProgramRequest.AssessmentMode.ONLINE,
        "goal": str(goals.get("secondary_goal") or goals.get("primary_goal") or ""),
        "injury_notes": str(injuries.get("student_notes") or ""),
        "training_time_notes": str(conditions.get("time_notes") or ""),
        "sleep_notes": str(lifestyle.get("student_sleep_notes") or ""),
        "nutrition_notes": student.nutrition_notes,
    }


def serialize_request(request: ProgramRequest, *, for_student: bool = False) -> dict:
    result = {
        "id": str(request.id),
        "student_id": str(request.student_id),
        "student_name": request.student.full_name,
        "purpose": request.purpose,
        "sections": list(request.sections or []),
        "completed_sections": list(request.completed_sections or []),
        "sessions_per_week": request.sessions_per_week,
        "session_duration_minutes": request.session_duration_minutes,
        "training_environment": request.training_environment,
        "equipment_available": list(request.equipment_available or []),
        "assessment_mode": request.assessment_mode,
        "goal": request.goal,
        "injury_notes": request.injury_notes,
        "training_time_notes": request.training_time_notes,
        "sleep_notes": request.sleep_notes,
        "nutrition_notes": request.nutrition_notes,
        "profile_snapshot": deepcopy(request.profile_snapshot or {}),
        "coach_notes": request.coach_notes,
        "status": request.status,
        "visit_id": str(request.visit_id) if request.visit_id else None,
        "program_ids": [str(value) for value in request.programs.values_list("id", flat=True)],
        "read_at": request.read_at.isoformat() if request.read_at else None,
        "started_at": request.started_at.isoformat() if request.started_at else None,
        "fulfilled_at": request.fulfilled_at.isoformat() if request.fulfilled_at else None,
        "created_at": request.created_at.isoformat(),
        "updated_at": request.updated_at.isoformat(),
    }
    if for_student:
        result.pop("profile_snapshot")
        result.pop("coach_notes")
    return result


def _validated_visit(*, coach, student, visit_id) -> Visit | None:
    if not visit_id:
        return None
    try:
        return Visit.objects.get(pk=visit_id, coach=coach, student=student)
    except Visit.DoesNotExist as exc:
        raise NotFound(detail="Visit not found for this student.") from exc


@transaction.atomic
def create_request(
    *, student: Student, actor, data: dict, coach=None
) -> tuple[ProgramRequest, bool]:
    coach = coach or student.coach
    if student.coach_id != coach.id:
        raise NotFound(detail="Student not found.")
    if student.status != Student.Status.ACTIVE or student.archived_at is not None:
        raise PermissionDenied(detail="برای شاگرد غیرفعال امکان ثبت درخواست برنامه وجود ندارد.")
    coach_user = getattr(coach, "user", None)
    if coach_user is None or not coach_user.is_active:
        raise PermissionDenied(detail="مربی فعال نیست.")

    student = Student.objects.select_for_update().get(pk=student.pk)
    existing = (
        ProgramRequest.objects.select_for_update()
        .filter(student=student, status__in=OPEN_STATUSES)
        .first()
    )
    visit = _validated_visit(coach=coach, student=student, visit_id=data.get("visit_id"))
    if existing:
        if visit and not existing.visit_id:
            existing.visit = visit
            existing.assessment_mode = ProgramRequest.AssessmentMode.IN_PERSON
            existing.save(update_fields=["visit", "assessment_mode", "updated_at"])
        return existing, False

    sections = list(dict.fromkeys(data.get("sections") or []))
    if not sections or any(section not in SECTIONS for section in sections):
        raise ValidationError({"sections": ["At least one valid program section is required."]})
    _apply_request_answers_to_profile(student, data)
    mode = data.get("assessment_mode") or ProgramRequest.AssessmentMode.ONLINE
    if visit:
        mode = ProgramRequest.AssessmentMode.IN_PERSON
    request = ProgramRequest.objects.create(
        coach=coach,
        student=student,
        created_by=actor,
        visit=visit,
        purpose=data.get("purpose") or ProgramRequest.Purpose.NEXT,
        sections=sections,
        sessions_per_week=data.get("sessions_per_week"),
        session_duration_minutes=data.get("session_duration_minutes"),
        training_environment=data.get("training_environment") or "",
        equipment_available=list(data.get("equipment_available") or []),
        assessment_mode=mode,
        goal=(data.get("goal") or "").strip(),
        injury_notes=(data.get("injury_notes") or "").strip(),
        training_time_notes=(data.get("training_time_notes") or "").strip(),
        sleep_notes=(data.get("sleep_notes") or "").strip(),
        nutrition_notes=(data.get("nutrition_notes") or "").strip(),
        profile_snapshot={
            **_profile_snapshot(student),
            "request_answers": {
                "goal": (data.get("goal") or "").strip(),
                "injury_notes": (data.get("injury_notes") or "").strip(),
                "training_time_notes": (data.get("training_time_notes") or "").strip(),
                "session_duration_minutes": data.get("session_duration_minutes"),
                "equipment_available": list(data.get("equipment_available") or []),
                "sleep_notes": (data.get("sleep_notes") or "").strip(),
                "nutrition_notes": (data.get("nutrition_notes") or "").strip(),
            },
        },
    )
    return request, True


@transaction.atomic
def cancel_request(*, request: ProgramRequest, actor) -> ProgramRequest:
    """Cancel an open request while keeping linked visits and programs intact."""
    Student.objects.select_for_update().get(pk=request.student_id)
    request = ProgramRequest.objects.select_for_update().get(pk=request.pk)
    if request.status not in OPEN_STATUSES:
        raise ValidationError({"status": ["این درخواست باز نیست و امکان لغو آن وجود ندارد."]})

    request.status = ProgramRequest.Status.CANCELLED
    request.cancelled_at = timezone.now()
    request.cancelled_by = actor
    request.save(update_fields=["status", "cancelled_at", "cancelled_by", "updated_at"])
    return request


@transaction.atomic
def mark_read(request: ProgramRequest) -> ProgramRequest:
    if request.read_at is None:
        request.read_at = timezone.now()
        request.save(update_fields=["read_at", "updated_at"])
    return request


@transaction.atomic
def start_request(
    *, request: ProgramRequest, assessment_mode: str | None = None, visit_id=None
) -> ProgramRequest:
    request = (
        ProgramRequest.objects.select_for_update()
        .select_related("student", "coach")
        .get(pk=request.pk)
    )
    if request.status not in OPEN_STATUSES:
        raise ValidationError({"status": ["این درخواست دیگر باز نیست."]})
    visit = _validated_visit(coach=request.coach, student=request.student, visit_id=visit_id)
    if assessment_mode and assessment_mode not in ProgramRequest.AssessmentMode.values:
        raise ValidationError({"assessment_mode": ["روش ویزیت معتبر نیست."]})
    if visit:
        request.visit = visit
        request.assessment_mode = assessment_mode or request.assessment_mode
        if visit.status == Visit.Status.WAITING_FOR_STUDENT:
            request.status = ProgramRequest.Status.AWAITING_INFO
        else:
            request.status = ProgramRequest.Status.IN_PROGRESS
    elif assessment_mode:
        request.assessment_mode = assessment_mode
        request.status = ProgramRequest.Status.IN_PROGRESS
    else:
        request.status = ProgramRequest.Status.IN_PROGRESS
    request.started_at = request.started_at or timezone.now()
    request.read_at = request.read_at or timezone.now()
    request.save(
        update_fields=["visit", "assessment_mode", "status", "started_at", "read_at", "updated_at"]
    )
    return request


def _sections_for_program(program: Program) -> set[str]:
    sections = set(program.sections or [])
    if not sections:
        if program.program_type == Program.ProgramType.COMPLETE:
            sections = set(SECTIONS)
        elif program.program_type in SECTIONS:
            sections = {program.program_type}
    return sections.intersection(SECTIONS)


def _ready_sections_for_version(program: Program, version: ProgramVersion) -> set[str]:
    from delivery.models import PdfArtifact

    return set(
        PdfArtifact.objects.filter(
            program=program,
            program_version=version,
            status=PdfArtifact.Status.READY,
            deleted_at__isnull=True,
            file__isnull=False,
        )
        .exclude(section="")
        .values_list("section", flat=True)
    )


def validate_activation_for_requests(program: Program, version: ProgramVersion) -> None:
    """Reject publishing a request-linked section until its student PDF is ready."""
    for request in ProgramRequest.objects.filter(programs=program, status__in=OPEN_STATUSES):
        required_here = _sections_for_program(program).intersection(request.sections or [])
        ready = _ready_sections_for_version(program, version)
        missing = required_here - ready
        if missing:
            raise ValidationError(
                {
                    "program_request": [
                        "فایل آمادهٔ همهٔ بخش‌های انتخاب‌شدهٔ این درخواست باید قبل از انتشار در دسترس باشد."
                    ]
                }
            )


@transaction.atomic
def link_program(
    *, program: Program, actor, request_id=None, visit_id=None
) -> ProgramRequest | None:
    """Link a new draft to the explicit request, or create an in-person request for a visit flow."""
    request = None
    if request_id:
        try:
            request_id = UUID(str(request_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise NotFound(detail="درخواست برنامهٔ باز برای این شاگرد پیدا نشد.") from exc
        try:
            request = ProgramRequest.objects.select_for_update().get(
                pk=request_id,
                coach=program.coach,
                student=program.student,
                status__in=OPEN_STATUSES,
            )
        except ProgramRequest.DoesNotExist as exc:
            raise NotFound(detail="درخواست برنامهٔ باز برای این شاگرد پیدا نشد.") from exc
        if visit_id and str(visit_id) != str(request.visit_id):
            raise ValidationError(
                {"visit_id": ["ویزیت انتخاب‌شده با ویزیت متصل به درخواست یکسان نیست."]}
            )
    elif visit_id:
        defaults = request_defaults(program.student)
        defaults.update(
            {
                "assessment_mode": ProgramRequest.AssessmentMode.IN_PERSON,
                "sections": [
                    section for section in SECTIONS if section in _sections_for_program(program)
                ],
                "visit_id": visit_id,
            }
        )
        request, _ = create_request(
            student=program.student,
            coach=program.coach,
            actor=actor,
            data=defaults,
        )
    if request is None:
        return None
    matching_sections = _sections_for_program(program).intersection(request.sections or [])
    if not matching_sections:
        raise ValidationError({"program": ["این برنامه هیچ‌یک از بخش‌های درخواست‌شده را ندارد."]})
    program.sections = [section for section in SECTIONS if section in matching_sections]
    program.save(update_fields=["sections", "updated_at"])
    request.programs.add(program)
    request.status = ProgramRequest.Status.IN_PROGRESS
    request.started_at = request.started_at or timezone.now()
    request.save(update_fields=["status", "started_at", "updated_at"])
    return request


@transaction.atomic
def reconcile_fulfillment(program: Program) -> None:
    """Fulfill a request only when each requested active section has a ready PDF."""
    if not program.active_version_id:
        return
    version = program.active_version
    if version.status != ProgramVersion.Status.FINALIZED or program.archived_at:
        return
    for request in ProgramRequest.objects.select_for_update().filter(
        programs=program, status__in=OPEN_STATUSES
    ):
        completed: set[str] = set()
        linked_programs = request.programs.filter(
            archived_at__isnull=True,
            active_version__status=ProgramVersion.Status.FINALIZED,
        ).select_related("active_version")
        for linked in linked_programs:
            completed.update(
                _ready_sections_for_version(linked, linked.active_version).intersection(
                    request.sections or []
                )
            )
        request.completed_sections = [section for section in SECTIONS if section in completed]
        if set(request.sections).issubset(completed):
            request.status = ProgramRequest.Status.FULFILLED
            request.fulfilled_at = timezone.now()
        request.save(update_fields=["completed_sections", "status", "fulfilled_at", "updated_at"])
