from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError

from accounts.models import CoachProfile
from common.sms import MOCK_MESSAGE_ID_BASE, SmsDeliveryUnavailable
from students.models import Student, StudentProfile, Visit, VisitFinalizedSms
from students.visit_form_services import finalize_visit
from students.visit_notifications import deliver_visit_finalized_sms, schedule_visit_finalized_sms


@override_settings(
    SMS_BACKEND="mock",
    VISIT_FINALIZED_SMS_ENABLED=True,
    NAJVA_VISIT_FINALIZED_TEMPLATE="athlore_visit_finalized",
)
class VisitNotificationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        coach = CoachProfile.objects.create(user=User.objects.create_user(username="visit-coach"))
        self.student = Student.objects.create(
            coach=coach,
            full_name="محمد تست",
            phone_number="+989121234567",
            age=28,
            gender="male",
            height_cm=180,
            weight_kg=80,
        )
        self.profile = StudentProfile.objects.create(
            student=self.student,
            user=User.objects.create_user(username="visit-student"),
            portal_enabled=True,
        )
        self.visit = Visit.objects.create(
            coach=coach,
            student=self.student,
            visit_date=date(2026, 10, 24),
            current_weight_kg=80,
            previous_weight_kg=80,
        )

    @patch("common.sms.http.client.HTTPSConnection")
    def test_finalization_sends_once_after_commit_through_mock(self, connection):
        with self.captureOnCommitCallbacks(execute=True):
            finalize_visit(self.visit)
            self.assertEqual(VisitFinalizedSms.objects.get().status, "pending")
            connection.assert_not_called()
        row = VisitFinalizedSms.objects.get()
        self.assertEqual(row.status, "sent")
        self.assertGreaterEqual(row.provider_message_id, MOCK_MESSAGE_ID_BASE)
        with self.captureOnCommitCallbacks(execute=True):
            schedule_visit_finalized_sms(self.visit)
        deliver_visit_finalized_sms(self.visit.pk)
        self.assertEqual(VisitFinalizedSms.objects.count(), 1)
        with self.assertRaises(ValidationError):
            finalize_visit(self.visit)
        connection.assert_not_called()

    @patch("students.visit_notifications.send_template_sms", return_value=123)
    def test_template_and_first_name_token(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            finalize_visit(self.visit)
        send.assert_called_once_with(
            phone="+989121234567", template="athlore_visit_finalized", tokens={"token20": "محمد"}
        )

    def test_draft_creation_does_not_schedule(self):
        self.assertFalse(VisitFinalizedSms.objects.exists())

    @override_settings(VISIT_FINALIZED_SMS_ENABLED=False)
    def test_disabled_notification_does_not_change_finalization(self):
        finalize_visit(self.visit)
        self.assertEqual(self.visit.status, "finalized")
        self.assertFalse(VisitFinalizedSms.objects.exists())

    @patch("students.visit_notifications.send_template_sms")
    def test_rollback_never_sends(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            with self.assertRaises(ValueError):
                with transaction.atomic():
                    finalize_visit(self.visit)
                    raise ValueError("rollback")
        self.visit.refresh_from_db()
        self.assertEqual(self.visit.status, "draft")
        self.assertFalse(VisitFinalizedSms.objects.exists())
        send.assert_not_called()

    @patch("students.visit_notifications.send_template_sms", side_effect=SmsDeliveryUnavailable())
    def test_provider_failure_does_not_undo_visit_or_retry_automatically(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            finalize_visit(self.visit)
        self.visit.refresh_from_db()
        self.assertEqual(self.visit.status, "finalized")
        row = VisitFinalizedSms.objects.get()
        self.assertEqual(row.status, "failed")
        self.assertEqual(row.error_code, "sms_delivery_unavailable")
        deliver_visit_finalized_sms(self.visit.pk)
        send.assert_called_once()

    @patch("students.visit_notifications.send_template_sms")
    def test_portal_disabled_skips_delivery(self, send):
        self.profile.portal_enabled = False
        self.profile.save(update_fields=["portal_enabled"])
        with self.captureOnCommitCallbacks(execute=True):
            finalize_visit(self.visit)
        self.assertEqual(VisitFinalizedSms.objects.get().status, "skipped")
        send.assert_not_called()
