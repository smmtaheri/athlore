from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import CoachProfile, CoachRuleSet
from common.exceptions import ConflictError
from common.phone import InvalidPhoneError, normalize_iran_mobile

User = get_user_model()


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _tokens_for_user(user) -> dict[str, str]:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def serialize_user(user) -> dict:
    return {
        "id": str(user.pk),
        "email": user.email,
        "full_name": user.first_name or user.get_full_name() or user.username,
        "created_at": user.date_joined.isoformat().replace("+00:00", "Z"),
    }


def serialize_coach(coach: CoachProfile) -> dict:
    return {
        "id": str(coach.id),
        "display_name": coach.display_name,
        "phone_number": coach.phone_number,
        "style_notes": coach.style_notes,
        "control_mode": coach.control_mode,
        "default_session_minutes": coach.default_session_minutes,
    }


def serialize_student_for_session(student) -> dict:
    return {
        "id": str(student.id),
        "full_name": student.full_name,
        "phone_number": student.phone_number,
        "coach_id": str(student.coach_id),
    }


def session_payload(
    user,
    coach: CoachProfile | None = None,
    student=None,
    *,
    must_change_password: bool | None = None,
) -> dict:
    role = "coach" if coach is not None else "student" if student is not None else None
    payload = {
        "user": serialize_user(user),
        "role": role,
        "tokens": _tokens_for_user(user),
    }
    if coach is not None:
        payload["coach"] = serialize_coach(coach)
    if student is not None:
        payload["student"] = serialize_student_for_session(student)
        profile = getattr(user, "student_profile", None)
        change_required = (
            must_change_password
            if must_change_password is not None
            else bool(profile and profile.must_change_password)
        )
        payload["must_change_password"] = change_required
        payload["setup_required"] = change_required
    return payload


def ensure_registration_enabled() -> None:
    if not getattr(settings, "PUBLIC_REGISTRATION_ENABLED", False):
        raise PermissionDenied(
            detail="ثبت‌نام عمومی غیرفعال است. برای ساخت حساب با مدیر سامانه تماس بگیرید.",
            code="registration_disabled",
        )


@transaction.atomic
def register_coach(
    *,
    email: str,
    password: str,
    full_name: str,
    phone_number: str | None = None,
) -> dict:
    ensure_registration_enabled()
    email_norm = normalize_email(email)
    full_name = (full_name or "").strip()
    if not email_norm:
        raise ValueError("email is required")
    if not full_name:
        raise ValueError("full_name is required")

    try:
        phone_canon = normalize_iran_mobile(phone_number, required=True)
    except InvalidPhoneError as exc:
        raise ValueError(str(exc)) from exc

    if User.objects.filter(Q(email__iexact=email_norm) | Q(username__iexact=email_norm)).exists():
        raise ConflictError(detail="A user with this email already exists.")

    if CoachProfile.objects.filter(phone_number=phone_canon).exists():
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک مربی ثبت شده است.",
            code="coach_phone_already_exists",
        )

    validate_password(password)

    # Deviation: keep Django default User (integer PK) for migration safety.
    # username stores normalized email for auth compatibility.
    user = User(
        username=email_norm,
        email=email_norm,
        first_name=full_name[:150],
        is_active=True,
    )
    user.set_password(password)
    user.save()

    try:
        coach = CoachProfile.objects.create(
            user=user,
            display_name=full_name[:120],
            phone_number=phone_canon,
        )
    except IntegrityError as exc:
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک مربی ثبت شده است.",
            code="coach_phone_already_exists",
        ) from exc
    CoachRuleSet.objects.create(coach=coach)
    return session_payload(user, coach)


