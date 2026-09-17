from __future__ import annotations

import uuid

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from accounts.models import CoachProfile
from common.exceptions import ConflictError
from common.permissions import get_owned_object
from common.phone import (
    InvalidPhoneError,
    normalize_iran_mobile,
    normalize_iran_mobile_or_validation_error,
)
from students.models import Student, StudentProfile, Visit

User = get_user_model()


def _raise_drf_validation(exc: DjangoValidationError):
    if hasattr(exc, "message_dict"):
        raise ValidationError(exc.message_dict) from exc
    raise ValidationError(exc.messages) from exc


def _ensure_unique_student_phone(phone_canon: str, *, exclude_id=None) -> None:
    qs = Student.objects.filter(phone_number=phone_canon)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک شاگرد ثبت شده است.",
            code="student_phone_already_exists",
        )


PRIMARY_GOALS = {
    "hypertrophy",
    "fat_loss",
    "strength",
    "body_recomposition",
    "general_health",
    "maintain",
    "general_muscle_gain",
}
TRAINING_LEVELS = {"beginner", "intermediate", "advanced"}


def students_for_coach(coach):
    return Student.objects.filter(coach=coach)


def get_student_for_coach(coach, student_id) -> Student:
    return get_owned_object(
        Student.objects.all(), coach=coach, pk=student_id, not_found_message="Student not found."
    )


def _validate_goals(goals: dict | None) -> dict:
    goals = goals or {}
    primary = goals.get("primary_goal")
    if primary and primary not in PRIMARY_GOALS:
        raise ValidationError({"goals": {"primary_goal": [f"Invalid primary_goal: {primary}"]}})
    return goals


def _validate_training_background(tb: dict | None) -> dict:
    tb = tb or {}
    level = tb.get("level")
    if level and level not in TRAINING_LEVELS:
        raise ValidationError({"training_background": {"level": [f"Invalid level: {level}"]}})
    return tb


@transaction.atomic
def create_student(coach, data: dict) -> Student:
    goals = _validate_goals(data.get("goals"))
    training_background = _validate_training_background(data.get("training_background"))
    summary = data.pop("summary", {}) or {}
    phone_canon = normalize_iran_mobile_or_validation_error(
        data.get("phone_number"),
        required=True,
        field="phone_number",
    )
    _ensure_unique_student_phone(phone_canon)

    student = Student(
        coach=coach,
        full_name=data["full_name"].strip(),
        age=data["age"],
        gender=data["gender"],
        height_cm=data["height_cm"],
        weight_kg=data["weight_kg"],
        phone_number=phone_canon,
        status=data.get("status") or Student.Status.ACTIVE,
        coach_notes=data.get("coach_notes") or "",
        goals=goals,
        injuries=data.get("injuries") or {},
        equipment=data.get("equipment") or {},
        lifestyle=data.get("lifestyle") or {},
        preferences=data.get("preferences") or {},
        training_background=training_background,
        training_conditions=data.get("training_conditions") or {},
        food_allergies=data.get("food_allergies") or [],
        food_intolerances=data.get("food_intolerances") or [],
        dietary_restrictions=data.get("dietary_restrictions") or [],
        dietary_preferences=data.get("dietary_preferences") or [],
        supplement_restrictions=data.get("supplement_restrictions") or [],
        relevant_medical_notes=data.get("relevant_medical_notes") or "",
        nutrition_notes=data.get("nutrition_notes") or "",
        summary_current_program_title=summary.get("current_program_title") or "",
        summary_last_visit_date=summary.get("last_visit_date"),
        summary_medical_note=summary.get("medical_note") or "",
    )
    try:
        student.full_clean()
    except DjangoValidationError as exc:
        _raise_drf_validation(exc)
    try:
        student.save()
    except IntegrityError as exc:
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک شاگرد ثبت شده است.",
            code="student_phone_already_exists",
        ) from exc
    return student


