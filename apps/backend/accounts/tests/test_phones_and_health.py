from __future__ import annotations

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from common.testing import auth_header, register


class RegistrationDisabledTests(APITestCase):
    def test_register_returns_403_when_disabled(self):
        with override_settings(PUBLIC_REGISTRATION_ENABLED=False):
            res = self.client.post(
                "/api/v1/auth/register/",
                {
                    "email": "blocked@example.com",
                    "password": "SecurePass123!",
                    "full_name": "Blocked",
                    "phone_number": "09129990001",
                },
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["error"]["code"], "registration_disabled")


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class PhoneUniquenessApiTests(APITestCase):
    def test_duplicate_coach_phone_on_register(self):
        first = register(
            self.client,
            "phone-a@example.com",
            phone_number="09128880001",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = register(
            self.client,
            "phone-b@example.com",
            phone_number="09128880001",
        )
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(second.data["error"]["code"], "coach_phone_already_exists")

    def test_duplicate_student_phone(self):
        coach = register(self.client, "stu-phone@example.com", phone_number="09128880010")
        auth = auth_header(coach.data["tokens"])
        payload = {
            "full_name": "S1",
            "age": 25,
            "gender": "male",
            "height_cm": "175.0",
            "weight_kg": "70.0",
            "phone_number": "09128880011",
            "goals": {"primary_goal": "hypertrophy"},
            "training_background": {"level": "beginner"},
        }
        first = self.client.post("/api/v1/students/", payload, format="json", **auth)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        second = self.client.post(
            "/api/v1/students/",
            {**payload, "full_name": "S2"},
            format="json",
            **auth,
        )
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(second.data["error"]["code"], "student_phone_already_exists")


class HealthEndpointTests(APITestCase):
    def test_health_unauthenticated(self):
        res = self.client.get("/api/v1/health/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "ok")
        self.assertEqual(res.data["database"], "ok")
