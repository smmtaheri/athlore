from __future__ import annotations

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from common.phone import InvalidPhoneError, normalize_iran_mobile, phones_equivalent
from common.testing import auth_header, register, unique_iran_mobile


class PhoneNormalizationTests(SimpleTestCase):
    def test_formats_and_digits(self):
        expected = "+989121234567"
        samples = [
            "09121234567",
            "989121234567",
            "+989121234567",
            "۰۹۱۲۱۲۳۴۵۶۷",
            "٠٩١٢١٢٣٤٥٦٧",
            "0912 123 4567",
            "(0912)-123-4567",
            "+98 912 123 4567",
        ]
        for sample in samples:
            self.assertEqual(normalize_iran_mobile(sample), expected, sample)

    def test_equivalent(self):
        self.assertTrue(phones_equivalent("09121234567", "+989121234567"))

    def test_invalid(self):
        with self.assertRaises(InvalidPhoneError):
            normalize_iran_mobile("12345")
        with self.assertRaises(InvalidPhoneError):
            normalize_iran_mobile("08121234567")


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class PhoneUniquenessApiTests(APITestCase):
    def test_student_phone_conflict_across_coaches(self):
        a = register(self.client, "phone-a@example.com", full_name="A")
        b = register(self.client, "phone-b@example.com", full_name="B")
        ha = auth_header(a.data["tokens"])
        hb = auth_header(b.data["tokens"])
        payload = {
            "full_name": "محمد",
            "age": 27,
            "gender": "male",
            "height_cm": "180.0",
            "weight_kg": "80.0",
            "phone_number": "09125556677",
            "goals": {"primary_goal": "hypertrophy"},
            "training_background": {"level": "intermediate"},
            "training_conditions": {"training_days_per_week": 4, "session_duration_minutes": 60},
        }
        first = self.client.post("/api/v1/students/", payload, format="json", **ha)
        self.assertEqual(first.status_code, 201, first.data)
        dup = self.client.post(
            "/api/v1/students/",
            {**payload, "phone_number": "+98 912 555 6677", "full_name": "دیگر"},
            format="json",
            **hb,
        )
        self.assertEqual(dup.status_code, 409, dup.data)
        self.assertEqual(dup.data["error"]["code"], "student_phone_already_exists")

    def test_coach_phone_conflict_on_register(self):
        phone = unique_iran_mobile("shared-coach-phone")
        first = register(self.client, "c1@example.com", phone_number=phone)
        self.assertEqual(first.status_code, 201, first.data)
        second = register(
            self.client,
            "c2@example.com",
            phone_number=phone.replace("+98", "0") if False else phone,
        )
        # same canonical via 09 form
        from common.phone import normalize_iran_mobile

        national = normalize_iran_mobile(phone)[3:]
        second = register(self.client, "c2@example.com", phone_number=f"0{national}")
        self.assertEqual(second.status_code, 409, second.data)
        self.assertEqual(second.data["error"]["code"], "coach_phone_already_exists")


class RegistrationDisabledTests(APITestCase):
    def test_registration_disabled_by_default_setting(self):
        with override_settings(PUBLIC_REGISTRATION_ENABLED=False):
            res = self.client.post(
                "/api/v1/auth/register/",
                {
                    "email": "blocked@example.com",
                    "password": "SecurePass123!",
                    "full_name": "Blocked",
                    "phone_number": "09120001122",
                },
                format="json",
            )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["error"]["code"], "registration_disabled")


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class ExportPdfApiTests(APITestCase):
    def test_rules_and_student_pdf_exports(self):
        reg = register(self.client, "pdf-export@example.com", full_name="آرمان")
        auth = auth_header(reg.data["tokens"])
        rules_pdf = self.client.get("/api/v1/me/coach-rules/pdf/", **auth)
        self.assertEqual(rules_pdf.status_code, 200, rules_pdf.content[:200])
        self.assertEqual(rules_pdf["Content-Type"], "application/pdf")
        self.assertTrue(rules_pdf.content.startswith(b"%PDF"))
        self.assertGreater(len(rules_pdf.content), 500)

        student = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "محمد طاهری",
                "age": 27,
                "gender": "male",
                "height_cm": "182.0",
                "weight_kg": "86.0",
                "phone_number": "09124445566",
                "goals": {"primary_goal": "hypertrophy", "weak_muscles": ["chest"]},
                "training_background": {"level": "intermediate"},
                "training_conditions": {
                    "training_days_per_week": 4,
                    "session_duration_minutes": 60,
                },
            },
            format="json",
            **auth,
        )
        self.assertEqual(student.status_code, 201, student.data)
        sid = student.data["id"]
        profile_pdf = self.client.get(f"/api/v1/students/{sid}/profile.pdf", **auth)
        self.assertEqual(profile_pdf.status_code, 200)
        self.assertTrue(profile_pdf.content.startswith(b"%PDF"))
        self.assertGreater(len(profile_pdf.content), 500)

        other = register(self.client, "other-pdf@example.com")
        other_auth = auth_header(other.data["tokens"])
        denied = self.client.get(f"/api/v1/students/{sid}/profile.pdf", **other_auth)
        self.assertEqual(denied.status_code, 404)
