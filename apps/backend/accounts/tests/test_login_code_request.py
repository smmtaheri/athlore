from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import CoachProfile


@override_settings(
    LOGIN_OTP_ENABLED=True,
    LOGIN_OTP_PROVIDER="najva",
    SMS_BACKEND="mock",
    LOGIN_OTP_MOCK_CODE="123456",
)
class LoginCodeRequestTests(APITestCase):
    def request_code(self, phone="9121112222", role="coach"):
        return self.client.post(
            "/api/v1/auth/request-code/",
            {"phone_number": phone, "role": role},
            format="json",
        )

    def test_request_is_anonymous_for_both_roles_without_creating_a_session_or_account(self):
        users_before = get_user_model().objects.count()
        coaches_before = CoachProfile.objects.count()
        for role in ("coach", "student"):
            with self.subTest(role=role):
                response = self.request_code(role=role)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["delivery_mode"], "test")
                self.assertIn("پیامک واقعی ارسال نمی‌شود", response.data["message"])
                self.assertNotIn("1111", response.data["message"])
                self.assertNotIn("tokens", response.data)
                self.assertFalse(response.cookies)
        self.assertEqual(get_user_model().objects.count(), users_before)
        self.assertEqual(CoachProfile.objects.count(), coaches_before)

    def test_supported_phone_formats_are_accepted(self):
        for phone in (
            "9121112222",
            "09121112223",
            "989121112224",
            "+989121112225",
            "۹۱۲۱۱۱۲۲۲۶",
        ):
            with self.subTest(phone=phone):
                self.assertEqual(self.request_code(phone).status_code, 200)

    def test_disabled_or_unconfigured_delivery_is_explicitly_rejected(self):
        with override_settings(LOGIN_OTP_ENABLED=False):
            response = self.request_code()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "otp_unavailable")
        self.assertIn("رمز عبور", response.data["error"]["message"])
        self.assertNotIn("1111", str(response.data))

        with override_settings(LOGIN_OTP_MOCK_CODE=""):
            misconfigured = self.request_code()
        self.assertEqual(misconfigured.status_code, 503)
        self.assertEqual(misconfigured.data["error"]["code"], "sms_not_configured")

    def test_invalid_phone_and_role_do_not_acknowledge_a_request(self):
        for phone, role in (("123", "coach"), ("", "student"), ("9121112222", "admin")):
            with self.subTest(phone=phone, role=role):
                response = self.request_code(phone, role)
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("delivery_mode", response.data)

    def test_request_then_code_login_keeps_the_same_coach_identity(self):
        user = get_user_model().objects.create_user(username="otp-qa-coach", password="OtpPass123!")
        coach = CoachProfile.objects.create(
            user=user, display_name="OTP QA", phone_number="+989121112222"
        )
        self.assertEqual(self.request_code().status_code, 200)
        fixed_code = self.client.post(
            "/api/v1/auth/phone-login/",
            {"phone_number": "9121112222", "role": "coach", "method": "code", "code": "1111"},
            format="json",
        )
        self.assertEqual(fixed_code.status_code, 401)
        login = self.client.post(
            "/api/v1/auth/phone-login/",
            {"phone_number": "9121112222", "role": "coach", "method": "code", "code": "123456"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["user"]["id"], str(user.pk))
        self.assertEqual(login.data["coach"]["id"], str(coach.pk))
        self.assertEqual(CoachProfile.objects.count(), 1)

    def test_password_login_is_unchanged_when_code_delivery_is_disabled(self):
        user = get_user_model().objects.create_user(
            username="password-qa-coach", password="OtpPass123!"
        )
        CoachProfile.objects.create(
            user=user, display_name="Password QA", phone_number="+989121112222"
        )
        with override_settings(LOGIN_OTP_ENABLED=False):
            self.assertEqual(self.request_code().status_code, 403)
            login = self.client.post(
                "/api/v1/auth/phone-login/",
                {
                    "phone_number": "9121112222",
                    "role": "coach",
                    "method": "password",
                    "password": "OtpPass123!",
                },
                format="json",
            )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["user"]["id"], str(user.pk))
