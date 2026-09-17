from __future__ import annotations

import hashlib
import shutil
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CoachProfile
from accounts.rules_services import replace_coach_rules
from common.testing import auth_header, register
from delivery.models import PdfArtifact
from delivery.services import artifacts as artifact_services
from delivery.services import share as share_services
from delivery.services.render import RENDER_TEMPLATE_VERSION, build_pdf_context
from programming.models import Program, ProgramVersion
from students.models import Student

MIN_RULES = {
    "templates": [
        {
            "name": "T1",
            "goal": "قدرت",
            "main_goal": "قدرت",
            "level": "intermediate",
            "days_per_week": 3,
            "intensity": "m",
            "volume": "m",
            "rest_time": "60",
            "split": ["A", "B", "C"],
            "muscle_priority_order": ["سینه"],
            "special_rules": [],
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "levels": [],
    "injuries": [],
    "muscle_priorities": [],
    "exercise_bank": [
        {
            "group": "سینه",
            "favorite_exercises": ["پرس سینه هالتر", "Deadlift"],
            "beginner_friendly": [],
            "professional_friendly": [],
            "forbidden_exercises": [],
            "sort_order": 0,
        }
    ],
    "general_rules": {"extra_notes": "", "items": []},
}


class PdfTestMixin:
    media_dir: str

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_dir = tempfile.mkdtemp(prefix="ca-pdf-test-")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.media_dir, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self._media_override = override_settings(MEDIA_ROOT=self.media_dir)
        self._media_override.enable()
        self.addCleanup(self._media_override.disable)

        a = register(self.client, "pdf-a@example.com", full_name="آرمان مربی")
        b = register(self.client, "pdf-b@example.com", full_name="Coach B")
        self.tokens_a = a.data["tokens"]
        self.tokens_b = b.data["tokens"]
        self.ha = auth_header(self.tokens_a)
        self.hb = auth_header(self.tokens_b)
        self.coach_a = CoachProfile.objects.get(id=a.data["coach"]["id"])
        self.coach_b = CoachProfile.objects.get(id=b.data["coach"]["id"])
        replace_coach_rules(self.coach_a, MIN_RULES)
        self.student = Student.objects.create(
            coach=self.coach_a,
            full_name="محمد طاهری",
            age=27,
            gender=Student.Gender.MALE,
            height_cm=178,
            weight_kg=82,
            phone_number="+989123110099",
            goals={"primary_goal": "عضله‌سازی"},
            training_background={"level": "intermediate", "days_per_week": 4},
            injuries={"has_injury": False},
            coach_notes="یادداشت مربی",
        )
        self.program = Program.objects.create(
            coach=self.coach_a,
            student=self.student,
            title="برنامه ماهانه محمد",
            program_type=Program.ProgramType.COMPLETE,
            date_range_label="فروردین ۱۴۰۵",
        )
        self.draft = ProgramVersion.objects.create(
            program=self.program,
            coach=self.coach_a,
            version_number=1,
            status=ProgramVersion.Status.DRAFT,
            training={
                "summary": "خلاصه تمرین",
                "days": [
                    {
                        "order": 1,
                        "title": "روز سینه",
                        "focus_muscles": ["سینه"],
                        "exercises": [
                            {
                                "name": "پرس سینه هالتر",
                                "sets": "4",
                                "reps": "8-10",
                                "rest": "90",
                                "tempo": "2010",
                                "notes": "کنترل منفی",
                            },
                            {
                                "name": "Deadlift",
                                "sets": "3",
                                "reps": "5",
                                "rest": "120",
                                "notes": "",
                            },
                        ],
                    },
                    {
                        "order": 2,
                        "title": "روز پا",
                        "focus_muscles": ["پا"],
                        "exercises": [{"name": "اسکوات", "sets": "4", "reps": "8", "rest": "120"}],
                    },
                ],
            },
            nutrition={
                "enabled": True,
                "notes": "کالری متعادل",
                "meals": [
                    {
                        "title": "صبحانه",
                        "items": [{"description": "جو دوسر", "quantity": "60g"}],
                    }
                ],
            },
            supplements={
                "enabled": True,
                "notes": "",
                "items": [
                    {
                        "name": "کراتین",
                        "amount": "5g",
                        "timing": "بعد تمرین",
                        "instructions": "با آب",
                        "notes": "نه نسخه پزشکی",
                    }
                ],
            },
            pdf_settings={
                "fileTitle": "برنامه محمد طاهری",
                "includeTraining": True,
                "includeNutrition": True,
                "includeSupplements": True,
                "includeCoachName": True,
                "includeStudentName": True,
                "includeCoachNotes": True,
                "coachNotes": "با تمرکز روی فرم",
                "pageSize": "A4",
                "style": "modern",
                "contactInfo": "۰۹۱۲",
            },
        )
        self.final = ProgramVersion.objects.create(
            program=self.program,
            coach=self.coach_a,
            version_number=2,
            status=ProgramVersion.Status.FINALIZED,
            training=self.draft.training,
            nutrition=self.draft.nutrition,
            supplements=self.draft.supplements,
            pdf_settings=self.draft.pdf_settings,
            finalized_at=timezone.now(),
        )
        self.program.active_version = self.final
        self.program.save(update_fields=["active_version"])


@override_settings(MEDIA_ROOT="/tmp/should-be-overridden")
@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class PdfArtifactServiceTests(PdfTestMixin, APITestCase):
    def test_rejects_draft_version(self):
        with self.assertRaises(Exception) as ctx:
            artifact_services.create_and_render(
                self.coach_a, self.program, version_id=self.draft.id
            )
        self.assertIn("version_not_finalized", str(ctx.exception.default_code))

    def test_create_ready_with_checksum_and_file(self):
        artifact = artifact_services.create_and_render(
            self.coach_a, self.program, version_id=self.final.id
        )
        self.assertEqual(artifact.status, PdfArtifact.Status.READY)
        self.assertTrue(artifact.file.name)
        self.assertGreater(artifact.size_bytes, 100)
        self.assertEqual(len(artifact.checksum_sha256), 64)
        self.assertTrue(artifact.file.path)
        with open(artifact.file.path, "rb") as fh:
            data = fh.read()
        self.assertTrue(data.startswith(b"%PDF"))
        self.assertEqual(hashlib.sha256(data).hexdigest(), artifact.checksum_sha256)
        self.assertEqual(artifact.template_version, RENDER_TEMPLATE_VERSION)

    def test_regenerate_creates_new_artifact(self):
        first = artifact_services.create_and_render(
            self.coach_a, self.program, version_id=self.final.id
        )
        first_path = first.file.path
        second = artifact_services.regenerate_artifact(self.coach_a, first)
        self.assertNotEqual(first.id, second.id)
        self.assertEqual(second.regenerated_from_id, first.id)
        self.assertEqual(first.status, PdfArtifact.Status.READY)
        self.assertTrue(Path(first_path).exists())
        self.assertEqual(
            PdfArtifact.objects.filter(program=self.program, deleted_at__isnull=True).count(),
            2,
        )

    def test_delete_revokes_share_and_hides(self):
        artifact = artifact_services.create_and_render(
            self.coach_a, self.program, version_id=self.final.id
        )
        link, raw = share_services.create_share_link(self.coach_a, artifact)
        path = artifact.file.path
        artifact_services.delete_artifact(self.coach_a, artifact)
        artifact.refresh_from_db()
        link.refresh_from_db()
        self.assertIsNotNone(artifact.deleted_at)
        self.assertIsNotNone(link.revoked_at)
        self.assertFalse(Path(path).exists())
        with self.assertRaises(Exception):
            artifact_services.get_artifact_for_coach(self.coach_a, artifact.id)

    def test_html_escaped_in_context(self):
        self.final.training = {
            "days": [
                {
                    "title": "<script>alert(1)</script>",
                    "exercises": [{"name": "<b>Hack</b>"}],
                }
            ]
        }
        self.final.save(update_fields=["training"])
        ctx = build_pdf_context(
            artifact=None,
            program=self.program,
            version=self.final,
            student=self.student,
            coach=self.coach_a,
        )
        self.assertIn("&lt;script&gt;", ctx["days"][0]["title"])
        self.assertNotIn("<script>", ctx["days"][0]["title"])

    def test_disabled_sections_omitted(self):
        self.final.pdf_settings = {
            **self.final.pdf_settings,
            "includeNutrition": False,
            "includeSupplements": False,
        }
        self.final.save(update_fields=["pdf_settings"])
        ctx = build_pdf_context(
            artifact=None,
            program=self.program,
            version=self.final,
            student=self.student,
            coach=self.coach_a,
        )
        self.assertFalse(ctx["include_nutrition"])
        self.assertFalse(ctx["include_supplements"])
        self.assertTrue(ctx["include_training"])

    def test_pdf_settings_override_wins_over_version(self):
        ctx = build_pdf_context(
            artifact=None,
            program=self.program,
            version=self.final,
            student=self.student,
            coach=self.coach_a,
            pdf_settings_override={
                "includeTraining": True,
                "includeNutrition": False,
                "includeSupplements": False,
            },
        )
        self.assertTrue(ctx["include_training"])
        self.assertFalse(ctx["include_nutrition"])
        self.assertFalse(ctx["include_supplements"])

    def test_delivery_pair_creates_training_and_nutrition_pdfs(self):
        artifacts = artifact_services.create_and_render_delivery_pair(
            self.coach_a, self.program, version_id=self.final.id
        )
        self.assertEqual(len(artifacts), 2)
        training, nutrition = artifacts
        self.assertEqual(training.status, PdfArtifact.Status.READY)
        self.assertEqual(nutrition.status, PdfArtifact.Status.READY)
        self.assertEqual(training.program_type, Program.ProgramType.WORKOUT)
        self.assertEqual(nutrition.program_type, Program.ProgramType.NUTRITION)
        self.assertIn("تمرین", training.display_name)
        self.assertIn("تغذیه", nutrition.display_name)

        train_ctx = build_pdf_context(
            artifact=training,
            program=self.program,
            version=self.final,
            student=self.student,
            coach=self.coach_a,
            pdf_settings_override={
                "includeTraining": True,
                "includeNutrition": False,
                "includeSupplements": False,
            },
        )
        self.assertTrue(train_ctx["include_training"])
        self.assertFalse(train_ctx["include_nutrition"])
        self.assertFalse(train_ctx["include_supplements"])

    def test_render_uses_version_not_mutable_program_title_in_content(self):
        # Content comes from version snapshots; title in header uses program.title
        # but exercise names come from version.training.
        self.final.training = {
            "days": [{"title": "نسخه نهایی", "exercises": [{"name": "VERSION_EX"}]}]
        }
        self.final.save(update_fields=["training"])
        self.draft.training = {"days": [{"title": "پیش‌نویس", "exercises": [{"name": "DRAFT_EX"}]}]}
        self.draft.save(update_fields=["training"])
        ctx = build_pdf_context(
            artifact=None,
            program=self.program,
            version=self.final,
            student=self.student,
            coach=self.coach_a,
        )
        self.assertEqual(ctx["days"][0]["exercises"][0]["name"], "VERSION_EX")


@override_settings(MEDIA_ROOT="/tmp/should-be-overridden")
@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class PdfApiTests(PdfTestMixin, APITestCase):
    def test_create_from_finalized_and_download(self):
        res = self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {"program_version_id": str(self.final.id), "file_name": "mohammad-v2.pdf"},
            format="json",
            **self.ha,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["status"], "ready")
        pdf_id = res.data["id"]
        self.assertIsNone(res.data.get("token"))

        dl = self.client.get(f"/api/v1/pdf-files/{pdf_id}/download/", **self.ha)
        self.assertEqual(dl.status_code, status.HTTP_200_OK)
        self.assertEqual(dl["Content-Type"], "application/pdf")
        body = b"".join(dl.streaming_content)
        self.assertTrue(body.startswith(b"%PDF"))
        self.assertGreater(len(body), 100)

    def test_delivery_pair_api(self):
        res = self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {"program_version_id": str(self.final.id), "delivery_outputs": "pair"},
            format="json",
            **self.ha,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(len(res.data["artifacts"]), 2)
        types = {a["program_type"] for a in res.data["artifacts"]}
        self.assertEqual(types, {"workout", "nutrition"})
        listed = self.client.get(f"/api/v1/students/{self.student.id}/pdf-files/", **self.ha)
        self.assertEqual(listed.data["count"], 2)

    def test_reject_draft(self):
        res = self.client.post(
            f"/api/v1/programs/{self.program.id}/versions/{self.draft.id}/pdf-files/",
            {},
            format="json",
            **self.ha,
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["error"]["code"], "version_not_finalized")

    def test_list_student_and_program_pdfs(self):
        self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {"program_version_id": str(self.final.id)},
            format="json",
            **self.ha,
        )
        s = self.client.get(f"/api/v1/students/{self.student.id}/pdf-files/", **self.ha)
        self.assertEqual(s.status_code, 200)
        self.assertEqual(s.data["count"], 1)
        p = self.client.get(f"/api/v1/programs/{self.program.id}/pdf-files/", **self.ha)
        self.assertEqual(p.data["count"], 1)

    def test_rename_regenerate_delete(self):
        create = self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {"program_version_id": str(self.final.id)},
            format="json",
            **self.ha,
        )
        pdf_id = create.data["id"]
        ren = self.client.patch(
            f"/api/v1/pdf-files/{pdf_id}/",
            {"file_name": "renamed-file.pdf"},
            format="json",
            **self.ha,
        )
        self.assertEqual(ren.data["file_name"], "renamed-file.pdf")
        regen = self.client.post(
            f"/api/v1/pdf-files/{pdf_id}/regenerate/", format="json", **self.ha
        )
        self.assertEqual(regen.status_code, 201)
        self.assertNotEqual(regen.data["id"], pdf_id)
        self.assertEqual(regen.data["regenerated_from_id"], pdf_id)
        delete = self.client.delete(f"/api/v1/pdf-files/{pdf_id}/", **self.ha)
        self.assertEqual(delete.status_code, 204)
        gone = self.client.get(f"/api/v1/pdf-files/{pdf_id}/", **self.ha)
        self.assertEqual(gone.status_code, 404)

    def test_share_flow(self):
        create = self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {"program_version_id": str(self.final.id)},
            format="json",
            **self.ha,
        )
        pdf_id = create.data["id"]
        share = self.client.post(
            f"/api/v1/pdf-files/{pdf_id}/share/",
            {"expires_in_days": 3},
            format="json",
            **self.ha,
        )
        self.assertEqual(share.status_code, 201)
        token = share.data["token"]
        url = share.data["share_url"]
        self.assertIn(token, url)
        detail = self.client.get(f"/api/v1/pdf-files/{pdf_id}/", **self.ha)
        self.assertTrue(detail.data["share"]["has_active_link"])
        self.assertNotIn("token", detail.data)
        self.assertNotIn(token, str(detail.data))

        anon = self.client.get(f"/api/v1/shared/pdf/{token}/")
        self.assertEqual(anon.status_code, 200)
        body = b"".join(anon.streaming_content)
        self.assertTrue(body.startswith(b"%PDF"))

        revoke = self.client.delete(f"/api/v1/pdf-files/{pdf_id}/share/", **self.ha)
        self.assertEqual(revoke.status_code, 204)
        anon2 = self.client.get(f"/api/v1/shared/pdf/{token}/")
        self.assertEqual(anon2.status_code, 404)

        bad = self.client.get("/api/v1/shared/pdf/not-a-real-token-value-xxx/")
        self.assertEqual(bad.status_code, 404)

    def test_expired_and_non_ready_share(self):
        artifact = artifact_services.create_and_render(
            self.coach_a, self.program, version_id=self.final.id
        )
        link, raw = share_services.create_share_link(self.coach_a, artifact)
        link.expires_at = timezone.now() - timedelta(hours=1)
        link.save(update_fields=["expires_at"])
        self.assertEqual(self.client.get(f"/api/v1/shared/pdf/{raw}/").status_code, 404)

        failed = PdfArtifact.objects.create(
            coach=self.coach_a,
            student=self.student,
            program=self.program,
            program_version=self.final,
            display_name="fail.pdf",
            original_filename="fail.pdf",
            status=PdfArtifact.Status.FAILED,
            program_type=self.program.program_type,
            version_label="v2",
        )
        with self.assertRaises(Exception):
            share_services.create_share_link(self.coach_a, failed)

    def test_coach_b_isolation(self):
        create = self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {"program_version_id": str(self.final.id)},
            format="json",
            **self.ha,
        )
        pdf_id = create.data["id"]
        for method, path in [
            ("get", f"/api/v1/pdf-files/{pdf_id}/"),
            ("get", f"/api/v1/pdf-files/{pdf_id}/download/"),
            ("patch", f"/api/v1/pdf-files/{pdf_id}/"),
            ("post", f"/api/v1/pdf-files/{pdf_id}/regenerate/"),
            ("post", f"/api/v1/pdf-files/{pdf_id}/share/"),
            ("delete", f"/api/v1/pdf-files/{pdf_id}/share/"),
            ("delete", f"/api/v1/pdf-files/{pdf_id}/"),
            ("get", f"/api/v1/students/{self.student.id}/pdf-files/"),
            ("get", f"/api/v1/programs/{self.program.id}/pdf-files/"),
            ("post", f"/api/v1/programs/{self.program.id}/pdf-files/"),
        ]:
            kwargs = {"format": "json", **self.hb}
            if method == "patch":
                res = self.client.patch(path, {"file_name": "x.pdf"}, **kwargs)
            elif method == "post":
                res = getattr(self.client, method)(path, {}, **kwargs)
            else:
                res = getattr(self.client, method)(path, **self.hb)
            self.assertEqual(res.status_code, 404, path)

    def test_dashboard_pdf_counts(self):
        empty = self.client.get("/api/v1/dashboard/", **self.ha)
        self.assertTrue(empty.data["pdf_generation_available"])
        self.assertEqual(empty.data["pdf_files_ready"], 0)

        self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {"program_version_id": str(self.final.id)},
            format="json",
            **self.ha,
        )
        dash = self.client.get("/api/v1/dashboard/", **self.ha)
        self.assertEqual(dash.data["pdf_files_ready"], 1)
        self.assertEqual(dash.data["ready_pdf_files"], 1)
        self.assertEqual(dash.data["pdf_files_failed"], 0)

        # Coach B sees zeros
        dash_b = self.client.get("/api/v1/dashboard/", **self.hb)
        self.assertEqual(dash_b.data["pdf_files_ready"], 0)

        # Deleted excluded
        pdf_id = PdfArtifact.objects.filter(coach=self.coach_a).first().id
        self.client.delete(f"/api/v1/pdf-files/{pdf_id}/", **self.ha)
        dash2 = self.client.get("/api/v1/dashboard/", **self.ha)
        self.assertEqual(dash2.data["pdf_files_ready"], 0)

    def test_status_filter_and_search(self):
        self.client.post(
            f"/api/v1/programs/{self.program.id}/pdf-files/",
            {
                "program_version_id": str(self.final.id),
                "file_name": "searchable-mohammad.pdf",
            },
            format="json",
            **self.ha,
        )
        res = self.client.get(
            f"/api/v1/students/{self.student.id}/pdf-files/?status=ready&search=searchable",
            **self.ha,
        )
        self.assertEqual(res.data["count"], 1)

    def test_partial_file_cleanup_on_failure(self):
        with patch(
            "delivery.services.artifacts.render_program_pdf_bytes",
            side_effect=RuntimeError("boom"),
        ):
            artifact = artifact_services.create_and_render(
                self.coach_a, self.program, version_id=self.final.id
            )
        self.assertEqual(artifact.status, PdfArtifact.Status.FAILED)
        self.assertFalse(artifact.file)
        self.assertEqual(artifact.error_code, "render_failed")
        self.assertNotIn("boom", artifact.error_summary)
