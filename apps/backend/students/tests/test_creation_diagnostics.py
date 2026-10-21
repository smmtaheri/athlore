import json
import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import CoachProfile
from students.models import Student


class StudentCreationDiagnosticsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username="creation-diagnostics-coach")
        cls.coach = CoachProfile.objects.create(user=cls.user, display_name="Diagnostics QA")

    def setUp(self):
        self.client.force_authenticate(self.user)

    def payload(self, **changes):
        return {
            "full_name": "Private athlete name",
            "phone_number": "09120000000",
            "age": 25,
            "gender": "male",
            "height_cm": "175.0",
            "weight_kg": "75.0",
            "coach_notes": "Private coaching notes",
            **changes,
        }

    def test_field_rejections_log_codes_and_correlation_without_submitted_values(self):
        cases = [
            ("phone_number", "+98 (912) 000 0000", "max_length"),
            ("height_cm", "175.25", "max_decimal_places"),
            ("weight_kg", "75.25", "max_decimal_places"),
        ]
        for field, value, code in cases:
            with self.subTest(field=field):
                with self.assertLogs("students.creation_diagnostics", level="WARNING") as logs:
                    response = self.client.post(
                        "/api/v1/students/", self.payload(**{field: value}), format="json"
                    )
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data["error"]["details"])
                event = json.loads(logs.records[0].getMessage())
                self.assertEqual(event["event"], "student_create_rejected")
                self.assertEqual(event["phase"], "validation")
                self.assertEqual(event["coach_id"], str(self.coach.pk))
                self.assertEqual(event["error_codes"], {field: [code]})
                self.assertEqual(event["request_id"], response["X-Request-ID"])
                uuid.UUID(hex=event["request_id"])
                for secret in (value, "Private athlete name", "Private coaching notes"):
                    self.assertNotIn(secret, logs.output[0])
        self.assertEqual(Student.objects.count(), 0)

    def test_duplicate_phone_keeps_existing_response_and_is_logged_as_a_conflict(self):
        created = self.client.post("/api/v1/students/", self.payload(), format="json")
        self.assertEqual(created.status_code, 201)
        with self.assertLogs("students.creation_diagnostics", level="WARNING") as logs:
            duplicate = self.client.post("/api/v1/students/", self.payload(), format="json")
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.data["error"]["code"], "student_phone_already_exists")
        event = json.loads(logs.records[0].getMessage())
        self.assertEqual(event["phase"], "persistence")
        self.assertEqual(event["error_codes"], "student_phone_already_exists")
        self.assertNotIn("09120000000", logs.output[0])
        self.assertEqual(Student.objects.count(), 1)

    def test_unknown_failure_logs_source_locations_without_exception_message(self):
        with patch(
            "students.views.services.create_student", side_effect=RuntimeError("secret data")
        ):
            with self.assertLogs("students.creation_diagnostics", level="ERROR") as logs:
                with self.assertRaises(RuntimeError):
                    self.client.post("/api/v1/students/", self.payload(), format="json")
        event = json.loads(logs.records[0].getMessage())
        self.assertEqual(event["event"], "student_create_failed")
        self.assertEqual(event["status"], 500)
        self.assertEqual(event["exception_type"], "RuntimeError")
        self.assertTrue(event["locations"])
        self.assertNotIn("secret data", logs.output[0])
        self.assertNotIn("09120000000", logs.output[0])

    def test_malformed_json_and_auth_failures_are_logged_without_reading_the_body(self):
        with self.assertLogs("students.creation_diagnostics", level="WARNING") as logs:
            response = self.client.post(
                "/api/v1/students/", '{"password": "private', content_type="application/json"
            )
        self.assertEqual(response.status_code, 400)
        event = json.loads(logs.records[0].getMessage())
        self.assertEqual(event["error_codes"], "parse_error")
        self.assertNotIn("private", logs.output[0])
        self.client.force_authenticate(None)
        with self.assertLogs("students.creation_diagnostics", level="WARNING") as logs:
            response = self.client.post("/api/v1/students/", self.payload(), format="json")
        self.assertEqual(response.status_code, 401)
        event = json.loads(logs.records[0].getMessage())
        self.assertEqual(event["phase"], "request")
        self.assertIsNone(event["actor_id"])
        with self.assertLogs("students.creation_diagnostics", level="WARNING") as logs:
            response = self.client.post(
                "/api/v1/students/",
                self.payload(),
                format="json",
                HTTP_AUTHORIZATION="Bearer invalid-token",
            )
        self.assertEqual(response.status_code, 401)
        event = json.loads(logs.records[0].getMessage())
        self.assertIsNone(event["actor_id"])

    def test_successful_create_and_unrelated_get_do_not_emit_failure_diagnostics(self):
        with patch("students.creation_diagnostics.logger.log") as log:
            response = self.client.post("/api/v1/students/", self.payload(), format="json")
            self.assertEqual(response.status_code, 201)
            self.client.force_authenticate(None)
            self.assertEqual(self.client.get("/api/v1/students/").status_code, 401)
        log.assert_not_called()
