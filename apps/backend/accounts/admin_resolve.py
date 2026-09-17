"""Helpers for resolving coaches/students in management commands."""

from __future__ import annotations

from django.core.management.base import CommandError

from accounts.models import CoachProfile
from accounts.services import normalize_email
from common.phone import InvalidPhoneError, normalize_iran_mobile
from students.models import Student


def resolve_coach(*, coach_id=None, coach_email=None, coach_phone=None) -> CoachProfile:
    qs = CoachProfile.objects.select_related("user")
    matches = []
    if coach_id:
        matches = list(qs.filter(pk=coach_id))
        if not matches:
            raise CommandError(f"Coach not found for id={coach_id}")
    elif coach_email:
        email = normalize_email(coach_email)
        matches = list(
            qs.filter(user__email__iexact=email) | qs.filter(user__username__iexact=email)
        )
        if not matches:
            raise CommandError(f"Coach not found for email={email}")
    elif coach_phone:
        try:
            phone = normalize_iran_mobile(coach_phone, required=True)
        except InvalidPhoneError as exc:
            raise CommandError(str(exc)) from exc
        matches = list(qs.filter(phone_number=phone))
        if not matches:
            raise CommandError(f"Coach not found for phone={phone}")
    else:
        raise CommandError("Provide --coach-id, --coach-email, or --coach-phone")
    if len(matches) > 1:
        raise CommandError("Ambiguous coach match; refine the identifier")
    return matches[0]


def resolve_student(*, student_id=None, phone=None) -> Student:
    if student_id:
        try:
            return Student.objects.select_related("coach", "coach__user").get(pk=student_id)
        except Student.DoesNotExist as exc:
            raise CommandError(f"Student not found for id={student_id}") from exc
    if phone:
        try:
            canon = normalize_iran_mobile(phone, required=True)
        except InvalidPhoneError as exc:
            raise CommandError(str(exc)) from exc
        try:
            return Student.objects.select_related("coach", "coach__user").get(phone_number=canon)
        except Student.DoesNotExist as exc:
            raise CommandError(f"Student not found for phone={canon}") from exc
        except Student.MultipleObjectsReturned as exc:
            raise CommandError("Ambiguous student phone match") from exc
    raise CommandError("Provide --student-id or --phone")