@transaction.atomic
def update_student(student: Student, data: dict) -> Student:
    summary = data.pop("summary", None)
    if "goals" in data:
        data["goals"] = _validate_goals(data.get("goals"))
    if "training_background" in data:
        data["training_background"] = _validate_training_background(data.get("training_background"))

    for field in (
        "full_name",
        "age",
        "gender",
        "height_cm",
        "weight_kg",
        "phone_number",
        "status",
        "coach_notes",
        "goals",
        "injuries",
        "equipment",
        "lifestyle",
        "preferences",
        "training_background",
        "training_conditions",
        "food_allergies",
        "food_intolerances",
        "dietary_restrictions",
        "dietary_preferences",
        "supplement_restrictions",
        "relevant_medical_notes",
        "nutrition_notes",
    ):
        if field in data:
            value = data[field]
            if field == "full_name" and value is not None:
                value = str(value).strip()
            if field == "phone_number":
                value = normalize_iran_mobile_or_validation_error(
                    value,
                    required=True,
                    field="phone_number",
                )
                _ensure_unique_student_phone(value, exclude_id=student.pk)
            setattr(student, field, value)

    if summary is not None:
        if "current_program_title" in summary:
            student.summary_current_program_title = summary.get("current_program_title") or ""
        if "last_visit_date" in summary:
            student.summary_last_visit_date = summary.get("last_visit_date")
        if "medical_note" in summary:
            student.summary_medical_note = summary.get("medical_note") or ""

    try:
        student.full_clean()
    except DjangoValidationError as exc:
        _raise_drf_validation(exc)
    try:
        student.save()
    except IntegrityError as exc:
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک شاگرد ثبت شده است.",
            code="student_phone_already_exists",
        ) from exc
    return student


@transaction.atomic
def archive_student(student: Student) -> Student:
    student.status = Student.Status.INACTIVE
    student.archived_at = timezone.now()
    student.save(update_fields=["status", "archived_at", "updated_at"])
    return student


@transaction.atomic
def restore_student(student: Student) -> Student:
    student.status = Student.Status.ACTIVE
    student.archived_at = None
    student.save(update_fields=["status", "archived_at", "updated_at"])
    return student


@transaction.atomic
def transfer_student(student: Student, new_coach: CoachProfile) -> Student:
    if student.coach_id == new_coach.id:
        return student
    student.coach = new_coach
    student.save(update_fields=["coach", "updated_at"])
    Visit.objects.filter(student=student).update(coach=new_coach)

    # Keep coach FKs aligned on related artifacts owned via the student.
    from programming.models import Program, ProgramVersion

    Program.objects.filter(student=student).update(coach=new_coach)
    ProgramVersion.objects.filter(program__student=student).update(coach=new_coach)

    try:
        from delivery.models import PdfArtifact, PdfShareLink
    except ImportError:  # pragma: no cover
        pass
    else:
        PdfArtifact.objects.filter(student=student).update(coach=new_coach)
        PdfShareLink.objects.filter(artifact__student=student).update(coach=new_coach)

    return student


def set_student_phone(student: Student, phone_number: str) -> Student:
    phone_canon = normalize_iran_mobile_or_validation_error(
        phone_number,
        required=True,
        field="phone_number",
    )
    _ensure_unique_student_phone(phone_canon, exclude_id=student.pk)
    student.phone_number = phone_canon
    try:
        student.save(update_fields=["phone_number", "updated_at"])
    except IntegrityError as exc:
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک شاگرد ثبت شده است.",
            code="student_phone_already_exists",
        ) from exc
    return student


def visits_for_student(coach, student: Student):
    return Visit.objects.filter(coach=coach, student=student)


def get_visit_for_student(coach, student: Student, visit_id) -> Visit:
    try:
        return Visit.objects.get(coach=coach, student=student, pk=visit_id)
    except Visit.DoesNotExist as exc:
        raise NotFound(detail="Visit not found.") from exc


def get_latest_visit(coach, student: Student) -> Visit:
    visit = (
        Visit.objects.filter(coach=coach, student=student)
        .order_by("-visit_date", "-created_at")
        .first()
    )
    if visit is None:
        raise NotFound(detail="Visit not found.")
    return visit


