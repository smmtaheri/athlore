"""Body Check API: permissions, missing days, aggregation, meals lock, photos."""

from __future__ import annotations

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import CoachProfile
from students.body_check_models import BodyCheckDailyEntry
from students.body_check_services import (
    average_clock_time,
    create_cycle,
    local_today,
    suggest_daily_targets_kg,
)
from students.models import Student
from students.services import (
    complete_student_setup,
    login_student,
    set_portal_initial_password,
)

User = get_user_model()


def _coach(email: str) -> CoachProfile:
    user = User.objects.create_user(username=email, email=email, password="Test1234!")
    return CoachProfile.objects.create(user=user, display_name=email)


def _student(coach: CoachProfile, name: str = "Athlete", phone: str | None = None) -> Student:
    return Student.objects.create(
        coach=coach,
        full_name=name,
        age=25,
        gender=Student.Gender.MALE,
        height_cm=Decimal("175.0"),
        weight_kg=Decimal("80.0"),
        phone_number=phone,
        goals={"primary_goal": "fat_loss"},
        injuries={},
        training_background={"level": "intermediate"},
        training_conditions={"training_days_per_week": 4},
        equipment={"has_full_gym": True},
    )


def _tiny_png() -> SimpleUploadedFile:
    # Minimal valid 1x1 PNG
    data = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return SimpleUploadedFile("progress.png", data, content_type="image/png")


