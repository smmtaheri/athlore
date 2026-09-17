"""API tests for student Visit lifecycle, visibility, revisions, and activate-login."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import CoachProfile
from accounts.visit_form_fixtures import MINIMAL_VISIT_FORM_TEMPLATE
from students.models import Student, VisitAnswerRevision
from students.services import (
    complete_student_setup,
    create_visit,
    login_student,
    set_portal_initial_password,
)
from students.visit_form_services import (
    ensure_visit_form_from_fixture,
    finalize_visit,
    send_visit_to_student,
    start_coach_review,
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
        weight_kg=Decimal("75.0"),
        phone_number=phone,
        goals={"primary_goal": "hypertrophy"},
        injuries={},
        training_background={"level": "intermediate"},
        training_conditions={"training_days_per_week": 4},
        equipment={"has_full_gym": True},
    )


def _payload(**extra):
    base = {
        "visit_date": "2026-08-01",
        "current_weight_kg": "75.0",
        "previous_weight_kg": "74.0",
        "daily_energy_level": "good",
        "sleep_quality": "good",
        "stress_level": "medium",
    }
    base.update(extra)
    return base


class StudentVisitApiTests(TestCase):
    def setUp(self):
        self.coach = _coach("coach@example.com")
        self.other_coach = _coach("other@example.com")
        self.student = _student(self.coach, "Ali", phone="+989121111111")
        self.other_student = _student(self.other_coach, "Other", phone="+989122222222")
        self.tpl, _ = ensure_visit_form_from_fixture(self.coach, MINIMAL_VISIT_FORM_TEMPLATE)
        # Make goal student-visible/editable; leave training_level coach-only for isolation tests.
        sections = self.tpl.sections
        for section in sections:
            for field in section.get("fields") or []:
                if field["key"] == "goal":
                    field["student_visible"] = True
                    field["student_editable"] = True
                    field["student_visible_when_finalized"] = True
                    field["coach_editable"] = True
                elif field["key"] == "training_level":
                    field["student_visible"] = False
                    field["student_editable"] = False
                    field["student_visible_when_finalized"] = False
                    field["coach_editable"] = True
                elif field["key"] == "injuries":
                    field["student_visible"] = True
                    field["student_editable"] = True
                    field["student_visible_when_finalized"] = False
        self.tpl.sections = sections
        self.tpl.save(update_fields=["sections", "updated_at"])

        self.visit = create_visit(
            self.coach,
            self.student,
            _payload(form_template_id=str(self.tpl.id), answers={"goal": "hypertrophy"}),
            actor=self.coach.user,
        )
        self.coach_client = APIClient()
        self.coach_client.force_authenticate(user=self.coach.user)

    def _activate_and_login_student(self, student=None):
        from django.contrib.auth import get_user_model

        from students.services import complete_student_setup, login_student

        student = student or self.student
        coach = self.coach if student.coach_id == self.coach.id else self.other_coach
        username = f"user_{student.id.hex[:8]}"
        password = "StudentPass123!"
        set_portal_initial_password(
            coach, student, username=username, initial_password="123456"
        )
        setup = login_student(username=username, password="123456")
        user = get_user_model().objects.get(pk=setup["user"]["id"])
        complete_student_setup(
            user=user,
            password=password,
            password_confirm=password,
        )
        session = login_student(username=username, password=password)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['tokens']['access']}")
        return client, {"username": username, "password": password}

    def test_student_only_sees_own_visits(self):
        send_visit_to_student(self.visit)
        other_visit = create_visit(
            self.other_coach,
            self.other_student,
            _payload(visit_date="2026-08-02", skip_form_template=True),
            actor=self.other_coach.user,
        )
        send_visit_to_student(other_visit)
        client, _ = self._activate_and_login_student()
        # Activate other student too (isolation still holds)
        set_portal_initial_password(
            self.other_coach,
            self.other_student,
            username="other_student_user",
            initial_password="123456",
        )
        other_setup = login_student(username="other_student_user", password="123456")
        other_user = get_user_model().objects.get(pk=other_setup["user"]["id"])
        complete_student_setup(
            user=other_user,
            password="StudentPass123!",
            password_confirm="StudentPass123!",
        )

        listed = client.get("/api/v1/me/visits/")
        self.assertEqual(listed.status_code, 200)
        ids = {item["id"] for item in listed.data["results"]}
        self.assertIn(str(self.visit.id), ids)
        self.assertNotIn(str(other_visit.id), ids)

        forbidden = client.get(f"/api/v1/me/visits/{other_visit.id}/")
        self.assertIn(forbidden.status_code, {403, 404})

    def test_hidden_fields_not_returned_or_writable(self):
        send_visit_to_student(self.visit)
        # Coach sets a coach-only answer
        self.coach_client.patch(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/",
            {"answers": {"training_level": "beginner", "goal": "hypertrophy"}},
            format="json",
        )
        client, _ = self._activate_and_login_student()
        detail = client.get(f"/api/v1/me/visits/{self.visit.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertIn("goal", detail.data["answers"])
        self.assertNotIn("training_level", detail.data["answers"])
        self.assertNotIn("coach_private_notes", detail.data)

        bad = client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"training_level": "advanced"}},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)

    def test_expiry_and_finalized_block_student_write(self):
        send_visit_to_student(self.visit)
        client, _ = self._activate_and_login_student()
        self.visit.expires_at = timezone.now() - timedelta(hours=1)
        self.visit.save(update_fields=["expires_at"])
        expired = client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"goal": "fat_loss"}},
            format="json",
        )
        self.assertEqual(expired.status_code, 400)

        # Resend extends expiry
        resend = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/send-to-student/",
            {"expires_in_days": 7},
            format="json",
        )
        self.assertEqual(resend.status_code, 200)
        ok = client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"goal": "fat_loss"}},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        submit = client.post(f"/api/v1/me/visits/{self.visit.id}/submit/")
        self.assertEqual(submit.status_code, 200)
        # Finalize is blocked until coach explicitly starts review.
        blocked_finalize = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/finalize/"
        )
        self.assertEqual(blocked_finalize.status_code, 400)
        start = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/start-coach-review/"
        )
        self.assertEqual(start.status_code, 200)
        finalize = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/finalize/"
        )
        self.assertEqual(finalize.status_code, 200)
        after = client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"goal": "maintain"}},
            format="json",
        )
        self.assertEqual(after.status_code, 400)

    def test_coach_edit_preserves_student_revision_history(self):
        send_visit_to_student(self.visit)
        client, _ = self._activate_and_login_student()
        client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"goal": "fat_loss"}},
            format="json",
        )
        client.post(f"/api/v1/me/visits/{self.visit.id}/submit/")
        # Coach cannot edit until review starts
        blocked = self.coach_client.patch(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/",
            {"answers": {"goal": "hypertrophy"}},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        start = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/start-coach-review/"
        )
        self.assertEqual(start.status_code, 200)
        self.assertEqual(start.data["status"], "coach_review")
        # Student locked after submit / during review
        locked = client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"goal": "strength"}},
            format="json",
        )
        self.assertEqual(locked.status_code, 400)
        self.coach_client.patch(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/",
            {"answers": {"goal": "hypertrophy"}, "coach_private_notes": "secret"},
            format="json",
        )
        hist = self.coach_client.get(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/answer-revisions/?field_key=goal"
        )
        self.assertEqual(hist.status_code, 200)
        sources = [r["source"] for r in hist.data["results"]]
        self.assertIn("student", sources)
        self.assertIn("coach", sources)
        student_rows = [r for r in hist.data["results"] if r["source"] == "student"]
        self.assertTrue(any(r["value"] == "fat_loss" for r in student_rows))
        client2, _ = self._activate_and_login_student()
        detail = client2.get(f"/api/v1/me/visits/{self.visit.id}/")
        self.assertNotIn("coach_private_notes", detail.data)
        self.assertEqual(
            VisitAnswerRevision.objects.filter(visit=self.visit, field_key="goal").count() >= 2,
            True,
        )

    def test_coach_direct_finalize_path(self):
        visit = create_visit(
            self.coach,
            self.student,
            _payload(visit_date="2026-08-03", answers={"goal": "hypertrophy"}),
            actor=self.coach.user,
        )
        resp = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{visit.id}/finalize/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "finalized")

    def test_finalized_hides_fields_not_visible_when_finalized(self):
        send_visit_to_student(self.visit)
        client, _ = self._activate_and_login_student()
        client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"goal": "fat_loss", "injuries": ["knee"]}},
            format="json",
        )
        client.post(f"/api/v1/me/visits/{self.visit.id}/submit/")
        self.visit.refresh_from_db()
        start_coach_review(self.visit, actor=self.coach.user)
        self.visit.refresh_from_db()
        finalize_visit(self.visit, actor=self.coach.user)
        detail = client.get(f"/api/v1/me/visits/{self.visit.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertIn("goal", detail.data["answers"])
        self.assertNotIn("injuries", detail.data["answers"])  # visible_when_finalized=False

    def test_locks_after_submit_review_and_finalize(self):
        send_visit_to_student(self.visit)
        client, _ = self._activate_and_login_student()
        client.patch(
            f"/api/v1/me/visits/{self.visit.id}/",
            {"answers": {"goal": "fat_loss"}},
            format="json",
        )
        client.post(f"/api/v1/me/visits/{self.visit.id}/submit/")
        # student_submitted: student locked
        self.assertEqual(
            client.patch(
                f"/api/v1/me/visits/{self.visit.id}/",
                {"answers": {"goal": "x"}},
                format="json",
            ).status_code,
            400,
        )
        start = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/start-coach-review/"
        )
        self.assertEqual(start.status_code, 200)
        # coach_review: student still locked; coach can edit
        self.assertEqual(
            client.patch(
                f"/api/v1/me/visits/{self.visit.id}/",
                {"answers": {"goal": "x"}},
                format="json",
            ).status_code,
            400,
        )
        ok = self.coach_client.patch(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/",
            {"answers": {"goal": "hypertrophy"}},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        fin = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/finalize/"
        )
        self.assertEqual(fin.status_code, 200)
        self.assertEqual(
            self.coach_client.patch(
                f"/api/v1/students/{self.student.id}/visits/{self.visit.id}/",
                {"answers": {"goal": "strength"}},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            client.patch(
                f"/api/v1/me/visits/{self.visit.id}/",
                {"answers": {"goal": "x"}},
                format="json",
            ).status_code,
            400,
        )

    def test_activate_login_endpoint(self):
        resp = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/activate-login/",
            {"username": "portal_user", "initial_password": "123456"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["initial_password"], "123456")
        self.assertEqual(resp.data["username"], "portal_user")
        self.assertEqual(resp.data["portal_access"]["status"], "pending_activation")
        again = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/activate-login/",
            {"initial_password": "654321"},
            format="json",
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["initial_password"], "654321")
        self.assertEqual(again.data["username"], "portal_user")
        self.assertTrue(again.data["must_change_password"])

    def test_patch_ignores_non_coach_editable_answers_then_send(self):
        """Save-then-send must not fail when the full answers blob includes student-only keys."""
        sections = self.tpl.sections
        for section in sections:
            for field in section.get("fields") or []:
                if field["key"] == "goal":
                    field["coach_editable"] = False
                    field["student_editable"] = True
                    field["student_visible"] = True
        self.tpl.sections = sections
        self.tpl.save(update_fields=["sections", "updated_at"])

        visit = create_visit(
            self.coach,
            self.student,
            _payload(
                visit_date="2026-08-11",
                form_template_id=str(self.tpl.id),
                answers={"goal": "hypertrophy", "training_level": "intermediate"},
            ),
            actor=self.coach.user,
        )
        # Create bypasses coach_editable; update previously hard-failed on "goal".
        patch = self.coach_client.patch(
            f"/api/v1/students/{self.student.id}/visits/{visit.id}/",
            {
                "answers": {"goal": "fat_loss", "training_level": "advanced"},
                "current_weight_kg": "81.0",
            },
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.answers.get("training_level"), "advanced")
        # Student-only key is ignored on coach PATCH (create value remains).
        self.assertEqual(visit.answers.get("goal"), "hypertrophy")

        send = self.coach_client.post(
            f"/api/v1/students/{self.student.id}/visits/{visit.id}/send-to-student/",
            {"expires_in_days": 14},
            format="json",
        )
        self.assertEqual(send.status_code, 200)
        self.assertEqual(send.data["status"], "waiting_for_student")