def create_coach_account(
    *,
    email: str,
    password: str,
    full_name: str,
    phone_number: str,
    is_active: bool = True,
) -> tuple:
    """Admin/management-path coach creation (ignores PUBLIC_REGISTRATION_ENABLED)."""
    email_norm = normalize_email(email)
    full_name = (full_name or "").strip()
    phone_canon = normalize_iran_mobile(phone_number, required=True)

    if User.objects.filter(Q(email__iexact=email_norm) | Q(username__iexact=email_norm)).exists():
        raise ConflictError(detail="A user with this email already exists.")
    if CoachProfile.objects.filter(phone_number=phone_canon).exists():
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک مربی ثبت شده است.",
            code="coach_phone_already_exists",
        )

    validate_password(password)

    with transaction.atomic():
        user = User(
            username=email_norm,
            email=email_norm,
            first_name=full_name[:150],
            is_active=is_active,
        )
        user.set_password(password)
        user.save()
        try:
            coach = CoachProfile.objects.create(
                user=user,
                display_name=full_name[:120],
                phone_number=phone_canon,
            )
        except IntegrityError as exc:
            raise ConflictError(
                detail="این شماره موبایل قبلاً برای یک مربی ثبت شده است.",
                code="coach_phone_already_exists",
            ) from exc
        CoachRuleSet.objects.create(coach=coach)
    return user, coach


def set_coach_phone(coach: CoachProfile, phone_number: str) -> CoachProfile:
    phone_canon = normalize_iran_mobile(phone_number, required=True)
    if CoachProfile.objects.filter(phone_number=phone_canon).exclude(pk=coach.pk).exists():
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک مربی ثبت شده است.",
            code="coach_phone_already_exists",
        )
    coach.phone_number = phone_canon
    try:
        coach.save(update_fields=["phone_number", "updated_at"])
    except IntegrityError as exc:
        raise ConflictError(
            detail="این شماره موبایل قبلاً برای یک مربی ثبت شده است.",
            code="coach_phone_already_exists",
        ) from exc
    return coach


def _resolve_login_user(*, email: str | None, username: str | None, password: str):
    """Authenticate by email (coach-style) or username (student-style)."""
    identifier = normalize_email(email) if email else (username or "").strip()
    if not identifier:
        raise PermissionError("Invalid credentials.")

    user = authenticate(username=identifier, password=password)
    if user is None:
        lookup = Q(email__iexact=identifier) if email else Q(username__iexact=identifier)
        candidate = User.objects.filter(lookup).first()
        if candidate is None or not candidate.check_password(password):
            raise PermissionError("Invalid credentials.")
        user = candidate

    if not user.is_active:
        raise PermissionError("Invalid credentials.")
    return user


def login_user(*, email: str | None = None, username: str | None = None, password: str) -> dict:
    """Authenticate a coach (via email) or a student (via username) and issue tokens."""
    user = _resolve_login_user(email=email, username=username, password=password)

    coach = getattr(user, "coach_profile", None)
    if coach is not None:
        return session_payload(user, coach=coach)

    student_profile = getattr(user, "student_profile", None)
    if student_profile is not None:
        if not student_profile.portal_enabled:
            raise PermissionError("Invalid credentials.")
        if student_profile.must_change_password or not student_profile.account_activated_at:
            # Force phone + initial-password step on the student login page.
            raise PermissionError("Invalid credentials.")
        return session_payload(user, student=student_profile.student, must_change_password=False)

    raise PermissionError("Invalid credentials.")


def login_coach(*, email: str, password: str) -> dict:
    """Back-compat alias; coach-only login by email."""
    return login_user(email=email, password=password)


def logout_refresh_token(refresh_token: str) -> None:
    token = RefreshToken(refresh_token)
    token.blacklist()


def blacklist_user_refresh_tokens(user) -> None:
    """Invalidate outstanding refresh tokens after a forced password change."""
    try:
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
            OutstandingToken,
        )
    except Exception:
        return
    for outstanding in OutstandingToken.objects.filter(user_id=user.pk):
        BlacklistedToken.objects.get_or_create(token=outstanding)


def update_coach_profile(coach: CoachProfile, **fields) -> CoachProfile:
    allowed = {
        "display_name",
        "style_notes",
        "control_mode",
        "default_session_minutes",
        "phone_number",
    }
    for key, value in fields.items():
        if key not in allowed:
            continue
        if key == "control_mode" and value not in CoachProfile.ControlMode.values:
            raise ValueError("invalid control_mode")
        if key == "default_session_minutes":
            value = int(value)
            if value < 15 or value > 240:
                raise ValueError("default_session_minutes out of range")
        if key == "phone_number":
            set_coach_phone(coach, value)
            continue
        setattr(coach, key, value)
    coach.save()
    return coach
