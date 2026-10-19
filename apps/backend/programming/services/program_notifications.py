"""Post-commit program-ready SMS; no duplicate sends or program rollback on failure."""

import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common.phone import normalize_iran_mobile
from common.sms import SmsDeliveryUnavailable, send_template_sms
from programming.models import ProgramReadySms, ProgramVersion
from students.models import Student, StudentProfile

logger = logging.getLogger(__name__)


def schedule_program_ready_sms(version: ProgramVersion) -> None:
    if not settings.PROGRAM_READY_SMS_ENABLED:
        return
    delivery, created = ProgramReadySms.objects.get_or_create(version=version)
    if created:
        transaction.on_commit(lambda: deliver_program_ready_sms(delivery.pk), robust=True)


def _first_name(full_name: str) -> str:
    parts = full_name.split()
    name = parts[0] if parts else ""
    # The approved template requires token20, even when a legacy name is unusable.
    return name if 0 < len(name) <= 20 else "ورزشکار"


def deliver_program_ready_sms(version_id) -> None:
    claimed = ProgramReadySms.objects.filter(
        version_id=version_id, status=ProgramReadySms.Status.PENDING
    ).update(status=ProgramReadySms.Status.SENDING, attempted_at=timezone.now())
    if not claimed:
        return
    try:
        version = ProgramVersion.objects.select_related("program__student").get(pk=version_id)
        program = version.program
        student = program.student
        if (
            not settings.PROGRAM_READY_SMS_ENABLED
            or version.status != ProgramVersion.Status.FINALIZED
            or program.archived_at
            or program.coach_id != student.coach_id
            or student.archived_at
            or student.status != Student.Status.ACTIVE
            or not StudentProfile.objects.filter(
                student=student, portal_enabled=True, user__is_active=True
            ).exists()
        ):
            ProgramReadySms.objects.filter(pk=version_id).update(
                status=ProgramReadySms.Status.SKIPPED, error_code="not_visible_in_portal"
            )
            return
        phone = normalize_iran_mobile(student.phone_number, required=True)
        message_id = send_template_sms(
            phone=phone,
            template=settings.NAJVA_PROGRAM_READY_TEMPLATE,
            tokens={"token20": _first_name(student.full_name)},
        )
        ProgramReadySms.objects.filter(pk=version_id).update(
            status=ProgramReadySms.Status.SENT,
            provider_message_id=message_id,
            sent_at=timezone.now(),
            error_code="",
        )
    except Exception as exc:
        # Provider exceptions can contain keys, names and phone numbers: log types only.
        code = (
            exc.default_code if isinstance(exc, SmsDeliveryUnavailable) else "notification_failed"
        )
        ProgramReadySms.objects.filter(pk=version_id).update(
            status=ProgramReadySms.Status.FAILED, error_code=code
        )
        logger.warning(
            "Program-ready SMS failed for version %s (%s)", version_id, type(exc).__name__
        )
