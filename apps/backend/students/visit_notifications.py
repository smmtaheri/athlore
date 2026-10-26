"""Visit acknowledgement shares the real/mock transport used by all other SMS."""

import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common.phone import normalize_mobile
from common.sms import SmsDeliveryUnavailable, send_template_sms
from students.models import Student, StudentProfile, Visit, VisitFinalizedSms

logger = logging.getLogger(__name__)


def schedule_visit_finalized_sms(visit):
    if not settings.VISIT_FINALIZED_SMS_ENABLED:
        logger.info(
            "Visit SMS state=not_scheduled reason=feature_disabled visit_id=%s student_id=%s",
            visit.pk,
            visit.student_id,
        )
        return
    delivery, created = VisitFinalizedSms.objects.get_or_create(visit=visit)
    if created:
        logger.info(
            "Visit SMS state=scheduled visit_id=%s student_id=%s",
            visit.pk,
            visit.student_id,
        )
        transaction.on_commit(lambda: deliver_visit_finalized_sms(delivery.pk), robust=True)
    else:
        logger.info(
            "Visit SMS state=not_scheduled reason=delivery_already_exists visit_id=%s "
            "student_id=%s delivery_state=%s",
            visit.pk,
            visit.student_id,
            delivery.status,
        )


def deliver_visit_finalized_sms(visit_id):
    claimed = VisitFinalizedSms.objects.filter(
        visit_id=visit_id, status=VisitFinalizedSms.Status.PENDING
    ).update(status=VisitFinalizedSms.Status.SENDING, attempted_at=timezone.now())
    if not claimed:
        logger.info(
            "Visit SMS state=not_attempted reason=delivery_not_pending visit_id=%s",
            visit_id,
        )
        return
    try:
        visit = Visit.objects.select_related("student").get(pk=visit_id)
        student = visit.student
        profile = StudentProfile.objects.select_related("user").filter(student=student).first()
        skip_reason = None
        if not settings.VISIT_FINALIZED_SMS_ENABLED:
            skip_reason = "feature_disabled"
        elif visit.status != Visit.Status.FINALIZED:
            skip_reason = "visit_not_finalized"
        elif visit.coach_id != student.coach_id:
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
            VisitFinalizedSms.objects.filter(pk=visit_id).update(
                status=VisitFinalizedSms.Status.SKIPPED, error_code=skip_reason
            )
            logger.warning(
                "Visit SMS state=skipped reason=%s visit_id=%s student_id=%s",
                skip_reason,
                visit.pk,
                student.pk,
            )
            return
        first_name = next(iter(student.full_name.split()), "")
        first_name = first_name if 0 < len(first_name) <= 20 else "ورزشکار"
        message_id = send_template_sms(
            phone=normalize_mobile(student.phone_number, required=True),
            template=settings.NAJVA_VISIT_FINALIZED_TEMPLATE,
            tokens={"token20": first_name},
            event="visit_finalized",
            reference_id=str(visit.pk),
        )
        VisitFinalizedSms.objects.filter(pk=visit_id).update(
            status=VisitFinalizedSms.Status.SENT,
            provider_message_id=message_id,
            sent_at=timezone.now(),
            error_code="",
        )
        logger.info(
            "Visit SMS state=sent visit_id=%s student_id=%s provider_message_id=%s",
            visit.pk,
            student.pk,
            message_id,
        )
    except Exception as exc:
        code = (
            exc.default_code if isinstance(exc, SmsDeliveryUnavailable) else "notification_failed"
        )
        VisitFinalizedSms.objects.filter(pk=visit_id).update(
            status=VisitFinalizedSms.Status.FAILED, error_code=code
        )
        # Provider exception text can contain credentials or recipient details.
        logger.warning(
            "Visit SMS state=failed visit_id=%s error_code=%s exception_type=%s",
            visit_id,
            code,
            type(exc).__name__,
        )
