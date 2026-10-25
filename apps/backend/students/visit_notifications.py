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
        return
    delivery, created = VisitFinalizedSms.objects.get_or_create(visit=visit)
    if created:
        transaction.on_commit(lambda: deliver_visit_finalized_sms(delivery.pk), robust=True)


def deliver_visit_finalized_sms(visit_id):
    claimed = VisitFinalizedSms.objects.filter(
        visit_id=visit_id, status=VisitFinalizedSms.Status.PENDING
    ).update(status=VisitFinalizedSms.Status.SENDING, attempted_at=timezone.now())
    if not claimed:
        return
    try:
        visit = Visit.objects.select_related("student").get(pk=visit_id)
        student = visit.student
        if (
            not settings.VISIT_FINALIZED_SMS_ENABLED
            or visit.status != Visit.Status.FINALIZED
            or visit.coach_id != student.coach_id
            or student.archived_at
            or student.status != Student.Status.ACTIVE
            or not StudentProfile.objects.filter(
                student=student, portal_enabled=True, user__is_active=True
            ).exists()
        ):
            VisitFinalizedSms.objects.filter(pk=visit_id).update(
                status=VisitFinalizedSms.Status.SKIPPED, error_code="not_visible_in_portal"
            )
            return
        first_name = next(iter(student.full_name.split()), "")
        first_name = first_name if 0 < len(first_name) <= 20 else "ورزشکار"
        message_id = send_template_sms(
            phone=normalize_mobile(student.phone_number, required=True),
            template=settings.NAJVA_VISIT_FINALIZED_TEMPLATE,
            tokens={"token20": first_name},
        )
        VisitFinalizedSms.objects.filter(pk=visit_id).update(
            status=VisitFinalizedSms.Status.SENT,
            provider_message_id=message_id,
            sent_at=timezone.now(),
            error_code="",
        )
    except Exception as exc:
        code = (
            exc.default_code if isinstance(exc, SmsDeliveryUnavailable) else "notification_failed"
        )
        VisitFinalizedSms.objects.filter(pk=visit_id).update(
            status=VisitFinalizedSms.Status.FAILED, error_code=code
        )
        # Provider exception text can contain credentials or recipient details.
        logger.warning("Visit SMS failed for visit %s (%s)", visit_id, type(exc).__name__)
