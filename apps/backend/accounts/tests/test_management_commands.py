from __future__ import annotations

from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from accounts.models import CoachProfile
from students.models import Student


class ManagementCommandTests(TestCase):
    def test_create_list_archive_restore_transfer(self):
        out = StringIO()
        call_command(
            "create_coach",
            name="آرمان",
            email="cmd-a@example.com",
            phone="09121110001",
            password="SecurePass123!",
            stdout=out,
        )
        self.assertIn("coach_id=", out.getvalue())
        call_command(
            "create_coach",
            name="Coach B",
            email="cmd-b@example.com",
            phone="09121110002",
            password="SecurePass123!",
            stdout=StringIO(),
        )
        out2 = StringIO()
        call_command(
            "create_student",
            coach_email="cmd-a@example.com",
            name="محمد",
            phone="09121110003",
            stdout=out2,
        )
        self.assertIn("student_id=", out2.getvalue())
        student = Student.objects.get(phone_number="+989121110003")
        call_command("archive_student", student_id=str(student.id), stdout=StringIO())
        student.refresh_from_db()
        self.assertIsNotNone(student.archived_at)
        call_command("restore_student", student_id=str(student.id), stdout=StringIO())
        student.refresh_from_db()
        self.assertIsNone(student.archived_at)
        call_command(
            "transfer_student",
            student_id=str(student.id),
            to_coach_email="cmd-b@example.com",
            yes=True,
            stdout=StringIO(),
        )
        student.refresh_from_db()
        self.assertEqual(student.coach.user.email, "cmd-b@example.com")

    def test_duplicate_phone_command(self):
        call_command(
            "create_coach",
            name="A",
            email="dup-a@example.com",
            phone="09121110009",
            password="SecurePass123!",
            stdout=StringIO(),
        )
        with self.assertRaises(Exception):
            call_command(
                "create_coach",
                name="B",
                email="dup-b@example.com",
                phone="+989121110009",
                password="SecurePass123!",
                stdout=StringIO(),
            )

    def test_deactivate_blocks_login_flag(self):
        call_command(
            "create_coach",
            name="Inactive",
            email="inactive@example.com",
            phone="09121110008",
            password="SecurePass123!",
            stdout=StringIO(),
        )
        call_command("deactivate_coach", email="inactive@example.com", stdout=StringIO())
        coach = CoachProfile.objects.get(user__email="inactive@example.com")
        self.assertFalse(coach.user.is_active)
        call_command("activate_coach", email="inactive@example.com", stdout=StringIO())
        coach.user.refresh_from_db()
        self.assertTrue(coach.user.is_active)
