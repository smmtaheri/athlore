from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from accounts.models import CoachProfile
from common.phone import InvalidPhoneError, normalize_mobile
from common.sms import InternationalSmsUnavailable, send_template_sms
from common.testing import auth_header, register
from students.models import Student
from students.services import set_portal_initial_password


class InternationalPhoneTests(SimpleTestCase):
    def test_international_and_existing_iranian_formats(self):
        for raw, expected in (
            ("۰۹۱۲۱۲۳۴۵۶۷", "+989121234567"),
            ("+44 7400 123456", "+447400123456"),
            ("+1 201 555 0123", "+12015550123"),
            ("+90 501 234 5678", "+905012345678"),
        ):
            self.assertEqual(normalize_mobile(raw), expected)

    def test_rejects_extra_trunk_zero_country_code_and_text(self):
        for raw in (
            "+9809121234567",
            "+98989121234567",
            "+4407400123456",
            "+98+9121234567",
            "hello+447400123456",
            "+442083661177",
        ):
            with self.subTest(raw=raw), self.assertRaises(InvalidPhoneError):
                normalize_mobile(raw)

    @override_settings(SMS_BACKEND="najva")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_foreign_sms_fails_explicitly_without_misdirecting_to_iran(self, connection):
        with self.assertRaises(InternationalSmsUnavailable):
            send_template_sms(
                phone="+447400123456",
                template="athlore_otp",
                tokens={"token": "123456"},
                event="sms_test",
            )
        connection.assert_not_called()

    @override_settings(SMS_BACKEND="mock")
    @patch("common.sms.http.client.HTTPSConnection")
    def test_foreign_mock_sms_stays_offline(self, connection):
        self.assertGreater(
            send_template_sms(
                phone="+447400123456",
                template="athlore_otp",
                tokens={"token": "123456"},
                event="sms_test",
            ),
            0,
        )
        connection.assert_not_called()


@override_settings(PUBLIC_REGISTRATION_ENABLED=True, SMS_BACKEND="mock")
class InternationalPhoneApiTests(APITestCase):
    def test_foreign_coach_and_student_password_login_country_and_uniqueness(self):
        response = register(self.client, "international@example.com", phone_number="+447400123456")
        self.assertEqual(response.status_code, 201, response.data)
        coach = CoachProfile.objects.get(pk=response.data["coach"]["id"])
        headers = auth_header(response.data["tokens"])
        payload = {
            "full_name": "International athlete",
            "age": 28,
            "gender": "male",
            "height_cm": "180",
            "weight_kg": "80",
            "phone_number": "+12015550123",
            "phone_country": "US",
            "goals": {"primary_goal": "hypertrophy"},
            "training_background": {"level": "intermediate"},
        }
        created = self.client.post("/api/v1/students/", payload, format="json", **headers)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["phone_country"], "US")
        student = Student.objects.get(pk=created.data["id"])
        set_portal_initial_password(coach, student, initial_password="InternationalPass123!")
        for phone, role in (("+447400123456", "coach"), ("+12015550123", "student")):
            if role == "coach":
                coach.user.set_password("InternationalPass123!")
                coach.user.save(update_fields=["password"])
            login = self.client.post(
                "/api/v1/auth/phone-login/",
                {
                    "phone_number": phone,
                    "role": role,
                    "method": "password",
                    "password": "InternationalPass123!",
                },
                format="json",
            )
            self.assertEqual(login.status_code, 200, login.data)
        duplicate = self.client.post(
            "/api/v1/students/",
            {**payload, "phone_number": "+1 201 555 0123"},
            format="json",
            **headers,
        )
        self.assertEqual(duplicate.status_code, 409)
        mismatch = self.client.patch(
            f"/api/v1/students/{student.pk}/", {"phone_country": "TR"}, format="json", **headers
        )
        self.assertEqual(mismatch.status_code, 400)
        student.refresh_from_db()
        self.assertEqual(student.phone_country, "US")
