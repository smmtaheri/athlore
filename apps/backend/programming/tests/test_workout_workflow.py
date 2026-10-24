"""Visit preparation, publication boundaries and server-backed session progress."""

from copy import deepcopy
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import CoachProfile, Exercise
from programming.models import GenerationRun, Program, ProgramVersion, WorkoutSession
from programming.services.preparation import prepare_from_visit, validate_settings
from programming.services.programs import (
    activate_version,
    finalize_version,
    programs_for_student,
    serialize_student_program_detail,
)
from programming.services.regeneration import regenerate
from programming.services.workouts import finish_workout_session, save_progress
from students.models import Student, StudentProfile
from students.services import create_visit


@override_settings(PROGRAM_READY_SMS_ENABLED=False, SMS_BACKEND="mock")
class WorkoutWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user = get_user_model().objects.create_user(username="preparation-coach")
        cls.coach = CoachProfile.objects.create(user=user, display_name="Test Coach")
        cls.student = Student.objects.create(
            coach=cls.coach,
            full_name="Test Athlete",
            age=28,
            gender="male",
            height_cm=180,
            weight_kg=80,
            training_background={"level": "intermediate"},
            training_conditions={"training_days_per_week": 4, "session_duration_minutes": 90},
            equipment={"has_full_gym": True},
        )
        for muscle, names in {
            "سینه": ["پرس سینه هالتر", "پرس بالا سینه دمبل", "قفسه سینه دستگاه", "کراس اور کابل"],
            "زیربغل": ["زیربغل سیمکش", "زیربغل قایقی", "زیربغل دمبل تک", "پول اور کابل"],
            "پا": ["اسکوات هالتر", "جلو پا دستگاه", "پشت پا دستگاه", "پرس پا دستگاه"],
            "سرشانه": ["پرس سرشانه دمبل", "نشر جانب دمبل", "نشر خم دمبل", "فیس پول کابل"],
        }.items():
            for name in names:
                Exercise.objects.create(
                    coach=cls.coach, name=name, primary_muscle=muscle, level="intermediate"
                )

    def visit(self):
        return create_visit(
            self.coach,
            self.student,
            {
                "visit_date": date(2026, 10, 23),
                "current_weight_kg": 86,
                "previous_weight_kg": 86,
                "program_settings": {
                    "training_systems": [],
                    "sections": ["workout"],
                    "exercise_variety": "varied",
                    "session_muscles": [["سینه"], ["زیربغل"], ["پا"], ["سرشانه"]],
                },
            },
            actor=self.coach.user,
        )

    def active_program(self):
        program = Program.objects.create(
            coach=self.coach,
            student=self.student,
            title="Workout",
            program_type="workout",
            date_range_start=date(2026, 10, 1),
            date_range_end=date(2026, 10, 28),
        )
        version = ProgramVersion.objects.create(
            program=program,
            coach=self.coach,
            version_number=1,
            status="finalized",
            training={"days": [{"id": "day-1", "exercises": [{"id": "item-1", "sets": 3}]}]},
        )
        program.active_version = version
        program.save()
        return program, version

    def test_preparation_is_idempotent_and_generates_a_real_draft(self):
        visit = self.visit()
        first, run = prepare_from_visit(self.coach, self.coach.user, visit.id, "operation-123")
        again, _ = prepare_from_visit(self.coach, self.coach.user, visit.id, "operation-123")
        self.assertEqual(first.id, again.id)
        self.assertEqual(GenerationRun.objects.filter(program=first).count(), 1)
        self.assertTrue(run.resulting_version.training["days"])
        self.assertEqual(run.request["training_systems"], [])
        self.assertFalse(programs_for_student(self.student).filter(pk=first.id).exists())

    def test_missing_optional_template_falls_back_to_automatic_generation(self):
        visit = self.visit()
        visit.program_settings["template_id"] = str(uuid4())
        visit.save(update_fields=["program_settings", "updated_at"])

        program, run = prepare_from_visit(self.coach, self.coach.user, visit.id, "stale-template")

        self.assertTrue(run.resulting_version.training["days"])
        self.assertTrue(any("قالب انتخاب‌شده دیگر در دسترس نبود" in item for item in run.warnings))

    def test_visit_preparation_keeps_a_reviewable_draft_when_catalog_lacks_a_target(self):
        visit = self.visit()
        visit.program_settings["session_muscles"] = [["ساعد"], ["سینه"], ["زیربغل"], ["پا"]]
        visit.save(update_fields=["program_settings", "updated_at"])

        program, run = prepare_from_visit(self.coach, self.coach.user, visit.id, "missing-catalog")

        self.assertTrue(run.resulting_version.training["days"])
        self.assertTrue(
            any(item.startswith("missing_exercise_candidates:") for item in run.warnings)
        )
        self.assertEqual(run.status, GenerationRun.Status.SUCCEEDED)

    def test_progress_is_per_week_and_idempotent(self):
        program, _ = self.active_program()
        payload = {"week": 1, "day_id": "day-1", "exercise_id": "item-1", "completed_sets": [0, 1]}
        save_progress(self.student, program.id, payload)
        save_progress(self.student, program.id, payload)
        self.assertEqual(WorkoutSession.objects.count(), 1)
        self.assertEqual(
            save_progress(self.student, program.id, {**payload, "week": 2, "completed_sets": [0]})[
                "completed_sets"
            ],
            {"item-1": [0]},
        )
        self.assertEqual(WorkoutSession.objects.get(week=1).completed_sets, {"item-1": [0, 1]})

    def test_student_program_detail_resolves_missing_video_from_own_coach_catalog(self):
        program, version = self.active_program()
        exercise = Exercise.objects.create(
            coach=self.coach,
            name="پرس سینه ویدئودار",
            primary_muscle="سینه",
            tutorial_url="https://media.example.test/bench.mp4",
            tutorial_source_url="https://guide.example.test/bench-press",
        )
        version.training = {
            "days": [
                {
                    "id": "day-1",
                    "exercises": [
                        {
                            "id": "program-exercise-1",
                            "exercise_id": str(exercise.id),
                            "name": exercise.name,
                            "tutorial_url": "",
                            "sets": 3,
                        }
                    ],
                }
            ]
        }
        version.save(update_fields=["training", "updated_at"])

        result = serialize_student_program_detail(program)

        self.assertEqual(
            result["training"]["days"][0]["exercises"][0]["tutorial_url"],
            "https://media.example.test/bench.mp4",
        )
        self.assertEqual(
            result["training"]["days"][0]["exercises"][0]["tutorial_source_url"],
            "https://guide.example.test/bench-press",
        )
        version.refresh_from_db()
        self.assertEqual(version.training["days"][0]["exercises"][0]["tutorial_url"], "")

        for old_source, expected in [
            (
                "https://www.dvidshub.net/video/636933/dumbbell-shoulder-press",
                exercise.tutorial_source_url,
            ),
            ("https://coach.example/custom-tutorial", "https://coach.example/custom-tutorial"),
        ]:
            version.training["days"][0]["exercises"][0]["tutorial_source_url"] = old_source
            version.save(update_fields=["training"])
            refreshed = serialize_student_program_detail(program)
            self.assertEqual(
                refreshed["training"]["days"][0]["exercises"][0]["tutorial_source_url"], expected
            )
            version.refresh_from_db()
            self.assertEqual(
                version.training["days"][0]["exercises"][0]["tutorial_source_url"], old_source
            )

    def test_student_program_detail_does_not_resolve_another_coaches_video(self):
        program, version = self.active_program()
        other_user = get_user_model().objects.create_user(username="other-video-coach")
        other_coach = CoachProfile.objects.create(user=other_user, display_name="Other Coach")
        foreign_exercise = Exercise.objects.create(
            coach=other_coach,
            name="Private catalog video",
            primary_muscle="سینه",
            tutorial_url="https://media.example.test/private.mp4",
        )
        version.training = {
            "days": [
                {
                    "id": "day-1",
                    "exercises": [
                        {
                            "id": "program-exercise-1",
                            "exercise_id": str(foreign_exercise.id),
                            "name": foreign_exercise.name,
                            "tutorial_url": "",
                            "sets": 3,
                        }
                    ],
                }
            ]
        }
        version.save(update_fields=["training", "updated_at"])

        result = serialize_student_program_detail(program)

        self.assertEqual(result["training"]["days"][0]["exercises"][0]["tutorial_url"], "")

    def test_progress_saves_actual_reps_weight_and_rest_per_set(self):
        program, _ = self.active_program()
        first_week = {
            "week": 1,
            "day_id": "day-1",
            "exercise_id": "item-1",
            "completed_sets": [0],
            "set_logs": [
                {
                    "set_index": 0,
                    "completed": True,
                    "reps": 11,
                    "weight_kg": "32.5",
                    "rest_seconds": None,
                },
                {
                    "set_index": 1,
                    "completed": False,
                    "reps": None,
                    "weight_kg": None,
                    "rest_seconds": None,
                },
            ],
        }
        result = save_progress(self.student, program.id, first_week)
        self.assertEqual(result["set_logs"]["item-1"][0]["reps"], 11)
        self.assertEqual(result["set_logs"]["item-1"][0]["weight_kg"], 32.5)

        second_week = {
            **first_week,
            "week": 2,
            "completed_sets": [0],
            "set_logs": [
                {
                    "set_index": 0,
                    "completed": True,
                    "reps": 12,
                    "weight_kg": 35,
                    "rest_seconds": 96,
                }
            ],
        }
        result = save_progress(self.student, program.id, second_week)
        self.assertEqual(result["set_logs"]["item-1"][0]["rest_seconds"], 96)
        self.assertEqual(WorkoutSession.objects.count(), 2)
        self.assertEqual(
            WorkoutSession.objects.get(week=1).set_logs["item-1"][0]["weight_kg"], 32.5
        )

        with self.assertRaises(ValidationError):
            save_progress(
                self.student,
                program.id,
                {**second_week, "set_logs": [{"set_index": 0, "completed": False}]},
            )

    def test_finish_session_completes_untouched_exercises_and_preserves_explicit_partial_sets(self):
        program, version = self.active_program()
        version.training["days"][0]["exercises"].append({"id": "item-2", "sets": 2})
        version.save(update_fields=["training", "updated_at"])
        partial = {
            "week": 1,
            "day_id": "day-1",
            "exercise_id": "item-1",
            "completed_sets": [0],
            "set_logs": [
                {
                    "set_index": 0,
                    "completed": True,
                    "reps": 10,
                    "weight_kg": 30,
                    "rest_seconds": None,
                },
                {
                    "set_index": 1,
                    "completed": False,
                    "reps": 0,
                    "weight_kg": 0,
                    "rest_seconds": None,
                },
                {
                    "set_index": 2,
                    "completed": False,
                    "reps": None,
                    "weight_kg": None,
                    "rest_seconds": None,
                },
            ],
        }
        save_progress(self.student, program.id, partial)
        request = {"week": 1, "day_id": "day-1", "version_id": str(version.id)}

        result = finish_workout_session(self.student, program.id, request)
        first_finished_at = result["finished_at"]
        repeated = finish_workout_session(self.student, program.id, request)

        self.assertEqual(result["status"], WorkoutSession.Status.COMPLETED_PARTIAL)
        self.assertEqual(repeated["finished_at"], first_finished_at)
        self.assertEqual(WorkoutSession.objects.count(), 1)
        self.assertEqual(result["completed_sets"]["item-1"], [0])
        self.assertEqual(result["completed_sets"]["item-2"], [0, 1])
        self.assertEqual(result["set_logs"]["item-1"][1]["reps"], 0)
        self.assertFalse(result["set_logs"]["item-1"][1]["completed"])
        self.assertEqual(
            [item["completed"] for item in result["set_logs"]["item-2"]],
            [True, True],
        )

    def test_finishing_an_untouched_session_completes_once(self):
        program, version = self.active_program()
        request = {"week": 1, "day_id": "day-1", "version_id": str(version.id)}

        result = finish_workout_session(self.student, program.id, request)
        repeated = finish_workout_session(self.student, program.id, request)

        self.assertEqual(result["status"], WorkoutSession.Status.COMPLETED)
        self.assertEqual(result["completed_sets"]["item-1"], [0, 1, 2])
        self.assertEqual(repeated["finished_at"], result["finished_at"])
        self.assertEqual(WorkoutSession.objects.count(), 1)

    def test_pdf_workout_does_not_accept_progress(self):
        program, version = self.active_program()
        version.pdf_settings = {"deliverySections": {"workout": "uploaded"}}
        version.save()
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            save_progress(self.student, program.id, {"week": 1})

    def test_finalize_does_not_publish_or_schedule_sms_and_missing_pdf_blocks_activation(self):
        program, version = self.active_program()
        program.active_version = None
        program.save()
        version.status = "draft"
        version.pdf_settings = {"deliverySections": {"workout": "generated"}}
        version.save()
        with patch("programming.services.program_notifications.schedule_program_ready_sms") as sms:
            finalize_version(version, actor=self.coach.user)
            sms.assert_not_called()
            self.assertFalse(programs_for_student(self.student).filter(pk=program.id).exists())
            from common.exceptions import InvalidStateError

            with self.assertRaises(InvalidStateError):
                activate_version(program, version.id)

    def test_progress_api_owns_student_scope(self):
        program, _ = self.active_program()
        other_student = Student.objects.create(
            coach=self.coach,
            full_name="Other Athlete",
            age=28,
            gender="male",
            height_cm=180,
            weight_kg=80,
        )
        user = get_user_model().objects.create_user(username="workout-test-other-student")
        StudentProfile.objects.create(
            student=other_student,
            user=user,
            portal_enabled=True,
            must_change_password=False,
            account_activated_at=timezone.now(),
        )
        client = APIClient()
        client.force_authenticate(user)
        response = client.put(
            f"/api/v1/me/programs/{program.id}/workout-progress/",
            {
                "week": 1,
                "day_id": "day-1",
                "exercise_id": "item-1",
                "completed_sets": [0],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(WorkoutSession.objects.exists())

        coach_client = APIClient()
        coach_client.force_authenticate(self.coach.user)
        response = coach_client.get(f"/api/v1/me/programs/{program.id}/workout-progress/")
        self.assertEqual(response.status_code, 403)

    def test_progress_api_rejects_sets_outside_the_prescribed_count(self):
        program, _ = self.active_program()
        user = get_user_model().objects.create_user(username="workout-test-student")
        StudentProfile.objects.filter(student=self.student).delete()
        StudentProfile.objects.create(
            student=self.student,
            user=user,
            portal_enabled=True,
            must_change_password=False,
            account_activated_at=timezone.now(),
        )
        client = APIClient()
        client.force_authenticate(user)
        response = client.put(
            f"/api/v1/me/programs/{program.id}/workout-progress/",
            {"week": 1, "day_id": "day-1", "exercise_id": "item-1", "completed_sets": [3]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(WorkoutSession.objects.exists())

    def test_settings_reject_malformed_values_without_internal_errors(self):
        for settings in (
            {"sections": [{}]},
            {"exercise_variety": {}},
            {"template_id": "bad"},
            {"duration_weeks": True},
        ):
            with self.subTest(settings=settings), self.assertRaises(ValidationError):
                validate_settings(settings)

    def test_program_defaults_omit_template_id_when_template_was_deleted(self):
        self.coach.program_defaults = {"template_id": str(uuid4())}
        self.coach.save(update_fields=["program_defaults"])
        client = APIClient()
        client.force_authenticate(self.coach.user)

        response = client.get("/api/v1/me/program-defaults/")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("template_id", response.data)

    def test_student_cannot_list_or_download_an_unpublished_version_pdf(self):
        from delivery.models import PdfArtifact

        program, version = self.active_program()
        next_version = ProgramVersion.objects.create(
            program=program, coach=self.coach, version_number=2, status="finalized"
        )
        private_pdf = PdfArtifact.objects.create(
            coach=self.coach,
            student=self.student,
            program=program,
            program_version=next_version,
            status="ready",
            display_name="not published.pdf",
            original_filename="private.pdf",
        )
        user = get_user_model().objects.create_user(username="pdf-test-student")
        StudentProfile.objects.create(
            student=self.student,
            user=user,
            portal_enabled=True,
            must_change_password=False,
            account_activated_at=timezone.now(),
        )
        client = APIClient()
        client.force_authenticate(user)
        response = client.get(f"/api/v1/me/programs/{program.id}/pdf-files/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        response = client.get(f"/api/v1/me/pdf-files/{private_pdf.id}/download/")
        self.assertEqual(response.status_code, 404)

    def test_progress_merge_preserves_other_exercises_and_rejects_stale_version(self):
        program, version = self.active_program()
        version.training["days"][0]["exercises"].append({"id": "item-2", "sets": 2})
        version.save()
        payload = {"week": 1, "day_id": "day-1", "exercise_id": "item-1", "completed_sets": [0]}
        save_progress(self.student, program.id, payload)
        result = save_progress(self.student, program.id, {**payload, "exercise_id": "item-2"})
        self.assertEqual(result["completed_sets"], {"item-1": [0], "item-2": [0]})
        with self.assertRaises(ValidationError):
            save_progress(self.student, program.id, {**payload, "version_id": "stale-version"})

    def test_regeneration_rejects_stale_revision_and_changed_assessment(self):
        visit = self.visit()
        program, run = prepare_from_visit(
            self.coach, self.coach.user, visit.id, "regeneration-source"
        )
        version = ProgramVersion.objects.get(pk=run.resulting_version_id)
        with self.assertRaises(ValidationError):
            regenerate(self.coach, program.id, {"revision": "stale"})
        visit.answers = {**visit.answers, "injuries": ["neck"]}
        visit.save()
        with self.assertRaisesMessage(ValidationError, "ویزیت"):
            regenerate(self.coach, program.id, {"revision": version.updated_at.isoformat()})
        self.assertEqual(GenerationRun.objects.filter(program=program).count(), 1)

    def test_regeneration_preserves_locked_group_and_changes_another_day(self):
        visit = self.visit()
        program, run = prepare_from_visit(
            self.coach, self.coach.user, visit.id, "regeneration-locks"
        )
        version = ProgramVersion.objects.get(pk=run.resulting_version_id)
        day = version.training["days"][0]
        day["exercises"][0]["locked"] = True
        for item in day["exercises"][:2]:
            item["trainingGroupId"] = "locked-pair"
        version.save()
        locked_pair = deepcopy(day["exercises"][:2])
        fresh = deepcopy(version.training)
        for item in fresh["days"][1]["exercises"]:
            item["name"] += " پیشنهاد تازه"
        with patch(
            "programming.services.regeneration.generate_document",
            return_value=({"training": fresh}, []),
        ):
            from programming.services import programs
            from programming.services.generator import build_input_snapshot

            visit.refresh_from_db()
            program.student.refresh_from_db()
            template, _ = programs._build_quick_generation_template(
                coach=self.coach,
                student=program.student,
                request_data=run.request,
                requested_sessions=4,
            )
            snapshot = build_input_snapshot(
                coach=self.coach,
                student=program.student,
                visit=visit,
                template=template,
                request=run.request,
            )
            for key in ("student", "visit", "template", "rules_digest"):
                self.assertEqual(run.input_snapshot[key], snapshot[key], key)
            regenerate(self.coach, program.id, {"revision": version.updated_at.isoformat()})
        version.refresh_from_db()
        self.assertEqual(version.training["days"][0]["exercises"][:2], locked_pair)
        self.assertIn("پیشنهاد تازه", version.training["days"][1]["exercises"][0]["name"])
        self.assertEqual(GenerationRun.objects.filter(program=program).count(), 2)