@transaction.atomic
def create_visit(coach, student: Student, data: dict, *, actor=None) -> Visit:
    from students import visit_form_services as vfs

    if student.coach_id != coach.id:
        raise NotFound(detail="Student not found.")

    visit_date = data["visit_date"]
    if Visit.objects.filter(student=student, visit_date=visit_date).exists():
        raise ConflictError(detail="A visit already exists for this date.")

    measurements = data.get("measurements") or {}
    adherence = data.get("adherence") or {}

    visit = Visit(
        coach=coach,
        student=student,
        visit_date=visit_date,
        current_weight_kg=data["current_weight_kg"],
        previous_weight_kg=data["previous_weight_kg"],
        body_fat_percentage=data.get("body_fat_percentage"),
        waist_cm=measurements.get("waist_cm"),
        chest_cm=measurements.get("chest_cm"),
        arm_cm=measurements.get("arm_cm"),
        thigh_cm=measurements.get("thigh_cm"),
        hip_cm=measurements.get("hip_cm"),
        adherence_overall=adherence.get("overall_percent", 0),
        adherence_training=adherence.get("training_percent", 0),
        adherence_nutrition=adherence.get("nutrition_percent", 0),
        adherence_supplements=adherence.get("supplements_percent", 0),
        daily_energy_level=data["daily_energy_level"],
        sleep_quality=data["sleep_quality"],
        stress_level=data["stress_level"],
        body_feeling=data.get("body_feeling") or "",
        student_feedback=data.get("student_feedback") or "",
        coach_assessment=data.get("coach_assessment") or "",
        coach_notes=data.get("coach_notes") or "",
        coach_private_notes=data.get("coach_private_notes") or "",
        has_new_injury=bool(data.get("has_new_injury", False)),
        new_injury_notes=data.get("new_injury_notes") or "",
        next_cycle_goal=data.get("next_cycle_goal") or "",
        training_condition_changes=data.get("training_condition_changes") or "",
        # Lifecycle always starts as a coach-side draft; use send-to-student /
        # finalize endpoints to progress it. Client-supplied status is ignored.
        status=Visit.Status.DRAFT,
    )

    template = vfs.resolve_form_template(coach, data)
    answers_input = data.get("answers")
    vfs.apply_form_template_to_visit(visit, template, set_answers=False)

    try:
        visit.full_clean()
    except DjangoValidationError as exc:
        _raise_drf_validation(exc)
    visit.save()

    if answers_input is not None:
        vfs.record_answer_changes(visit, answers_input, source="coach", actor=actor)
        visit.save(update_fields=["answers", "answer_sources", "updated_at"])
    elif template is not None:
        prefill = vfs.build_prefill_answers(student, template)
        if prefill:
            vfs.record_answer_changes(visit, prefill, source="prefill", actor=actor)
            visit.save(update_fields=["answers", "answer_sources", "updated_at"])

    student.summary_last_visit_date = visit.visit_date
    student.save(update_fields=["summary_last_visit_date", "updated_at"])
    return visit


@transaction.atomic
def update_visit(visit: Visit, data: dict, *, actor=None) -> Visit:
    from students import visit_form_services as vfs

    if visit.status == Visit.Status.FINALIZED:
        raise ValidationError(
            {"status": ["Visit is finalized and cannot be modified."]},
            code="visit_finalized",
        )

    measurements = data.pop("measurements", None)
    adherence = data.pop("adherence", None)
    # Lifecycle transitions happen via dedicated actions only.
    data.pop("status", None)

    if "visit_date" in data and data["visit_date"] != visit.visit_date:
        if (
            Visit.objects.filter(student=visit.student, visit_date=data["visit_date"])
            .exclude(pk=visit.pk)
            .exists()
        ):
            raise ConflictError(detail="A visit already exists for this date.")

    for field in (
        "visit_date",
        "current_weight_kg",
        "previous_weight_kg",
        "body_fat_percentage",
        "daily_energy_level",
        "sleep_quality",
        "stress_level",
        "body_feeling",
        "student_feedback",
        "coach_assessment",
        "coach_notes",
        "coach_private_notes",
        "has_new_injury",
        "new_injury_notes",
        "next_cycle_goal",
        "training_condition_changes",
    ):
        if field in data:
            setattr(visit, field, data[field])

    if measurements is not None:
        for src, dest in (
            ("waist_cm", "waist_cm"),
            ("chest_cm", "chest_cm"),
            ("arm_cm", "arm_cm"),
            ("thigh_cm", "thigh_cm"),
            ("hip_cm", "hip_cm"),
        ):
            if src in measurements:
                setattr(visit, dest, measurements.get(src))

    if adherence is not None:
        mapping = {
            "overall_percent": "adherence_overall",
            "training_percent": "adherence_training",
            "nutrition_percent": "adherence_nutrition",
            "supplements_percent": "adherence_supplements",
        }
        for src, dest in mapping.items():
            if src in adherence:
                setattr(visit, dest, adherence.get(src))

    template_id = data.get("form_template_id") or data.get("template_id")
    if (template_id is not None or "skip_form_template" in data) and visit.status not in {
        Visit.Status.DRAFT,
        Visit.Status.COACH_REVIEW,
    }:
        raise ValidationError(
            {"form_template_id": ["Cannot change visit form template in this status."]},
            code="invalid_visit_status",
        )

    if template_id is not None or "skip_form_template" in data:
        template = vfs.resolve_form_template(visit.coach, data)
        current_id = str(visit.form_template_id) if visit.form_template_id else ""
        new_id = str(template.id) if template is not None else ""
        if current_id != new_id:
            vfs.apply_form_template_to_visit(visit, template, set_answers=False)
            if "answers" in data:
                vfs.update_visit_answers_as_coach(visit, data["answers"], actor=actor)
            elif template is not None:
                prefill = vfs.build_prefill_answers(visit.student, template)
                if prefill:
                    vfs.record_answer_changes(visit, prefill, source="prefill", actor=actor)
        elif "answers" in data:
            vfs.update_visit_answers_as_coach(visit, data["answers"], actor=actor)
    elif "answers" in data:
        vfs.update_visit_answers_as_coach(visit, data["answers"], actor=actor)

    try:
        visit.full_clean()
    except DjangoValidationError as exc:
        _raise_drf_validation(exc)
    visit.save()

    latest = (
        Visit.objects.filter(student=visit.student)
        .order_by("-visit_date", "-created_at")
        .values_list("visit_date", flat=True)
        .first()
    )
    visit.student.summary_last_visit_date = latest
    visit.student.save(update_fields=["summary_last_visit_date", "updated_at"])
    return visit


