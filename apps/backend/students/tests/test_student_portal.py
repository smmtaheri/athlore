"""Tests for coach-owned student portal username + password login."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import CoachProfile
from students.models import Student, StudentProfile, Visit
from students.services import (
    STUDENT_LOGIN_GENERIC_ERROR,
    STUDENT_PORTAL_DENIED_ERROR,
    complete_student_setup,
    deactivate_student_portal,
    login_student,
    set_portal_initial_password,
)

User = get_user_model()


def _coach(email: str) -> CoachProfile:
    user = User.objects.create_user(username=email, email=email, password="Test1234!")
    return CoachProfile.objects.create(user=user, display_name=email)


def _student(coach: CoachProfile, *, name="Athlete", phone="+989121111111") -> Student:
    return Student.objects.create(
        coach=coach,
        full_name=name,
        age=25,
        gender=Student.Gender.MALE,
        height_cm=Decimal("175.0"),
        weight_kg=Decimal("75.0"),
        phone_number=phone,
        goals={"primary_goal": "hypertrophy"},
        injuries={},
        training_background={"level": "intermediate"},
        training_conditions={"training_days_per_week": 4},
        equipment={"has_full_gym": True},
    )


def _provision_and_complete(coach, student, *, username="ali_athlete", initial="123456"):
    set_portal_initial_password(
        coach, student, username=username, initial_password=initial
    )
    setup = login_student(username=username, password=initial)
    user = User.objects.get(pk=setup["user"]["id"])
    complete_student_setup(
        user=user,
        password="StudentPass123!",
        password_confirm="StudentPass123!",
    )
    return login_student(username=username, password="StudentPass123!")


class StudentPortalActivationTests(TestCase):
    def setUp(self):
        self.coach = _coach("coach@example.com")
        self.other_coach = _coach("other@example.com")
        self.student = _student(self.coach, phone="+989121111111")
        self.other_student = _student(self.other_coach, name="Other", phone="+989122222222")
        self.coach_client = APIClient()
        self.coach_client.force_authenticate(user=self.coach.user)
        self.public = APIClient()

    def test_coach_sets_username_and_student_forced_password_then_login(self):
        issued = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/portal/set-initial-password/",
            {"username": "ali_athlete", "initial_password": "123456"},
            format="json",
        )
        self.assertEqual(issued.status_code, 200, issued.content)
        self.assertEqual(issued.data["username"], "ali_athlete")
        self.assertEqual(issued.data["initial_password"], "123456")
        self.assertTrue(issued.data["must_change_password"])
        self.assertEqual(issued.data["portal_access"]["username"], "ali_athlete")
        self.assertEqual(issued.data["portal_access"]["status"], "pending_activation")

        begin = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_athlete", "password": "123456"},
            format="json",
        )
        self.assertEqual(begin.status_code, 200, begin.content)
        self.assertTrue(begin.data["must_change_password"])
        self.assertEqual(begin.data["username"], "ali_athlete")
        access = begin.data["tokens"]["access"]

        blocked = APIClient()
        blocked.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        visits = blocked.get("/api/v1/me/visits/")
        self.assertIn(visits.status_code, {401, 403})

        complete = APIClient()
        complete.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        done = complete.post(
            "/api/v1/student/complete-setup/",
            {
                "username": "should_be_ignored_if_sent",
                "password": "StudentPass123!",
                "password_confirm": "StudentPass123!",
            },
            format="json",
        )
        self.assertEqual(done.status_code, 200, done.content)
        self.assertTrue(done.data["must_login_again"])
        self.assertEqual(done.data["username"], "ali_athlete")
        self.assertNotIn("tokens", done.data)

        profile = StudentProfile.objects.get(student=self.student)
        self.assertEqual(profile.user.username, "ali_athlete")

        login = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_athlete", "password": "StudentPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertFalse(login.data["must_change_password"])
        self.assertIn("tokens", login.data)

        detail = self.coach_client.get(f"/api/v1/students/{self.student.id}/")
        self.assertEqual(detail.data["portal_access"]["status"], "active")
        self.assertEqual(detail.data["portal_access"]["username"], "ali_athlete")

    def test_denied_vs_wrong_password_messages(self):
        set_portal_initial_password(
            self.coach, self.student, username="ali_ok", initial_password="123456"
        )

        unknown = self.public.post(
            "/api/v1/student/login/",
            {"username": "no_such_user", "password": "123456"},
            format="json",
        )
        self.assertEqual(unknown.status_code, 403)
        self.assertEqual(unknown.data["error"]["code"], "portal_access_denied")
        self.assertEqual(unknown.data["error"]["message"], STUDENT_PORTAL_DENIED_ERROR)
        self.assertNotIn("tokens", unknown.data)

        wrong = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_ok", "password": "wrong-pass"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(wrong.data["error"]["message"], STUDENT_LOGIN_GENERIC_ERROR)

        deactivate_student_portal(self.coach, self.student)
        disabled = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_ok", "password": "123456"},
            format="json",
        )
        self.assertEqual(disabled.status_code, 403)
        self.assertEqual(disabled.data["error"]["message"], STUDENT_PORTAL_DENIED_ERROR)

    def test_activate_endpoint_removed(self):
        resp = self.public.post(
            "/api/v1/student/activate/",
            {"phone_number": "09121111111", "password": "123456"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_disabled_student_cannot_use_me_or_visits(self):
        session = _provision_and_complete(self.coach, self.student)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['tokens']['access']}")
        self.assertEqual(client.get("/api/v1/me/").status_code, 200)

        deactivate_student_portal(self.coach, self.student)
        me = client.get("/api/v1/me/")
        self.assertIn(me.status_code, {401, 403})
        visits = client.get("/api/v1/me/visits/")
        self.assertIn(visits.status_code, {401, 403})

    def test_student_cannot_access_coach_endpoints(self):
        session = _provision_and_complete(self.coach, self.student)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['tokens']['access']}")
        self.assertIn(client.get("/api/v1/students/").status_code, {401, 403})
        self.assertIn(
            client.get(f"/api/v1/students/{self.other_student.id}/").status_code,
            {401, 403, 404},
        )

    def test_reset_password_keeps_username_and_invalidates_old(self):
        _provision_and_complete(self.coach, self.student, username="ali_ok")
        visit = Visit.objects.create(
            coach=self.coach,
            student=self.student,
            visit_date="2026-09-01",
            current_weight_kg=Decimal("80.0"),
            previous_weight_kg=Decimal("81.0"),
            daily_energy_level=Visit.Level.MEDIUM,
            sleep_quality=Visit.Level.MEDIUM,
            stress_level=Visit.Level.MEDIUM,
            status=Visit.Status.FINALIZED,
        )

        reset = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/portal/reset-password/",
            {"initial_password": "654321"},
            format="json",
        )
        self.assertEqual(reset.status_code, 200, reset.content)
        self.assertEqual(reset.data["username"], "ali_ok")
        self.assertEqual(reset.data["portal_access"]["status"], "password_reset_required")

        old_login = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_ok", "password": "StudentPass123!"},
            format="json",
        )
        self.assertEqual(old_login.status_code, 401)

        begin = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_ok", "password": "654321"},
            format="json",
        )
        self.assertEqual(begin.status_code, 200)
        self.assertTrue(begin.data["must_change_password"])
        self.assertEqual(begin.data.get("username"), "ali_ok")

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {begin.data['tokens']['access']}")
        done = client.post(
            "/api/v1/student/complete-setup/",
            {
                "password": "NewStudentPass123!",
                "password_confirm": "NewStudentPass123!",
            },
            format="json",
        )
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.data["username"], "ali_ok")

        profile = StudentProfile.objects.get(student=self.student)
        self.assertEqual(profile.user.username, "ali_ok")
        self.assertFalse(profile.must_change_password)
        self.assertTrue(Visit.objects.filter(pk=visit.pk).exists())

        login = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_ok", "password": "NewStudentPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_coach_can_edit_username(self):
        set_portal_initial_password(
            self.coach, self.student, username="old_name", initial_password="123456"
        )
        renamed = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/portal/set-username/",
            {"username": "new_name"},
            format="json",
        )
        self.assertEqual(renamed.status_code, 200, renamed.content)
        self.assertEqual(renamed.data["username"], "new_name")
        login = self.public.post(
            "/api/v1/student/login/",
            {"username": "new_name", "password": "123456"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_reactivate_after_deactivate(self):
        _provision_and_complete(self.coach, self.student, username="ali_react")
        deactivate_student_portal(self.coach, self.student)
        again = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/portal/reactivate/",
            {},
            format="json",
        )
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(again.data["portal_access"]["status"], "active")
        login = self.public.post(
            "/api/v1/student/login/",
            {"username": "ali_react", "password": "StudentPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_mohammad_fixture_phone_preserved_without_seeded_password(self):
        mohammad = _student(
            self.coach, name="محمد طاهری", phone="+989386579479"
        )
        set_portal_initial_password(
            self.coach, mohammad, username="mohammad_t", initial_password="123456"
        )
        profile = StudentProfile.objects.get(student=mohammad)
        self.assertEqual(profile.user.username, "mohammad_t")
        self.assertEqual(mohammad.phone_number, "+989386579479")
