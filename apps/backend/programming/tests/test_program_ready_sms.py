"""Program publication notifications with mocked Najva, never paid SMS."""

import json
import shutil
import tempfile
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from accounts.models import CoachProfile
from programming.models import Program, ProgramReadySms, ProgramVersion
from programming.services.program_notifications import deliver_program_ready_sms
from programming.services.programs import finalize_version, programs_for_student
from students.models import Student, StudentProfile


@override_settings(
    PROGRAM_READY_SMS_ENABLED=True,
    NAJVA_API_KEY="fake-program-key",
    NAJVA_SENDER="100005676",
    NAJVA_PROGRAM_READY_TEMPLATE="athlore_program_ready",
)
class ProgramReadySmsTests(APITestCase):
    def setUp(self):
        self.media_dir = tempfile.mkdtemp(prefix="athlore-program-sms-")
        self.addCleanup(shutil.rmtree, self.media_dir)
        media = override_settings(MEDIA_ROOT=self.media_dir)
        media.enable()
        self.addCleanup(media.disable)
        self.user = get_user_model().objects.create_user(username="sms-coach")
        self.coach = CoachProfile.objects.create(user=self.user, display_name="Coach")
        self.student = Student.objects.create(
            coach=self.coach,
            full_name="محمد طاهری",
            phone_number="+989121111111",
            age=27,
            gender="male",
            height_cm=178,
            weight_kg=82,
        )
        self.student_user = get_user_model().objects.create_user(username="sms-athlete")
        self.profile = StudentProfile.objects.create(
            student=self.student,
            user=self.student_user,
            portal_enabled=True,
            must_change_password=False,
            account_activated_at=timezone.now(),
        )
        self.program = Program.objects.create(
            coach=self.coach, student=self.student, title="Program", program_type="complete"
        )
        self.version = ProgramVersion.objects.create(
            coach=self.coach,
            program=self.program,
            version_number=1,
            training={"days": []},
            nutrition={"meals": []},
            supplements={"items": []},
        )
        self.client.force_authenticate(self.user)
        self.athlete = APIClient()
        self.athlete.force_authenticate(self.student_user)
        transport = patch("common.sms.http.client.HTTPSConnection")
        self.transport = transport.start()
        self.addCleanup(transport.stop)
        response = self.transport.return_value.getresponse.return_value
        response.status = 200
        response.read.return_value = json.dumps(
            {"return": {"status": 200}, "entries": [{"messageid": 42, "status": 1}]}
        ).encode()

    def finalize(self, version=None):
        version = version or self.version
        return self.client.post(
            f"/api/v1/programs/{version.program_id}/versions/{version.pk}/finalize/",
            {},
            format="json",
        )

    def test_send_is_after_commit_personalized_and_once_for_all_sections(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.finalize()
            self.assertEqual(response.status_code, 200, response.data)
            self.transport.assert_not_called()
            self.assertEqual(ProgramReadySms.objects.get().status, "pending")
        delivery = ProgramReadySms.objects.get()
        self.assertEqual(delivery.status, "sent")
        self.assertEqual(delivery.provider_message_id, 42)
        self.assertIsNotNone(delivery.sent_at)
        args, _ = self.transport.return_value.request.call_args
        self.assertEqual(
            parse_qs(urlsplit(args[1]).query),
            {
                "sender": ["100005676"],
                "receptor": ["09121111111"],
                "template": ["athlore_program_ready"],
                "token20": ["محمد"],
            },
        )
        self.assertEqual(
            self.athlete.get(f"/api/v1/me/programs/{self.program.pk}/").status_code, 200
        )
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.finalize().status_code, 200)
        deliver_program_ready_sms(self.version.pk)
        self.assertEqual(self.transport.call_count, 1)

    def test_draft_edit_does_not_send_or_schedule(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f"/api/v1/programs/{self.program.pk}/versions/{self.version.pk}/",
                {"nutrition": {"meals": []}},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(ProgramReadySms.objects.exists())
        self.transport.assert_not_called()

    def test_rolled_back_publication_never_sends_or_leaves_notification(self):
        with self.captureOnCommitCallbacks(execute=True):
            with self.assertRaises(RuntimeError), transaction.atomic():
                finalize_version(self.version, actor=self.user)
                raise RuntimeError("rollback")
        self.version.refresh_from_db()
        self.assertEqual(self.version.status, "draft")
        self.assertFalse(ProgramReadySms.objects.exists())
        self.transport.assert_not_called()

    def test_disabled_feature_preserves_existing_publication_without_sms(self):
        with override_settings(PROGRAM_READY_SMS_ENABLED=False):
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(self.finalize().status_code, 200)
        self.assertFalse(ProgramReadySms.objects.exists())
        self.transport.assert_not_called()

    def test_provider_failure_does_not_undo_program_and_is_not_retried_blindly(self):
        self.transport.return_value.request.side_effect = TimeoutError("fake-program-key")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.finalize()
        self.assertEqual(response.status_code, 200)
        self.version.refresh_from_db()
        self.assertEqual(self.version.status, "finalized")
        delivery = ProgramReadySms.objects.get()
        self.assertEqual(delivery.status, "failed")
        self.assertEqual(delivery.error_code, "sms_delivery_unavailable")
        self.assertNotIn("fake-program-key", str(response.data))
        self.assertTrue(programs_for_student(self.student).filter(pk=self.program.pk).exists())
        with self.captureOnCommitCallbacks(execute=True):
            self.finalize()
        deliver_program_ready_sms(self.version.pk)
        self.assertEqual(self.transport.call_count, 1)

    def test_unapproved_template_failure_is_recorded_without_breaking_publication(self):
        response = self.transport.return_value.getresponse.return_value
        response.status = 424
        response.read.return_value = b'{"return":{"status":424},"entries":[]}'
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.finalize().status_code, 200)
        self.assertEqual(ProgramReadySms.objects.get().status, "failed")

    def test_missing_configuration_does_not_block_publication(self):
        with override_settings(NAJVA_API_KEY=""):
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(self.finalize().status_code, 200)
        self.assertEqual(ProgramReadySms.objects.get().error_code, "sms_not_configured")
        self.transport.assert_not_called()

    def test_portal_disabled_does_not_receive_misleading_ready_message(self):
        self.profile.portal_enabled = False
        self.profile.save(update_fields=["portal_enabled"])
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.finalize().status_code, 200)
        self.assertEqual(ProgramReadySms.objects.get().status, "skipped")
        self.transport.assert_not_called()

    def test_program_archived_before_commit_is_skipped(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.finalize()
            Program.objects.filter(pk=self.program.pk).update(archived_at=timezone.now())
        self.assertEqual(ProgramReadySms.objects.get().status, "skipped")
        self.transport.assert_not_called()

    def test_unusable_first_name_has_a_short_template_safe_salutation(self):
        for name in ("", "م" * 21):
            with self.subTest(name=name):
                Student.objects.filter(pk=self.student.pk).update(full_name=name)
                version = ProgramVersion.objects.create(
                    program=self.program,
                    coach=self.coach,
                    version_number=self.program.versions.count() + 1,
                )
                with self.captureOnCommitCallbacks(execute=True):
                    self.assertEqual(self.finalize(version).status_code, 200)
                args, _ = self.transport.return_value.request.call_args
                self.assertEqual(parse_qs(urlsplit(args[1]).query)["token20"], ["ورزشکار"])

    def test_uploaded_three_pdfs_send_once_and_remain_downloadable(self):
        self._uploaded_delivery(("workout", "nutrition", "supplement"))

    def test_uploaded_nutrition_only_sends_once_without_requiring_other_sections(self):
        self._uploaded_delivery(("nutrition",))

    def _uploaded_delivery(self, sections):
        pdf = (
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
            b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
        )
        staged = {}
        for section in sections:
            response = self.client.post(
                "/api/v1/program-pdfs/staging/",
                {
                    "student_id": str(self.student.pk),
                    "section": section,
                    "file": SimpleUploadedFile(
                        f"{section}.pdf", pdf, content_type="application/pdf"
                    ),
                },
                format="multipart",
            )
            self.assertEqual(response.status_code, 201, response.data)
            staged[section] = response.data["id"]
        response = self.client.post(
            "/api/v1/programs/upload-pdf/",
            {
                "student_id": str(self.student.pk),
                "staged_pdf_id": staged[sections[0]],
                "title": "PDF notification QA",
                "program_type": "complete",
                "date_range_start": "2026-10-19",
                "date_range_end": "2026-11-15",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        program_id = response.data["id"]
        version_id = response.data["current_draft"]["id"]
        for section in sections[1:]:
            attached = self.client.post(
                f"/api/v1/programs/{program_id}/versions/{version_id}/staged-pdf/",
                {"staged_pdf_id": staged[section], "section": section},
                format="json",
            )
            self.assertEqual(attached.status_code, 200, attached.data)
        configured = self.client.patch(
            f"/api/v1/programs/{program_id}/versions/{version_id}/",
            {
                "pdf_settings": {
                    "deliverySections": {
                        section: "uploaded" if section in sections else "omitted"
                        for section in ("workout", "nutrition", "supplement")
                    }
                }
            },
            format="json",
        )
        self.assertEqual(configured.status_code, 200, configured.data)
        self.transport.assert_not_called()
        self.assertFalse(ProgramReadySms.objects.exists())
        version = ProgramVersion.objects.get(pk=version_id)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.finalize(version).status_code, 200)
        self.assertEqual(self.transport.call_count, 1)
        files = self.athlete.get(f"/api/v1/me/programs/{program_id}/pdf-files/")
        self.assertEqual(files.status_code, 200, files.data)
        self.assertEqual(len(files.data["results"]), len(sections))
        for artifact in files.data["results"]:
            download = self.athlete.get(f"/api/v1/me/pdf-files/{artifact['id']}/download/")
            self.assertEqual(download.status_code, 200)
            self.assertEqual(b"".join(download.streaming_content), pdf)
