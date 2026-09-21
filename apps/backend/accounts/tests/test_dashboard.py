from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CoachProfile
from accounts.rules_services import replace_coach_rules
from common.testing import auth_header, register
from programming.models import ProgramVersion
from programming.services import programs as program_services
from students.body_check_services import create_cycle
from students.models import Student, Visit

MIN_RULES = {
    "templates": [
        {
            "name": "T1",
            "goal": "g",
            "main_goal": "g",
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
            "favorite_exercises": ["پرس سینه هالتر"],
            "beginner_friendly": [],
            "professional_friendly": [],
            "forbidden_exercises": [],
            "sort_order": 0,
        }
    ],
    "general_rules": {"extra_notes": "", "items": []},
}


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class DashboardApiTests(APITestCase):
    def setUp(self):
        a = register(self.client, "dash-a@example.com", full_name="Dash A")
        b = register(self.client, "dash-b@example.com", full_name="Dash B")
        self.tokens_a = a.data["tokens"]
        self.tokens_b = b.data["tokens"]
        self.ha = auth_header(self.tokens_a)
        self.hb = auth_header(self.tokens_b)
        self.coach_a = CoachProfile.objects.get(id=a.data["coach"]["id"])
        self.coach_b = CoachProfile.objects.get(id=b.data["coach"]["id"])

    def test_anonymous_rejected(self):
        res = self.client.get("/api/v1/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_dashboard(self):
        with patch("accounts.dashboard.timezone.localdate", return_value=date(2026, 8, 6)):
            res = self.client.get("/api/v1/dashboard/", **self.ha)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total_students"], 0)
        self.assertEqual(res.data["active_students"], 0)
        self.assertEqual(res.data["this_month_visits"], 0)
        self.assertEqual(res.data["monthly_visits"]["active_students"], 0)
        self.assertEqual(res.data["monthly_visits"]["not_sent"], 0)
        self.assertEqual(res.data["draft_programs"], 0)
        self.assertEqual(res.data["final_programs"], 0)
        self.assertEqual(res.data["pdf_files_ready"], 0)
        self.assertEqual(res.data["ready_pdf_files"], 0)
        self.assertTrue(res.data["pdf_generation_available"])
        self.assertEqual(res.data["latest_programs"], [])
        self.assertEqual(res.data["latest_visits"], [])
        self.assertEqual(res.data["as_of"], "2026-08-06")

    def test_populated_counts_recent_isolation(self):
        today = date(2026, 8, 6)
        student = Student.objects.create(
            coach=self.coach_a,
            full_name="محمد طاهری",
            age=27,
            gender=Student.Gender.MALE,
            height_cm=Decimal("182.0"),
            weight_kg=Decimal("86.0"),
            status=Student.Status.ACTIVE,
            goals={"primary_goal": "hypertrophy"},
            injuries={"has_injury": True, "injury_type": "mild_neck"},
            training_background={"level": "intermediate"},
            summary_medical_note="گردن درد خفیف",
            summary_last_visit_date=today - timedelta(days=40),
        )
        Student.objects.create(
            coach=self.coach_a,
            full_name="آرشیو",
            age=30,
            gender=Student.Gender.MALE,
            height_cm=Decimal("170.0"),
            weight_kg=Decimal("70.0"),
            status=Student.Status.INACTIVE,
            archived_at=timezone.now(),
        )
        Visit.objects.create(
            coach=self.coach_a,
            student=student,
            visit_date=date(2026, 8, 1),
            current_weight_kg=Decimal("85.0"),
            previous_weight_kg=Decimal("86.0"),
            daily_energy_level=Visit.Level.GOOD,
            sleep_quality=Visit.Level.MEDIUM,
            stress_level=Visit.Level.MEDIUM,
            next_cycle_goal="ادامه حجم",
        )
        # Other coach noise
        other = Student.objects.create(
            coach=self.coach_b,
            full_name="Other",
            age=22,
            gender=Student.Gender.MALE,
            height_cm=Decimal("180.0"),
            weight_kg=Decimal("80.0"),
            status=Student.Status.ACTIVE,
        )
        Visit.objects.create(
            coach=self.coach_b,
            student=other,
            visit_date=date(2026, 8, 2),
            current_weight_kg=Decimal("80.0"),
            previous_weight_kg=Decimal("80.0"),
            daily_energy_level=Visit.Level.GOOD,
            sleep_quality=Visit.Level.GOOD,
            stress_level=Visit.Level.LOW,
        )

        replace_coach_rules(self.coach_a, MIN_RULES)
        from accounts.models import ProgramTemplate

        template = ProgramTemplate.objects.filter(coach=self.coach_a).first()
        draft_prog, _ = program_services.generate_program(
            self.coach_a,
            {
                "student_id": str(student.id),
                "template_id": str(template.id),
                "title": "Draft Prog",
                "program_type": "complete",
            },
        )
        final_prog, _ = program_services.generate_program(
            self.coach_a,
            {
                "student_id": str(student.id),
                "template_id": str(template.id),
                "title": "Final Prog",
                "program_type": "complete",
            },
        )
        version = final_prog.versions.get(status=ProgramVersion.Status.DRAFT)
        program_services.finalize_version(version, actor=self.coach_a.user)

        with patch("accounts.dashboard.timezone.localdate", return_value=today):
            res = self.client.get("/api/v1/dashboard/", **self.ha)
            res_b = self.client.get("/api/v1/dashboard/", **self.hb)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total_students"], 1)
        self.assertEqual(res.data["active_students"], 1)
        self.assertEqual(res.data["archived_students"], 1)
        self.assertEqual(res.data["this_month_visits"], 1)
        self.assertEqual(res.data["monthly_visits"]["active_students"], 1)
        self.assertGreaterEqual(res.data["draft_programs"], 1)
        self.assertGreaterEqual(res.data["final_programs"], 1)
        self.assertEqual(len(res.data["latest_programs"]), 2)
        self.assertLessEqual(len(res.data["latest_programs"]), 5)
        self.assertEqual(len(res.data["latest_visits"]), 1)
        self.assertTrue(any(s["full_name"] == "محمد طاهری" for s in res.data["overdue_visits"]))
        self.assertTrue(any(s["full_name"] == "محمد طاهری" for s in res.data["follow_up_students"]))
        self.assertEqual(res.data["pdf_files_ready"], 0)
        self.assertTrue(res.data["pdf_generation_available"])

        # Coach B isolation
        self.assertEqual(res_b.data["total_students"], 1)
        self.assertEqual(res_b.data["this_month_visits"], 1)
        self.assertEqual(res_b.data["monthly_visits"]["active_students"], 1)
        self.assertNotIn(
            "محمد طاهری",
            [item["student_name"] for item in res_b.data["monthly_visits"]["items"]],
        )
        self.assertEqual(res_b.data["draft_programs"], 0)
        names = [p["title"] for p in res_b.data["latest_programs"]]
        self.assertNotIn("Draft Prog", names)
        self.assertNotIn("Final Prog", names)

        # Recent programs ordered by updated_at desc — finalized touched last
        titles = [p["title"] for p in res.data["latest_programs"]]
        self.assertIn("Final Prog", titles)
        self.assertIn("Draft Prog", titles)

        # Bound size
        for _ in range(6):
            program_services.create_empty_draft(
                self.coach_a,
                student_id=student.id,
                title=f"Extra {_}",
                program_type="workout",
            )
        with patch("accounts.dashboard.timezone.localdate", return_value=today):
            res2 = self.client.get("/api/v1/dashboard/", **self.ha)
        self.assertLessEqual(len(res2.data["latest_programs"]), 5)

        # Archived program excluded from live latest list counts of drafts still ok
        program_services.archive_program(draft_prog)
        with patch("accounts.dashboard.timezone.localdate", return_value=today):
            res3 = self.client.get("/api/v1/dashboard/", **self.ha)
        self.assertGreaterEqual(res3.data["archived_programs"], 1)
        live_titles = [p["title"] for p in res3.data["latest_programs"]]
        self.assertNotIn("Draft Prog", live_titles)

    def test_monthly_visit_summary_is_active_scoped_and_separates_send_status(self):
        today = date(2026, 9, 21)

        def make_student(name, status=Student.Status.ACTIVE):
            return Student.objects.create(
                coach=self.coach_a,
                full_name=name,
                age=27,
                gender=Student.Gender.MALE,
                height_cm=Decimal("182.0"),
                weight_kg=Decimal("86.0"),
                status=status,
            )

        def make_visit(student, visit_date, visit_status):
            return Visit.objects.create(
                coach=self.coach_a,
                student=student,
                visit_date=visit_date,
                current_weight_kg=Decimal("86.0"),
                previous_weight_kg=Decimal("86.2"),
                daily_energy_level=Visit.Level.GOOD,
                sleep_quality=Visit.Level.MEDIUM,
                stress_level=Visit.Level.MEDIUM,
                status=visit_status,
            )

        no_visit = make_student("بدون ویزیت")
        near_due = make_student("نزدیک موعد")
        overdue = make_student("عقب‌افتاده")
        sent = make_student("ارسال‌شده")
        answered = make_student("پاسخ‌داده")
        inactive = make_student("غیرفعال", status=Student.Status.INACTIVE)

        make_visit(near_due, date(2026, 8, 25), Visit.Status.FINALIZED)
        make_visit(overdue, date(2026, 8, 10), Visit.Status.FINALIZED)
        make_visit(sent, date(2026, 9, 20), Visit.Status.WAITING_FOR_STUDENT)
        make_visit(answered, date(2026, 9, 19), Visit.Status.STUDENT_SUBMITTED)
        make_visit(inactive, date(2026, 9, 20), Visit.Status.WAITING_FOR_STUDENT)

        with patch("accounts.dashboard.timezone.localdate", return_value=today):
            response = self.client.get("/api/v1/dashboard/", **self.ha)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data["monthly_visits"]
        self.assertEqual(summary["active_students"], 5)
        self.assertEqual(summary["not_sent"], 3)
        self.assertEqual(summary["sent"], 2)
        self.assertEqual(summary["student_submitted"], 1)
        self.assertEqual(summary["due_soon"], 2)
        self.assertEqual(summary["overdue"], 1)
        names = {item["student_name"] for item in summary["items"]}
        self.assertEqual(
            names,
            {"بدون ویزیت", "نزدیک موعد", "عقب‌افتاده", "ارسال‌شده", "پاسخ‌داده"},
        )
        self.assertNotIn("غیرفعال", names)
        status_by_name = {item["student_name"]: item["status"] for item in summary["items"]}
        self.assertEqual(status_by_name["بدون ویزیت"], "not_sent")
        self.assertEqual(status_by_name["ارسال‌شده"], Visit.Status.WAITING_FOR_STUDENT)
        self.assertEqual(status_by_name["پاسخ‌داده"], Visit.Status.STUDENT_SUBMITTED)

    def test_body_check_today_is_scoped_and_unlogged_students_are_first(self):
        today = date(2026, 8, 6)
        logged_student = Student.objects.create(
            coach=self.coach_a,
            full_name="شاگرد ثبت‌شده",
            age=27,
            gender=Student.Gender.MALE,
            height_cm=Decimal("182.0"),
            weight_kg=Decimal("86.0"),
            status=Student.Status.ACTIVE,
        )
        unlogged_student = Student.objects.create(
            coach=self.coach_a,
            full_name="شاگرد ثبت‌نشده",
            age=28,
            gender=Student.Gender.FEMALE,
            height_cm=Decimal("168.0"),
            weight_kg=Decimal("65.0"),
            status=Student.Status.ACTIVE,
        )
        other_student = Student.objects.create(
            coach=self.coach_b,
            full_name="شاگرد مربی دیگر",
            age=25,
            gender=Student.Gender.MALE,
            height_cm=Decimal("175.0"),
            weight_kg=Decimal("80.0"),
            status=Student.Status.ACTIVE,
        )
        expired_student = Student.objects.create(
            coach=self.coach_a,
            full_name="شاگرد دوره تمام‌شده",
            age=30,
            gender=Student.Gender.MALE,
            height_cm=Decimal("180.0"),
            weight_kg=Decimal("82.0"),
            status=Student.Status.ACTIVE,
        )
        with patch("students.body_check_services.local_today", return_value=today):
            logged_cycle = create_cycle(
                self.coach_a,
                logged_student,
                start_date=today - timedelta(days=1),
                starting_weight_kg=Decimal("86"),
                goal_weight_kg=Decimal("80"),
            )
            create_cycle(
                self.coach_a,
                unlogged_student,
                start_date=today - timedelta(days=25),
                starting_weight_kg=Decimal("65"),
                goal_weight_kg=Decimal("60"),
            )
            create_cycle(
                self.coach_b,
                other_student,
                start_date=today - timedelta(days=1),
                starting_weight_kg=Decimal("80"),
                goal_weight_kg=Decimal("75"),
            )
            create_cycle(
                self.coach_a,
                expired_student,
                start_date=today - timedelta(days=30),
                starting_weight_kg=Decimal("82"),
                goal_weight_kg=Decimal("78"),
            )
        from students.body_check_models import BodyCheckDailyEntry

        BodyCheckDailyEntry.objects.create(
            cycle=logged_cycle,
            local_date=today,
            actual_weight_kg=Decimal("85.5"),
            sleep_start_time=time(23, 30),
            wake_time=time(7, 0),
            sleep_quality_score=8,
        )

        with patch("accounts.dashboard.timezone.localdate", return_value=today):
            res = self.client.get("/api/v1/dashboard/", **self.ha)

        self.assertEqual(res.status_code, 200)
        items = res.data["body_check_today"]
        self.assertEqual([item["student_name"] for item in items], ["شاگرد ثبت‌نشده", "شاگرد ثبت‌شده"])
        self.assertFalse(items[0]["is_logged"])
        self.assertEqual(items[1]["actual_weight_kg"], 85.5)
        self.assertEqual(items[1]["sleep_start_time"], "23:30:00")
        self.assertEqual(items[1]["wake_time"], "07:00:00")
        self.assertTrue(items[1]["completion"]["has_sleep"])
        self.assertEqual(items[1]["sleep_quality_score"], 8)
        self.assertNotIn("شاگرد مربی دیگر", [item["student_name"] for item in items])
        self.assertNotIn("شاگرد دوره تمام‌شده", [item["student_name"] for item in items])
        summary = res.data["body_check_cycles"]
        self.assertEqual(summary["active"], 2)
        self.assertEqual(summary["expiring_soon"], 1)
        self.assertEqual(summary["expired"], 1)
        self.assertEqual(summary["without_active_cycle"], 0)

        expired_student.refresh_from_db()
        self.assertEqual(expired_student.body_check_cycles.get().status, "expired")
