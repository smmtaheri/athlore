"""Phone-only HTTP login preserves existing account and domain identities."""

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import CoachProfile
from students.models import Student, StudentProfile


@override_settings(LOGIN_OTP_ENABLED=True, LOGIN_OTP_STATIC_CODE="1111")
class PhoneOnlyLoginTests(APITestCase):
    def setUp(self):
        self.coach_user = get_user_model().objects.create_user(
            username="legacy-coach@example.com", password="CoachPass123!"
        )
        self.coach = CoachProfile.objects.create(
            user=self.coach_user, display_name="Phone QA", phone_number="+989121111111"
        )
        self.student = Student.objects.create(
            coach=self.coach,
            full_name="Phone QA athlete",
            age=25,
            gender="male",
            height_cm=175,
            weight_kg=75,
            phone_number="+989122222222",
        )
        self.student_user = get_user_model().objects.create_user(
            username="legacy-athlete-not-a-phone", password="StudentPass123!"
        )
        self.profile = StudentProfile.objects.create(
            student=self.student,
            user=self.student_user,
            portal_enabled=True,
            account_activated_at=timezone.now(),
            must_change_password=False,
        )

    def test_both_legacy_routes_reject_even_correct_credentials_without_tokens(self):
        for path in ("/api/v1/auth/login/", "/api/v1/student/login/"):
            for user, password in (
                (self.coach_user, "CoachPass123!"),
                (self.student_user, "StudentPass123!"),
            ):
                with self.subTest(path=path, username=user.username):
                    response = self.client.post(
                        path,
                        {
                            "username": user.username,
                            "email": user.username,
                            "password": password,
                        },
                        format="json",
                    )
                    self.assertEqual(response.status_code, 410)
                    self.assertEqual(response.data["error"]["code"], "phone_login_required")
                    self.assertIn("شماره موبایل", response.data["error"]["message"])
                    self.assertNotIn("tokens", response.data)
                    self.assertFalse(response.cookies)

    def test_password_and_code_formats_keep_user_profile_password_and_student_owner(self):
        total_users = get_user_model().objects.count()
        for role, national, user, password, profile_key, profile_id in (
            ("coach", "9121111111", self.coach_user, "CoachPass123!", "coach", self.coach.id),
            (
                "student",
                "9122222222",
                self.student_user,
                "StudentPass123!",
                "student",
                self.student.id,
            ),
        ):
            original_username, original_hash = user.username, user.password
            for phone in (national, "0" + national, "98" + national, "+98" + national):
                for method in ("password", "code"):
                    with self.subTest(role=role, phone=phone, method=method):
                        response = self.client.post(
                            "/api/v1/auth/phone-login/",
                            {
                                "phone_number": phone,
                                "role": role,
                                "method": method,
                                "password": password,
                                "code": "1111",
                            },
                            format="json",
                        )
                        self.assertEqual(response.status_code, 200, response.data)
                        self.assertEqual(response.data["user"]["id"], str(user.pk))
                        self.assertEqual(response.data[profile_key]["id"], str(profile_id))
            user.refresh_from_db()
            self.assertEqual((user.username, user.password), (original_username, original_hash))
        self.assertEqual(get_user_model().objects.count(), total_users)
        self.student.refresh_from_db()
        self.assertEqual(self.student.coach_id, self.coach.id)

    def test_activation_does_not_replace_existing_internal_username(self):
        self.client.force_authenticate(self.coach_user)
        response = self.client.post(
            f"/api/v1/students/{self.student.id}/portal/set-initial-password/",
            {"initial_password": "123456", "username": "must-not-replace-identity"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.student_user.refresh_from_db()
        self.assertEqual(self.student_user.username, "legacy-athlete-not-a-phone")
        self.assertEqual(self.profile.pk, StudentProfile.objects.get(student=self.student).pk)
        self.client.force_authenticate(None)
        denied = self.client.post(
            "/api/v1/auth/phone-login/",
            {
                "phone_number": self.student.phone_number,
                "role": "student",
                "method": "code",
                "code": "1111",
            },
            format="json",
        )
        self.assertEqual(denied.status_code, 401)
        login = self.client.post(
            "/api/v1/auth/phone-login/",
            {
                "phone_number": self.student.phone_number,
                "role": "student",
                "method": "password",
                "password": "123456",
            },
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data["must_change_password"])

    def test_unknown_phone_does_not_create_an_account(self):
        before = get_user_model().objects.count()
        response = self.client.post(
            "/api/v1/auth/phone-login/",
            {
                "phone_number": "9123333333",
                "role": "student",
                "method": "code",
                "code": "1111",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(get_user_model().objects.count(), before)

    def test_phone_edit_changes_login_identifier_not_the_account_or_password(self):
        original_hash = self.student_user.password
        self.client.force_authenticate(self.coach_user)
        changed = self.client.patch(
            f"/api/v1/students/{self.student.id}/",
            {"phone_number": "09124444444"},
            format="json",
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.client.force_authenticate(None)
        for phone, expected_status in (("09124444444", 200), (self.student.phone_number, 401)):
            response = self.client.post(
                "/api/v1/auth/phone-login/",
                {
                    "phone_number": phone,
                    "role": "student",
                    "method": "password",
                    "password": "StudentPass123!",
                },
                format="json",
            )
            self.assertEqual(response.status_code, expected_status, response.data)
            if expected_status == 200:
                self.assertEqual(response.data["user"]["id"], str(self.student_user.pk))
                self.assertEqual(response.data["student"]["id"], str(self.student.pk))
        self.student_user.refresh_from_db()
        self.assertEqual(self.student_user.password, original_hash)
        self.assertEqual(self.student_user.username, "legacy-athlete-not-a-phone")
