"""Post-commit program-ready SMS; no duplicate sends or program rollback on failure."""

import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common.phone import normalize_mobile
from common.sms import SmsDeliveryUnavailable, send_template_sms
from programming.models import ProgramReadySms, ProgramVersion
from students.models import Student, StudentProfile

logger = logging.getLogger(__name__)


def schedule_program_ready_sms(version: ProgramVersion) -> None:
    if not settings.PROGRAM_READY_SMS_ENABLED:
        logger.info(
            "Program SMS state=not_scheduled reason=feature_disabled program_id=%s "
            "version_id=%s student_id=%s",
            version.program_id,
            version.pk,
            version.program.student_id,
        )
        return
    delivery, created = ProgramReadySms.objects.get_or_create(version=version)
    if created:
        logger.info(
            "Program SMS state=scheduled program_id=%s version_id=%s student_id=%s",
            version.program_id,
            version.pk,
            version.program.student_id,
        )
        transaction.on_commit(lambda: deliver_program_ready_sms(delivery.pk), robust=True)
    else:
        logger.info(
            "Program SMS state=not_scheduled reason=delivery_already_exists program_id=%s "
            "version_id=%s student_id=%s delivery_state=%s",
            version.program_id,
            version.pk,
            version.program.student_id,
            delivery.status,
        )


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
        logger.info(
            "Program SMS state=not_attempted reason=delivery_not_pending version_id=%s",
            version_id,
        )
        return
    try:
        version = ProgramVersion.objects.select_related("program__student").get(pk=version_id)
        program = version.program
        student = program.student
        profile = StudentProfile.objects.select_related("user").filter(student=student).first()
        skip_reason = None
        if not settings.PROGRAM_READY_SMS_ENABLED:
            skip_reason = "feature_disabled"
        elif version.status != ProgramVersion.Status.FINALIZED:
            skip_reason = "version_not_finalized"
        elif program.active_version_id != version.id:
            skip_reason = "version_not_active"
        elif program.archived_at:
            skip_reason = "program_archived"
        elif program.coach_id != student.coach_id:
            skip_reason = "coach_mismatch"
        elif student.archived_at:
            skip_reason = "student_archived"
        elif student.status != Student.Status.ACTIVE:
            skip_reason = "student_inactive"
        elif profile is None:
            skip_reason = "student_profile_missing"
        elif not profile.portal_enabled:
            skip_reason = "student_portal_disabled"
        elif not profile.user.is_active:
            skip_reason = "student_user_inactive"

        if skip_reason:
            ProgramReadySms.objects.filter(pk=version_id).update(
                status=ProgramReadySms.Status.SKIPPED, error_code=skip_reason
            )
            logger.warning(
                "Program SMS state=skipped reason=%s program_id=%s version_id=%s student_id=%s",
                skip_reason,
                program.pk,
                version.pk,
                student.pk,
            )
            return
        phone = normalize_mobile(student.phone_number, required=True)
        message_id = send_template_sms(
            phone=phone,
            template=settings.NAJVA_PROGRAM_READY_TEMPLATE,
            tokens={"token20": _first_name(student.full_name)},
            event="program_ready",
            reference_id=str(version.pk),
        )
        ProgramReadySms.objects.filter(pk=version_id).update(
            status=ProgramReadySms.Status.SENT,
            provider_message_id=message_id,
            sent_at=timezone.now(),
            error_code="",
        )
        logger.info(
            "Program SMS state=sent program_id=%s version_id=%s student_id=%s "
            "provider_message_id=%s",
            program.pk,
            version.pk,
            student.pk,
            message_id,
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
            "Program SMS state=failed version_id=%s error_code=%s exception_type=%s",
            version_id,
            code,
            type(exc).__name__,
        )
