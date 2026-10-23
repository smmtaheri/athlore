from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import CoachProfile, CoachRuleSet, ProgramTemplate
from common.testing import auth_header, register
from programming.models import Program, ProgramRequest, ProgramVersion
from programming.services import program_requests as request_services
from programming.services.generator import generate_document
from programming.services.programs import generate_program
from students.models import Student, Visit
from students.services import complete_student_setup, login_student, set_portal_initial_password

User = get_user_model()


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class ProgramRequestApiTests(TestCase):
    def setUp(self):
        coach_response = register(
            APIClient(),
            "request-coach@example.com",
            full_name="Coach",
        )
        self.coach_tokens = coach_response.data["tokens"]
        self.coach = CoachProfile.objects.get(pk=coach_response.data["coach"]["id"])
        self.student = Student.objects.create(
            coach=self.coach,
            full_name="Athlete",
            age=29,
            gender=Student.Gender.MALE,
            height_cm=177,
            weight_kg=81,
            phone_number="+989121234567",
            goals={"primary_goal": "hypertrophy", "secondary_goal": "قدرت"},
            injuries={"has_injury": False, "injury_type": "", "coach_private_marker": "hidden"},
            coach_notes="coach-only student note",
        )
        set_portal_initial_password(
            self.coach,
            self.student,
            username="program_request_athlete",
            initial_password="AthletePass123!",
        )
        pending = login_student(username="program_request_athlete", password="AthletePass123!")
        student_user = User.objects.get(pk=pending["user"]["id"])
        complete_student_setup(
            user=student_user,
            password="AthletePass456!",
            password_confirm="AthletePass456!",
        )
        session = login_student(username="program_request_athlete", password="AthletePass456!")
        self.student_client = APIClient()
        self.student_client.credentials(**auth_header(session["tokens"]))
        self.coach_client = APIClient()
        self.coach_client.credentials(**auth_header(self.coach_tokens))

    def test_student_request_is_idempotent_updates_only_student_context_and_hides_coach_fields(
        self,
    ):
        payload = {
            "purpose": "next",
            "sections": ["nutrition"],
            "assessment_mode": "online",
            "goal": "بهبود تغذیه",
            "injury_notes": "",
            "nutrition_notes": "بدون لبنیات",
        }
        first = self.student_client.post("/api/v1/me/program-requests/", payload, format="json")
        self.assertEqual(first.status_code, 201, first.content)
        request_id = first.data["id"]
        self.assertNotIn("coach_notes", first.data)
        self.assertNotIn("profile_snapshot", first.data)

        defaults = self.student_client.get("/api/v1/me/program-request-defaults/")
        self.assertEqual(defaults.status_code, 200, defaults.content)
        self.assertNotIn("profile", defaults.data)
        self.assertNotIn("coach_private_marker", str(defaults.data))

        duplicate = self.student_client.post("/api/v1/me/program-requests/", payload, format="json")
        self.assertEqual(duplicate.status_code, 200, duplicate.content)
        self.assertEqual(duplicate.data["id"], request_id)
        self.assertEqual(ProgramRequest.objects.filter(student=self.student).count(), 1)

        self.student.refresh_from_db()
        self.assertEqual(self.student.goals["secondary_goal"], "بهبود تغذیه")
        self.assertEqual(self.student.injuries["coach_private_marker"], "hidden")
        self.assertEqual(self.student.coach_notes, "coach-only student note")

        coach_list = self.coach_client.get("/api/v1/program-requests/")
        self.assertEqual(coach_list.status_code, 200, coach_list.content)
        self.assertEqual(coach_list.data["count"], 1)
        self.assertEqual(coach_list.data["unread_count"], 1)
        self.assertEqual(coach_list.data["results"][0]["sections"], ["nutrition"])
        self.assertNotIn("coach-only student note", str(coach_list.data))

    def test_coach_starts_a_request_without_creating_a_visit(self):
        created = self.student_client.post(
            "/api/v1/me/program-requests/",
            {"sections": ["workout"], "assessment_mode": "online"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)

        started = self.coach_client.post(
            f"/api/v1/program-requests/{created.data['id']}/start/",
            {"assessment_mode": "none"},
            format="json",
        )
        self.assertEqual(started.status_code, 200, started.content)
        self.assertEqual(started.data["status"], ProgramRequest.Status.IN_PROGRESS)
        self.assertIsNone(started.data["visit_id"])
        self.assertEqual(self.student.visits.count(), 0)

        read = self.coach_client.post("/api/v1/program-requests/mark-read/", {}, format="json")
        self.assertEqual(read.status_code, 200, read.content)
        self.assertEqual(read.data["updated"], 0)

    def test_requested_subset_is_persisted_and_used_for_active_section_defaults(self):
        created = self.student_client.post(
            "/api/v1/me/program-requests/",
            {"sections": ["nutrition"], "assessment_mode": "none"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        program = Program.objects.create(
            coach=self.coach,
            student=self.student,
            title="Food only",
            program_type=Program.ProgramType.COMPLETE,
            sections=["workout", "nutrition", "supplement"],
        )
        request_services.link_program(
            program=program,
            actor=self.coach.user,
            request_id=created.data["id"],
        )
        program.refresh_from_db()
        self.assertEqual(program.sections, ["nutrition"])

        version = ProgramVersion.objects.create(
            program=program,
            coach=self.coach,
            version_number=1,
            status=ProgramVersion.Status.FINALIZED,
        )
        program.active_version = version
        program.save(update_fields=["active_version"])
        self.assertEqual(request_services._active_sections(self.student), ["nutrition"])

    @patch("programming.services.programs.build_input_snapshot", return_value={})
    @patch("programming.services.programs.generate_document")
    def test_generation_for_request_is_limited_to_its_selected_sections(
        self, generate_document_mock, _snapshot_mock
    ):
        created = self.student_client.post(
            "/api/v1/me/program-requests/",
            {"sections": ["nutrition"], "assessment_mode": "none"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        rule_set, _ = CoachRuleSet.objects.get_or_create(coach=self.coach)
        template = ProgramTemplate.objects.create(
            rule_set=rule_set,
            coach=self.coach,
            name="Four days",
            level=ProgramTemplate.Level.INTERMEDIATE,
            days_per_week=4,
        )
        generate_document_mock.side_effect = lambda **kwargs: (
            {
                "title": "Nutrition plan",
                "program_type": "complete",
                "program_sections": kwargs["request"]["program_sections"],
                "date_range_label": "",
                "training": None,
                "nutrition": {"enabled": True},
                "supplements": None,
                "pdf_settings": {},
            },
            [],
        )

        program, run = generate_program(
            self.coach,
            {
                "student_id": str(self.student.id),
                "template_id": str(template.id),
                "program_type": "complete",
                "program_request_id": created.data["id"],
            },
        )
        self.assertEqual(
            generate_document_mock.call_args.kwargs["request"]["program_sections"], ["nutrition"]
        )
        self.assertEqual(program.sections, ["nutrition"])
        self.assertEqual(run.request["program_sections"], ["nutrition"])

    def test_visit_request_generation_carries_partial_rep_system_into_saved_draft(self):
        visit = Visit.objects.create(
            coach=self.coach,
            student=self.student,
            visit_date=date(2026, 10, 21),
            current_weight_kg=80,
            previous_weight_kg=81,
            daily_energy_level=Visit.Level.GOOD,
            sleep_quality=Visit.Level.MEDIUM,
            stress_level=Visit.Level.LOW,
            status=Visit.Status.FINALIZED,
            answers={"training": {"sessions_per_week": 4}},
        )
        request = ProgramRequest.objects.create(
            coach=self.coach,
            student=self.student,
            visit=visit,
            sections=["workout"],
            sessions_per_week=4,
            assessment_mode=ProgramRequest.AssessmentMode.IN_PERSON,
            status=ProgramRequest.Status.IN_PROGRESS,
        )
        rule_set, _ = CoachRuleSet.objects.get_or_create(coach=self.coach)
        template = ProgramTemplate.objects.create(
            rule_set=rule_set,
            coach=self.coach,
            name="Four-day visit test",
            level=ProgramTemplate.Level.INTERMEDIATE,
            days_per_week=4,
            split=["سینه", "زیربغل", "پا", "سرشانه"],
        )

        program, run = generate_program(
            self.coach,
            {
                "student_id": str(self.student.id),
                "template_id": str(template.id),
                "program_type": "workout",
                "program_request_id": str(request.id),
                "days_per_week": 4,
                "level": "intermediate",
                "date_range_start": "2026-10-22",
                "date_range_end": "2026-11-18",
                "training_systems": [{"key": "partial_reps", "variants": ["after_failure"]}],
            },
        )

        self.assertEqual(str(run.request["visit_id"]), str(visit.id))
        self.assertEqual(str(run.request["program_request_id"]), str(request.id))
        self.assertEqual(run.request["training_systems"][0]["variants"], ["after_failure"])
        self.assertEqual(program.sections, ["workout"])
        exercises = [
            item
            for day in ProgramVersion.objects.get(program=program).training["days"]
            for item in day["exercises"]
        ]
        self.assertTrue(any(item.get("partialReps") for item in exercises))

    @patch("programming.services.generator._generate_document_body", return_value=({}, []))
    @patch("programming.services.generator.merge_student_with_assessment")
    @patch("programming.services.generator.build_generation_context_from_visit", return_value={})
    @patch("programming.services.generator.latest_visit_for_generation")
    def test_explicit_request_without_visit_does_not_fall_back_to_latest_visit(
        self, latest_visit_mock, _visit_context_mock, merge_mock, body_mock
    ):
        merge_mock.return_value = {
            "goals": self.student.goals,
            "injuries": self.student.injuries,
            "training_background": self.student.training_background,
            "training_conditions": self.student.training_conditions,
            "equipment": self.student.equipment,
            "evidence": {},
        }
        generate_document(
            coach=self.coach,
            student=self.student,
            visit=None,
            template=SimpleNamespace(),
            request={"program_request_id": "a7f4c5b5-49ad-4bb0-bd9f-d67a83058e70"},
        )
        latest_visit_mock.assert_not_called()
        self.assertIsNone(body_mock.call_args.kwargs["visit"])