@transaction.atomic
def delete_visit(visit: Visit) -> None:
    student = visit.student
    visit.delete()
    latest = (
        Visit.objects.filter(student=student)
        .order_by("-visit_date", "-created_at")
        .values_list("visit_date", flat=True)
        .first()
    )
    student.summary_last_visit_date = latest
    student.save(update_fields=["summary_last_visit_date", "updated_at"])


# ---------------------------------------------------------------------------
# Student self-service portal
# ---------------------------------------------------------------------------

SETUP_GENERIC_ERROR = "اطلاعات ورود نامعتبر است."
STUDENT_LOGIN_GENERIC_ERROR = "نام کاربری یا رمز عبور نادرست است."
STUDENT_PORTAL_DENIED_ERROR = (
    "شما اجازه استفاده از سامانه را ندارید. "
    "برای دریافت یا فعال‌سازی نام کاربری، با مربی خود هماهنگ شوید."
)
MIN_INITIAL_PASSWORD_LENGTH = 4
MIN_PORTAL_USERNAME_LENGTH = 3


class StudentPortalAccessDenied(PermissionError):
    """Username unknown, portal disabled, or account not provisioned by coach."""

    code = "portal_access_denied"
    message = STUDENT_PORTAL_DENIED_ERROR

    def __init__(self, message: str = STUDENT_PORTAL_DENIED_ERROR):
        self.message = message
        super().__init__(message)


class StudentLoginInvalidCredentials(PermissionError):
    """Portal is enabled but password (or credential check) failed."""

    code = "authentication_required"
    message = STUDENT_LOGIN_GENERIC_ERROR

    def __init__(self, message: str = STUDENT_LOGIN_GENERIC_ERROR):
        self.message = message
        super().__init__(message)


def visits_for_student_profile(student: Student):
    # Drafts are coach-only work in progress; students only ever see visits
    # once they've been sent (or later submitted/finalized).
    return Visit.objects.filter(student=student).exclude(status=Visit.Status.DRAFT)


def get_visit_for_student_profile(student: Student, visit_id) -> Visit:
    try:
        return (
            Visit.objects.filter(student=student)
            .exclude(status=Visit.Status.DRAFT)
            .get(pk=visit_id)
        )
    except Visit.DoesNotExist as exc:
        raise NotFound(detail="Visit not found.") from exc


def _student_username_base(student: Student) -> str:
    if student.phone_number:
        return student.phone_number.lstrip("+")
    return f"student_{uuid.uuid4().hex[:8]}"


