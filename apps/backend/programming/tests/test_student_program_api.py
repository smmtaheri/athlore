from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import CoachProfile
from common.testing import auth_header
from delivery.models import PdfArtifact
from programming.models import Program, ProgramVersion
from students.models import Student
from students.services import complete_student_setup, login_student, set_portal_initial_password

User = get_user_model()


def make_coach(email: str) -> CoachProfile:
    user = User.objects.create_user(username=email, email=email, password="CoachPass123!")
    return CoachProfile.objects.create(user=user, display_name=email)


def make_student(coach: CoachProfile, name: str) -> Student:
    return Student.objects.create(
        coach=coach,
        full_name=name,
        age=27,
        gender=Student.Gender.MALE,
        height_cm=178,
        weight_kg=82,
        phone_number=f"+98912{abs(hash(name)) % 10000000:07d}",
        goals={"primary_goal": "hypertrophy"},
        training_background={"level": "intermediate"},
    )


def make_final_program(coach: CoachProfile, student: Student, title: str) -> Program:
    program = Program.objects.create(
        coach=coach,
        student=student,
        title=title,
        program_type=Program.ProgramType.WORKOUT,
        date_range_label="شهریور ۱۴۰۵",
    )
    version = ProgramVersion.objects.create(
        program=program,
        coach=coach,
        version_number=1,
        status=ProgramVersion.Status.FINALIZED,
        finalized_at=timezone.now(),
        training={
            "summary": "برنامه تستی",
            "days": [{"order": 1, "title": "روز سینه", "exercises": []}],
        },
    )
    program.active_version = version
    program.save(update_fields=["active_version"])
    return program


def student_client(coach: CoachProfile, student: Student, username: str) -> APIClient:
    set_portal_initial_password(coach, student, username=username, initial_password="123456")
    pending = login_student(username=username, password="123456")
    user = User.objects.get(pk=pending["user"]["id"])
    complete_student_setup(user=user, password="StudentPass123!", password_confirm="StudentPass123!")
    session = login_student(username=username, password="StudentPass123!")
    client = APIClient()
    client.credentials(**auth_header(session["tokens"]))
    return client


class StudentProgramApiTests(TestCase):
    def setUp(self):
        self.coach_a = make_coach("student-program-a@example.com")
        self.coach_b = make_coach("student-program-b@example.com")
        self.student_a = make_student(self.coach_a, "Student A")
        self.student_b = make_student(self.coach_b, "Student B")
        self.program_a = make_final_program(self.coach_a, self.student_a, "برنامه سینه A")
        self.program_b = make_final_program(self.coach_b, self.student_b, "برنامه سینه B")
        self.client = student_client(self.coach_a, self.student_a, "student_program_a")

    def test_student_lists_and_reads_only_own_finalized_programs(self):
        response = self.client.get("/api/v1/me/programs/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([item["id"] for item in response.data["results"]], [str(self.program_a.id)])

        detail = self.client.get(f"/api/v1/me/programs/{self.program_a.id}/")
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.data["title"], "برنامه سینه A")
        self.assertEqual(detail.data["program_version_id"], str(self.program_a.active_version_id))
        self.assertNotIn("generator", detail.data)

        cross_coach = self.client.get(f"/api/v1/me/programs/{self.program_b.id}/")
        self.assertEqual(cross_coach.status_code, 404)

    def test_draft_program_is_not_visible_to_student(self):
        draft = Program.objects.create(
            coach=self.coach_a,
            student=self.student_a,
            title="پیش‌نویس مخفی",
            program_type=Program.ProgramType.WORKOUT,
        )
        ProgramVersion.objects.create(
            program=draft,
            coach=self.coach_a,
            version_number=1,
            status=ProgramVersion.Status.DRAFT,
        )
        response = self.client.get("/api/v1/me/programs/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(str(draft.id), {item["id"] for item in response.data["results"]})

    def test_pdf_list_is_student_scoped_and_generation_endpoint_is_idempotent_for_ready_files(self):
        artifact = PdfArtifact.objects.create(
            coach=self.coach_a,
            student=self.student_a,
            program=self.program_a,
            program_version=self.program_a.active_version,
            display_name="برنامه تمرین.pdf",
            original_filename="برنامه تمرین.pdf",
            status=PdfArtifact.Status.READY,
            program_type=Program.ProgramType.WORKOUT,
        )
        listed = self.client.get(f"/api/v1/me/programs/{self.program_a.id}/pdf-files/")
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual([item["id"] for item in listed.data["results"]], [str(artifact.id)])

        with patch("delivery.views.artifact_services.create_and_render_delivery_pair") as render:
            created = self.client.post(f"/api/v1/me/programs/{self.program_a.id}/pdf-files/", {}, format="json")
        self.assertEqual(created.status_code, 200, created.content)
        render.assert_not_called()
        self.assertEqual(created.data["artifacts"][0]["id"], str(artifact.id))

        cross_coach = self.client.get(f"/api/v1/me/programs/{self.program_b.id}/pdf-files/")
        self.assertEqual(cross_coach.status_code, 404)
