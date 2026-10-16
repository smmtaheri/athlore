from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.test import APITestCase

from accounts.exercise_errors import DUPLICATE_MESSAGE
from accounts.models import CoachProfile, Exercise


class ExerciseSaveErrorTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username="exercise-error-coach")
        cls.coach = CoachProfile.objects.create(user=cls.user, display_name="Exercise QA")

    def setUp(self):
        self.client.force_authenticate(self.user)

    def payload(self, name="QA exercise"):
        return {
            "name": name,
            "targets": [{"muscle_key": "chest", "region_key": None, "role": "primary"}],
            "levels": ["beginner", "intermediate"],
            "equipment_keys": ["cable"],
        }

    def create(self, payload):
        return self.client.post("/api/v1/exercises/", payload, format="json")

    def test_duplicate_active_and_archived_names_have_an_explicit_message(self):
        for archived in (False, True):
            with self.subTest(archived=archived):
                payload = self.payload(f"Duplicate {archived}")
                created = self.create(payload)
                self.assertEqual(created.status_code, 201, created.data)
                if archived:
                    self.client.delete(f"/api/v1/exercises/{created.data['id']}/")
                response = self.create(payload)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["error"]["code"], "exercise_duplicate")
                self.assertEqual(response.data["error"]["message"], DUPLICATE_MESSAGE)
                self.assertEqual(Exercise.objects.filter(name=payload["name"]).count(), 1)

    def test_duplicate_edit_rolls_back_and_can_be_corrected(self):
        self.create(self.payload("Existing name"))
        created = self.create(self.payload("Original name"))
        exercise = Exercise.objects.get(pk=created.data["id"])
        url = f"/api/v1/exercises/{exercise.pk}/"
        response = self.client.patch(
            url,
            {"name": "Existing name", "coach_notes": "Must be rolled back", "equipment_keys": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data["error"]["code"], "exercise_duplicate")
        exercise.refresh_from_db()
        self.assertEqual(exercise.name, "Original name")
        self.assertEqual(exercise.coach_notes, "")
        self.assertEqual(
            list(exercise.equipment_rows.values_list("equipment__key", flat=True)), ["cable"]
        )
        retry = self.client.patch(url, {"name": "Corrected name"}, format="json")
        self.assertEqual(retry.status_code, 200, retry.data)

    def test_same_name_is_allowed_for_another_muscle_or_coach(self):
        self.assertEqual(self.create(self.payload()).status_code, 201)
        other_muscle = self.payload()
        other_muscle["targets"][0]["muscle_key"] = "quadriceps"
        self.assertEqual(self.create(other_muscle).status_code, 201)
        user = get_user_model().objects.create_user(username="other-exercise-coach")
        CoachProfile.objects.create(user=user, display_name="Other coach")
        self.client.force_authenticate(user)
        self.assertEqual(self.create(self.payload()).status_code, 201)

    def test_known_validation_errors_identify_what_needs_correction(self):
        cases = [
            ({"name": ""}, "نام فارسی"),
            ({"targets": []}, "عضله اصلی"),
            ({"targets": [{"muscle_key": "missing", "role": "primary"}]}, "عضله انتخاب‌شده"),
            (
                {"targets": [{"muscle_key": "chest", "region_key": "missing", "role": "primary"}]},
                "ناحیه انتخاب‌شده",
            ),
            (
                {"primary_muscle": "سینه", "targets": [{"muscle_key": "chest", "role": "invalid"}]},
                "نوع اتصال عضله",
            ),
            (
                {
                    "primary_muscle": "سینه",
                    "targets": [{"muscle_key": "chest", "role": "secondary"}],
                },
                "دقیقاً یک عضله اصلی",
            ),
            ({"equipment_keys": ["missing"]}, "تجهیزات انتخاب‌شده"),
            ({"levels": ["expert"]}, "سطح تمرینی"),
            ({"priority": "invalid"}, "اولویت حرکت"),
            ({"aliases": [42]}, "نام‌های جایگزین"),
            ({"aliases": "invalid"}, "ساختار اطلاعات ارسالی"),
            ({"external_key": "invalid key"}, "شناسه مرجع"),
        ]
        for changes, expected in cases:
            with self.subTest(changes=changes):
                response = self.create({**self.payload(), **changes})
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(response.data["error"]["code"], "exercise_validation_error")
                self.assertIn(expected, response.data["error"]["message"])
                self.assertNotIn("error_id", response.data["error"]["details"])
                self.assertFalse(Exercise.objects.exists())

    def test_duplicate_external_key_is_explained(self):
        self.create({**self.payload(), "external_key": "same-key"})
        response = self.create({**self.payload("Other name"), "external_key": "same-key"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("شناسه مرجع این حرکت قبلاً", response.data["error"]["message"])

    def test_postgresql_duplicate_constraint_is_recognized(self):
        cause = Exception("database detail")
        cause.diag = SimpleNamespace(constraint_name="uniq_coach_exercise_name_muscle")
        error = IntegrityError("database detail")
        error.__cause__ = cause
        with patch("accounts.rules_services.create_exercise", side_effect=error):
            response = self.create(self.payload())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "exercise_duplicate")

    def test_unknown_validation_is_logged_with_the_returned_reference(self):
        with (
            patch(
                "accounts.rules_services.create_exercise",
                side_effect=ValidationError({"future_field": ["Unclassified validation"]}),
            ),
            self.assertLogs("accounts.exercise_errors", level="WARNING") as logs,
        ):
            response = self.create(self.payload())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "exercise_save_unknown")
        error_id = response.data["error"]["details"]["error_id"]
        self.assertRegex(error_id, r"^[a-f0-9]{32}$")
        self.assertIn(error_id, logs.output[0])
        self.assertIn("future_field", logs.output[0])
        self.assertIn("POST", logs.output[0])
        self.assertNotIn("Unclassified validation", str(response.data))

    def test_unexpected_failure_is_logged_without_exposing_internal_details(self):
        for error in (
            RuntimeError("private-server-detail"),
            IntegrityError("unrelated constraint"),
            APIException("private-api-detail"),
        ):
            with (
                self.subTest(error=type(error).__name__),
                patch("accounts.rules_services.create_exercise", side_effect=error),
                self.assertLogs("accounts.exercise_errors", level="ERROR") as logs,
            ):
                response = self.create(self.payload())
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.data["error"]["code"], "exercise_save_unknown")
                self.assertIn(response.data["error"]["details"]["error_id"], logs.output[0])
                self.assertIn(str(error), logs.output[0])
                self.assertNotIn(str(error), str(response.data))

    def test_malformed_json_is_a_known_error(self):
        response = self.client.post(
            "/api/v1/exercises/", '{"name":', content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "exercise_validation_error")
        self.assertIn("به‌درستی ارسال نشده", response.data["error"]["message"])

    def test_access_checks_remain_unchanged(self):
        created = self.create(self.payload())
        user = get_user_model().objects.create_user(username="unauthorized-exercise-coach")
        CoachProfile.objects.create(user=user, display_name="Other coach")
        self.client.force_authenticate(user)
        denied = self.client.patch(
            f"/api/v1/exercises/{created.data['id']}/", {"name": "Changed"}, format="json"
        )
        self.assertEqual(denied.status_code, 404)
        self.assertEqual(denied.data["error"]["code"], "not_found")
        self.client.force_authenticate(None)
        unauthenticated = self.create(self.payload())
        self.assertEqual(unauthenticated.status_code, 401)