def _unique_username(base: str, *, exclude_user_id=None) -> str:
    candidate = base
    n = 2
    while User.objects.filter(username__iexact=candidate).exclude(pk=exclude_user_id).exists():
        candidate = f"{base}_{n}"
        n += 1
    return candidate


def _pending_username(student: Student) -> str:
    return _unique_username(f"pending_{student.id.hex[:12]}")


def _validate_coach_initial_password(password: str) -> str:
    """Coach-chosen initial password. Allows simple test values like 123456."""
    raw = password if isinstance(password, str) else ""
    if len(raw) < MIN_INITIAL_PASSWORD_LENGTH:
        raise ValidationError(
            {
                "initial_password": [
                    f"رمز اولیه باید حداقل {MIN_INITIAL_PASSWORD_LENGTH} کاراکتر باشد."
                ]
            },
            code="initial_password_too_short",
        )
    if len(raw) > 128:
        raise ValidationError(
            {"initial_password": ["رمز اولیه بیش از حد طولانی است."]},
            code="initial_password_too_long",
        )
    return raw


def _validate_portal_username(username: str, *, exclude_user_id=None) -> str:
    chosen = (username or "").strip()
    if len(chosen) < MIN_PORTAL_USERNAME_LENGTH:
        raise ValidationError(
            {
                "username": [
                    f"نام کاربری باید حداقل {MIN_PORTAL_USERNAME_LENGTH} کاراکتر باشد."
                ]
            },
            code="username_too_short",
        )
    if len(chosen) > 150:
        raise ValidationError(
            {"username": ["نام کاربری بیش از حد طولانی است."]},
            code="username_too_long",
        )
    qs = User.objects.filter(username__iexact=chosen)
    if exclude_user_id is not None:
        qs = qs.exclude(pk=exclude_user_id)
    if qs.exists():
        raise ValidationError(
            {"username": ["این نام کاربری قبلاً استفاده شده است."]},
            code="username_taken",
        )
    return chosen


def serialize_portal_access(student: Student) -> dict:
    try:
        profile = student.auth_profile
    except StudentProfile.DoesNotExist:
        profile = None
    if profile is None:
        return {
            "status": "not_started",
            "portal_enabled": False,
            "account_activated": False,
            "must_change_password": False,
            "username": None,
            "has_pending_initial_password": False,
        }
    username = profile.user.username
    if username.startswith("pending_"):
        username = None
    return {
        "status": profile.portal_status(),
        "portal_enabled": profile.portal_enabled,
        "account_activated": profile.is_account_activated,
        "must_change_password": profile.must_change_password,
        "username": username,
        "has_pending_initial_password": bool(
            profile.portal_enabled and profile.must_change_password
        ),
    }


def _ensure_portal_user(student: Student) -> StudentProfile:
    profile = StudentProfile.objects.filter(student=student).select_related("user").first()
    if profile is not None:
        return profile
    user = User(username=_pending_username(student), is_active=False)
    user.set_unusable_password()
    user.save()
    return StudentProfile.objects.create(user=user, student=student, portal_enabled=False)


def _apply_initial_password(profile: StudentProfile, initial_password: str) -> None:
    user = profile.user
    user.set_password(initial_password)
    user.is_active = True
    user.save(update_fields=["password", "is_active"])
    profile.portal_enabled = True
    profile.must_change_password = True
    profile.save(update_fields=["portal_enabled", "must_change_password", "updated_at"])


@transaction.atomic
def set_portal_initial_password(
    coach, student: Student, *, username: str, initial_password: str
) -> dict:
    """Coach assigns portal username + initial password (hashed; shown once)."""
    if student.coach_id != coach.id:
        raise NotFound(detail="Student not found.")
    if not student.phone_number:
        raise ValidationError(
            {"phone_number": ["شماره موبایل شاگرد برای فعال‌سازی پنل الزامی است."]},
            code="phone_required",
        )
    password = _validate_coach_initial_password(initial_password)
    profile = _ensure_portal_user(student)
    chosen_username = _validate_portal_username(username, exclude_user_id=profile.user_id)
    user = profile.user
    user.username = chosen_username
    user.first_name = student.full_name[:150]
    user.save(update_fields=["username", "first_name"])
    _apply_initial_password(profile, password)
    profile.refresh_from_db()
    return {
        "student_id": str(student.id),
        "initial_password": password,
        "username": chosen_username,
        "portal_access": serialize_portal_access(student),
        "account_activated": profile.is_account_activated,
        "must_change_password": True,
        "purpose": "first_activation" if not profile.is_account_activated else "password_reset",
    }


