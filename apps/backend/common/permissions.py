from __future__ import annotations

from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import BasePermission


class IsAuthenticatedCoach(BasePermission):
    """Requires an authenticated user with an attached CoachProfile."""

    message = "Authentication credentials were not provided."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not user.is_active:
            return False
        return hasattr(user, "coach_profile")


def get_request_coach(request):
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated or not user.is_active:
        raise PermissionDenied(detail="Authentication credentials were not provided.")
    coach = getattr(user, "coach_profile", None)
    if coach is None:
        raise PermissionDenied(detail="Coach profile is required.")
    return coach


class IsAuthenticatedStudent(BasePermission):
    """Requires an authenticated student with full portal access (setup complete)."""

    message = "Authentication credentials were not provided."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not user.is_active:
            return False
        profile = getattr(user, "student_profile", None)
        if profile is None:
            return False
        return bool(
            profile.portal_enabled
            and profile.account_activated_at
            and not profile.must_change_password
        )


class IsAuthenticatedStudentSetup(BasePermission):
    """Allows students who must change the coach-issued initial password."""

    message = "Authentication credentials were not provided."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not user.is_active:
            return False
        profile = getattr(user, "student_profile", None)
        if profile is None:
            return False
        return bool(profile.portal_enabled and profile.must_change_password)


def get_request_student(request):
    """Resolve the Student record for an authenticated student user, or raise."""
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated or not user.is_active:
        raise PermissionDenied(detail="Authentication credentials were not provided.")
    student_profile = getattr(user, "student_profile", None)
    if student_profile is None:
        raise PermissionDenied(detail="Student profile is required.")
    if (
        not student_profile.portal_enabled
        or not student_profile.account_activated_at
        or student_profile.must_change_password
    ):
        raise PermissionDenied(detail="دسترسی پنل شاگرد غیرفعال است.")
    return student_profile.student


def assert_student_writable_access(student):
    """Student may keep reading history, but writes require a live coach and cycle."""
    if student.status != student.Status.ACTIVE or student.archived_at is not None:
        raise PermissionDenied(detail="دسترسی شما فقط خواندنی است؛ شاگرد فعال نیست.")
    coach_user = getattr(getattr(student, "coach", None), "user", None)
    if coach_user is None or not coach_user.is_active:
        raise PermissionDenied(detail="دسترسی شما فقط خواندنی است؛ مربی فعال ندارید.")
    from students.body_check_services import active_cycle_for_student

    if active_cycle_for_student(student) is None:
        raise PermissionDenied(detail="دسترسی شما فقط خواندنی است؛ دوره فعالی ندارید.")


def get_owned_object(queryset, *, coach, pk, not_found_message: str = "Not found."):
    """Fetch an object owned by coach or raise NotFound (no cross-tenant leakage)."""
    try:
        return queryset.filter(coach_id=coach.id).get(pk=pk)
    except queryset.model.DoesNotExist as exc:
        raise NotFound(detail=not_found_message) from exc