class BodyCheckApiTests(TestCase):
    def setUp(self):
        self.coach = _coach("coach-bc@example.com")
        self.other_coach = _coach("other-bc@example.com")
        self.student = _student(self.coach, "Ali", phone="+989131111111")
        self.other_student = _student(self.other_coach, "Other", phone="+989132222222")
        self.coach_client = APIClient()
        self.coach_client.force_authenticate(user=self.coach.user)
        self.today = local_today()
        self.start = self.today - timedelta(days=5)

    def _activate_student(self, student: Student, username: str):
        set_portal_initial_password(self.coach, student, username=username, initial_password="123456")
        setup = login_student(username=username, password="123456")
        user = User.objects.get(pk=setup["user"]["id"])
        complete_student_setup(
            user=user, password="StudentPass123!", password_confirm="StudentPass123!"
        )
        client = APIClient()
        login = login_student(username=username, password="StudentPass123!")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['tokens']['access']}")
        return client

    def test_suggest_targets_is_linear(self):
        targets = suggest_daily_targets_kg(Decimal("90"), Decimal("80"), days=30)
        self.assertEqual(len(targets), 30)
        self.assertEqual(targets[0], 90.0)
        self.assertEqual(targets[-1], 80.0)
        mid = 90 + (80 - 90) * 14 / 29
        self.assertAlmostEqual(targets[14], round(mid, 1), places=1)

    def test_coach_creates_cycle_and_other_coach_blocked(self):
        resp = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/body-check/cycles/",
            {
                "start_date": self.start.isoformat(),
                "starting_weight_kg": "80.0",
                "goal_weight_kg": "75.0",
                "meal_detail_enabled": False,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["cycle_length_days"], 30)
        self.assertEqual(len(resp.data["daily_targets_kg"]), 30)
        self.assertEqual(len(resp.data["days"]), 30)
        self.assertEqual(resp.data["report"]["logged_days"], 0)
        self.assertEqual(resp.data["report"]["missing_days"], 30)

        other = APIClient()
        other.force_authenticate(user=self.other_coach.user)
        forbidden = other.get(
            f"/api/v1/students/{self.student.id}/body-check/cycles/{resp.data['id']}/"
        )
        self.assertIn(forbidden.status_code, {403, 404})

    def test_missing_days_are_not_fabricated_and_averages_use_logged_only(self):
        cycle = create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc")
        d1 = self.start
        d2 = self.start + timedelta(days=1)
        client.put(
            "/api/v1/me/body-check/entries/",
            {
                "local_date": d1.isoformat(),
                "actual_weight_kg": "79.5",
                "nutrition_adherence_score": 8,
                "sleep_start_time": "23:00:00",
                "wake_time": "07:00:00",
                "sleep_quality_score": 7,
            },
            format="json",
        )
        client.put(
            "/api/v1/me/body-check/entries/",
            {
                "local_date": d2.isoformat(),
                "actual_weight_kg": "79.0",
                "nutrition_adherence_score": 6,
            },
            format="json",
        )
        self.assertEqual(BodyCheckDailyEntry.objects.filter(cycle=cycle).count(), 2)

        report = self.coach_client.get(
            f"/api/v1/students/{self.student.id}/body-check/cycles/{cycle.id}/report/"
        )
        self.assertEqual(report.status_code, 200)
        agg = report.data["report"]
        self.assertEqual(agg["logged_days"], 2)
        self.assertEqual(agg["missing_days"], 28)
        self.assertEqual(agg["nutrition_score_days"], 2)
        self.assertEqual(agg["avg_nutrition_adherence_score"], 7.0)
        self.assertEqual(agg["sleep_duration_days"], 1)
        self.assertEqual(agg["avg_sleep_duration_minutes"], 480)
        self.assertEqual(agg["sleep_start_time_days"], 1)
        self.assertEqual(agg["avg_sleep_start_time"], "23:00:00")
        self.assertEqual(agg["wake_time_days"], 1)
        self.assertEqual(agg["avg_wake_time"], "07:00:00")
        # Calendar marks unlogged days explicitly
        unlogged = [d for d in report.data["days"] if d["status"] == "not_logged"]
        self.assertEqual(len(unlogged), 28)
        for day in unlogged:
            self.assertIsNone(day["actual_weight_kg"])
            self.assertFalse(day["is_logged"])

    def test_clock_time_average_crosses_midnight(self):
        self.assertEqual(
            average_clock_time([time(23, 30), time(0, 30)]),
            "00:00:00",
        )
        self.assertEqual(
            average_clock_time([time(7, 0), time(8, 0)]),
            "07:30:00",
        )

    def test_student_cannot_log_future_or_other_student_cycle(self):
        create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc2")
        future = self.today + timedelta(days=1)
        if future <= self.start + timedelta(days=29):
            bad = client.put(
                "/api/v1/me/body-check/entries/",
                {"local_date": future.isoformat(), "actual_weight_kg": "79.0"},
                format="json",
            )
            self.assertEqual(bad.status_code, 400)

        create_cycle(
            self.other_coach,
            self.other_student,
            start_date=self.start,
            starting_weight_kg=Decimal("70"),
            goal_weight_kg=Decimal("68"),
        )
        other_client = APIClient()
        set_portal_initial_password(
            self.other_coach,
            self.other_student,
            username="other_bc",
            initial_password="123456",
        )
        setup = login_student(username="other_bc", password="123456")
        user = User.objects.get(pk=setup["user"]["id"])
        complete_student_setup(
            user=user, password="StudentPass123!", password_confirm="StudentPass123!"
        )
        login = login_student(username="other_bc", password="StudentPass123!")
        other_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['tokens']['access']}")
        # other student only sees own active cycle
        mine = other_client.get("/api/v1/me/body-check/")
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(mine.data["cycle"]["student_id"], str(self.other_student.id))

    def test_meals_locked_until_coach_enables(self):
        cycle = create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
            meal_detail_enabled=False,
        )
        client = self._activate_student(self.student, "ali_bc3")
        locked = client.put(
            "/api/v1/me/body-check/entries/",
            {"local_date": self.start.isoformat(), "meal_1": "oats"},
            format="json",
        )
        self.assertEqual(locked.status_code, 400)

        self.coach_client.patch(
            f"/api/v1/students/{self.student.id}/body-check/cycles/{cycle.id}/",
            {"meal_detail_enabled": True},
            format="json",
        )
        ok = client.put(
            "/api/v1/me/body-check/entries/",
            {"local_date": self.start.isoformat(), "meal_1": "oats"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["meals"]["meal_1"], "oats")

    @override_settings(MEDIA_ROOT="/tmp/athlore-body-check-test-media")
    def test_photo_upload_and_permissioned_download(self):
        create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc4")
        upload = client.post(
            "/api/v1/me/body-check/photos/",
            {"week_number": 1, "file": _tiny_png()},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201)
        photo_id = upload.data["id"]

        dl = client.get(f"/api/v1/body-check/photos/{photo_id}/download/")
        self.assertEqual(dl.status_code, 200)

        coach_dl = self.coach_client.get(f"/api/v1/body-check/photos/{photo_id}/download/")
        self.assertEqual(coach_dl.status_code, 200)

        stranger = APIClient()
        stranger.force_authenticate(user=self.other_coach.user)
        denied = stranger.get(f"/api/v1/body-check/photos/{photo_id}/download/")
        self.assertEqual(denied.status_code, 404)

    def test_partial_day_save_allowed(self):
        create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc5")
        morning = client.put(
            "/api/v1/me/body-check/entries/",
            {"local_date": self.today.isoformat(), "actual_weight_kg": "79.2"},
            format="json",
        )
        self.assertEqual(morning.status_code, 200)
        self.assertTrue(morning.data["completion"]["has_weight"])
        self.assertFalse(morning.data["completion"]["has_sleep"])

        evening = client.put(
            "/api/v1/me/body-check/entries/",
            {
                "local_date": self.today.isoformat(),
                "sleep_start_time": "23:30:00",
                "wake_time": "06:30:00",
                "sleep_quality_score": 8,
            },
            format="json",
        )
        self.assertEqual(evening.status_code, 200)
        self.assertEqual(evening.data["actual_weight_kg"], 79.2)
        self.assertTrue(evening.data["completion"]["has_sleep"])
        self.assertEqual(BodyCheckDailyEntry.objects.count(), 1)

    def test_empty_save_does_not_create_logged_day(self):
        cycle = create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc_empty")
        empty = client.put(
            "/api/v1/me/body-check/entries/",
            {
                "local_date": self.today.isoformat(),
                "actual_weight_kg": None,
                "sleep_start_time": None,
                "wake_time": None,
                "sleep_quality_score": None,
                "nutrition_adherence_score": None,
            },
            format="json",
        )
        self.assertEqual(empty.status_code, 200)
        self.assertFalse(empty.data["is_logged"])
        self.assertEqual(empty.data["status"], "not_logged")
        self.assertIsNone(empty.data["id"])
        self.assertEqual(BodyCheckDailyEntry.objects.filter(cycle=cycle).count(), 0)

        report = self.coach_client.get(
            f"/api/v1/students/{self.student.id}/body-check/cycles/{cycle.id}/report/"
        )
        self.assertEqual(report.data["report"]["logged_days"], 0)
        self.assertEqual(report.data["report"]["missing_days"], 30)

    def test_clearing_existing_entry_removes_logged_day(self):
        cycle = create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc_clear")
        client.put(
            "/api/v1/me/body-check/entries/",
            {"local_date": self.today.isoformat(), "actual_weight_kg": "79.0"},
            format="json",
        )
        self.assertEqual(BodyCheckDailyEntry.objects.filter(cycle=cycle).count(), 1)

        cleared = client.put(
            "/api/v1/me/body-check/entries/",
            {
                "local_date": self.today.isoformat(),
                "actual_weight_kg": None,
                "sleep_start_time": None,
                "wake_time": None,
                "sleep_quality_score": None,
                "nutrition_adherence_score": None,
            },
            format="json",
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertFalse(cleared.data["is_logged"])
        self.assertEqual(BodyCheckDailyEntry.objects.filter(cycle=cycle).count(), 0)

        report = self.coach_client.get(
            f"/api/v1/students/{self.student.id}/body-check/cycles/{cycle.id}/report/"
        )
        self.assertEqual(report.data["report"]["logged_days"], 0)
        self.assertEqual(report.data["report"]["missing_days"], 30)

    @override_settings(MEDIA_ROOT="/tmp/athlore-body-check-test-media")
    def test_student_cannot_upload_future_week_photo(self):
        # Cycle starts today → only week 1 is allowed for the student.
        cycle = create_cycle(
            self.coach,
            self.student,
            start_date=self.today,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc_fw")
        future = client.post(
            "/api/v1/me/body-check/photos/",
            {"week_number": 4, "file": _tiny_png()},
            format="multipart",
        )
        self.assertEqual(future.status_code, 400)
        payload = future.data
        if "error" in payload and isinstance(payload["error"], dict):
            details = payload["error"].get("details") or {}
            self.assertIn("week_number", details)
        else:
            self.assertIn("week_number", payload)

        ok = client.post(
            "/api/v1/me/body-check/photos/",
            {"week_number": 1, "file": _tiny_png()},
            format="multipart",
        )
        self.assertEqual(ok.status_code, 201)

        # Coach may upload any week 1–4.
        coach_upload = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/body-check/cycles/{cycle.id}/photos/",
            {"week_number": 4, "file": _tiny_png()},
            format="multipart",
        )
        self.assertEqual(coach_upload.status_code, 201)

    @override_settings(MEDIA_ROOT="/tmp/athlore-body-check-test-media")
    def test_photo_download_rejects_inactive_user(self):
        create_cycle(
            self.coach,
            self.student,
            start_date=self.start,
            starting_weight_kg=Decimal("80"),
            goal_weight_kg=Decimal("75"),
        )
        client = self._activate_student(self.student, "ali_bc_inactive")
        upload = client.post(
            "/api/v1/me/body-check/photos/",
            {"week_number": 1, "file": _tiny_png()},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201)
        photo_id = upload.data["id"]

        student_user = User.objects.get(username="ali_bc_inactive")
        student_user.is_active = False
        student_user.save(update_fields=["is_active"])

        denied = client.get(f"/api/v1/body-check/photos/{photo_id}/download/")
        self.assertIn(denied.status_code, {401, 403})

        unauth = APIClient()
        anon = unauth.get(f"/api/v1/body-check/photos/{photo_id}/download/")
        self.assertEqual(anon.status_code, 401)