@transaction.atomic
def set_portal_username(coach, student: Student, *, username: str) -> dict:
    """Coach edits the portal username without changing password."""
    if student.coach_id != coach.id:
        raise NotFound(detail="Student not found.")
    profile = StudentProfile.objects.filter(student=student).select_related("user").first()
    if profile is None:
        raise ValidationError(
            {"portal": ["ابتدا پنل شاگرد را با نام کاربری و رمز اولیه فعال کنید."]},
            code="activation_required",
        )
    chosen = _validate_portal_username(username, exclude_user_id=profile.user_id)
    user = profile.user
    user.username = chosen
    user.save(update_fields=["username"])
    return {
        "student_id": str(student.id),
        "username": chosen,
        "portal_access": serialize_portal_access(student),
    }


@transaction.atomic
def reset_portal_password(coach, student: Student, *, initial_password: str) -> dict:
    """Reset portal password; keep username and all student data; force change."""
    if student.coach_id != coach.id:
        raise NotFound(detail="Student not found.")
    profile = StudentProfile.objects.filter(student=student).select_related("user").first()
    if profile is None:
        raise ValidationError(
            {"portal": ["حساب شاگرد هنوز فعال نشده؛ ابتدا فعال‌سازی را انجام دهید."]},
            code="activation_required",
        )
    if profile.user.username.startswith("pending_"):
        raise ValidationError(
            {"username": ["ابتدا نام کاربری شاگرد را تعیین کنید."]},
            code="username_required",
        )
    password = _validate_coach_initial_password(initial_password)
    _apply_initial_password(profile, password)
    profile.refresh_from_db()
    return {
        "student_id": str(student.id),
        "initial_password": password,
        "username": profile.user.username,
        "portal_access": serialize_portal_access(student),
        "account_activated": profile.is_account_activated,
        "must_change_password": True,
        "purpose": "password_reset",
    }


@transaction.atomic
def deactivate_student_portal(coach, student: Student) -> dict:
    if student.coach_id != coach.id:
        raise NotFound(detail="Student not found.")
    profile = StudentProfile.objects.filter(student=student).select_related("user").first()
    if profile is None:
        return {
            "student_id": str(student.id),
            "portal_access": serialize_portal_access(student),
        }
    profile.portal_enabled = False
    profile.save(update_fields=["portal_enabled", "updated_at"])
    user = profile.user
    user.is_active = False
    user.save(update_fields=["is_active"])
    return {
        "student_id": str(student.id),
        "portal_access": serialize_portal_access(student),
    }


@transaction.atomic
def reactivate_student_portal(coach, student: Student) -> dict:
    """Re-enable portal without resetting password."""
    if student.coach_id != coach.id:
        raise NotFound(detail="Student not found.")
    profile = StudentProfile.objects.filter(student=student).select_related("user").first()
    if profile is None or profile.user.username.startswith("pending_"):
        raise ValidationError(
            {"portal": ["ابتدا باید حساب شاگرد با نام کاربری فعال شود."]},
            code="activation_required",
        )
    if profile.must_change_password:
        raise ValidationError(
            {
                "portal": [
                    "رمز اولیه در انتظار تغییر است؛ شاگرد باید با نام کاربری و رمز اولیه وارد شود."
                ]
            },
            code="password_change_required",
        )
    profile.portal_enabled = True
    profile.save(update_fields=["portal_enabled", "updated_at"])
    user = profile.user
    user.is_active = True
    user.save(update_fields=["is_active"])
    return {
        "student_id": str(student.id),
        "portal_access": serialize_portal_access(student),
    }


def _student_session_payload(user, student: Student, *, must_change_password: bool) -> dict:
    from accounts.services import session_payload

    payload = session_payload(user, student=student, must_change_password=must_change_password)
    payload["username"] = user.username
    return payload


@transaction.atomic
def login_student(*, username: str, password: str) -> dict:
    """Student portal login by coach-owned username + password."""
    identifier = (username or "").strip()
    if not identifier:
        raise StudentPortalAccessDenied()

    user = (
        User.objects.filter(username__iexact=identifier)
        .select_related("student_profile__student")
        .first()
    )
    if user is None:
        raise StudentPortalAccessDenied()

    if getattr(user, "coach_profile", None) is not None:
        raise StudentPortalAccessDenied()

    profile = getattr(user, "student_profile", None)
    if profile is None:
        raise StudentPortalAccessDenied()

    if not profile.portal_enabled or not user.is_active:
        raise StudentPortalAccessDenied()

    if user.username.startswith("pending_") or not user.has_usable_password():
        raise StudentPortalAccessDenied()

    if not user.check_password(password):
        raise StudentLoginInvalidCredentials()

    return _student_session_payload(
        user, profile.student, must_change_password=bool(profile.must_change_password)
    )


SETUP_COMPLETE_RELOGIN_MESSAGE = (
    "رمز عبور با موفقیت تغییر کرد. لطفاً دوباره با نام کاربری و رمز جدید وارد شوید."
)


@transaction.atomic
def complete_student_setup(
    *,
    user,
    password: str,
    password_confirm: str | None = None,
) -> dict:
    """Forced password change after coach initial/reset password. Username is coach-owned."""
    from django.contrib.auth.password_validation import validate_password
    from accounts.services import blacklist_user_refresh_tokens

    profile = getattr(user, "student_profile", None)
    if profile is None:
        raise PermissionDenied(detail="Student profile is required.")
    if not profile.portal_enabled:
        raise PermissionDenied(detail="دسترسی پنل شاگرد غیرفعال است.")
    if not profile.must_change_password:
        raise ValidationError(
            {"password": ["تغییر رمز اجباری برای این حساب فعال نیست."]},
            code="password_change_not_required",
        )

    if password_confirm is not None and password != password_confirm:
        raise ValidationError(
            {"password_confirm": ["تأیید رمز عبور با رمز جدید یکسان نیست."]},
            code="password_mismatch",
        )

    try:
        validate_password(password, user=user)
    except Exception as exc:
        raise ValidationError(
            {"password": list(exc.messages) if hasattr(exc, "messages") else [str(exc)]}
        ) from exc

    user.set_password(password)
    user.is_active = True
    user.save()

    now = timezone.now()
    profile.account_activated_at = profile.account_activated_at or now
    profile.must_change_password = False
    profile.portal_enabled = True
    profile.save(
        update_fields=[
            "account_activated_at",
            "must_change_password",
            "portal_enabled",
            "updated_at",
        ]
    )

    blacklist_user_refresh_tokens(user)

    return {
        "setup_complete": True,
        "must_login_again": True,
        "must_change_password": False,
        "username": user.username,
        "message": SETUP_COMPLETE_RELOGIN_MESSAGE,
    }


def assert_student_portal_access(profile: StudentProfile) -> None:
    if (
        not profile.portal_enabled
        or not profile.is_account_activated
        or profile.must_change_password
    ):
        raise PermissionDenied(detail="دسترسی پنل شاگرد غیرفعال است.")
    if not profile.user.is_active:
        raise PermissionDenied(detail="دسترسی پنل شاگرد غیرفعال است.")


@transaction.atomic
def activate_student_login(
    coach,
    student: Student,
    *,
    rotate_password: bool = False,
    initial_password: str | None = None,
    username: str | None = None,
) -> dict:
    """Coach sets initial/reset password (compat wrapper)."""
    if not initial_password:
        raise ValidationError(
            {"initial_password": ["رمز اولیه الزامی است."]},
            code="initial_password_required",
        )
    del rotate_password
    profile = StudentProfile.objects.filter(student=student).select_related("user").first()
    if profile is not None and not profile.user.username.startswith("pending_"):
        if username:
            set_portal_username(coach, student, username=username)
        result = reset_portal_password(coach, student, initial_password=initial_password)
    else:
        if not username:
            raise ValidationError(
                {"username": ["نام کاربری شاگرد الزامی است."]},
                code="username_required",
            )
        result = set_portal_initial_password(
            coach, student, username=username, initial_password=initial_password
        )
    return {
        "username": result.get("username"),
        "temporary_password": result["initial_password"],
        "initial_password": result["initial_password"],
        "student_id": result["student_id"],
        "portal_access": result["portal_access"],
        "purpose": result["purpose"],
        "must_change_password": True,
    }


ACTIVATION_GENERIC_ERROR = SETUP_GENERIC_ERROR
activate_student_account = activate_student_login
