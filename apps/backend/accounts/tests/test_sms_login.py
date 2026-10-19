"""Real-provider OTP contracts with mocked transport; never send paid SMS."""

import json
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.login_code_models import LoginCodeIpLimit, PhoneLoginChallenge
from accounts.models import CoachProfile
from students.models import Student, StudentProfile


@override_settings(
    LOGIN_OTP_ENABLED=True,
    LOGIN_OTP_PROVIDER="najva",
    LOGIN_OTP_STATIC_CODE="1111",
    NAJVA_API_KEY="fake-private-provider-key",
    NAJVA_SENDER="100005676",
    NAJVA_TEMPLATE="athlore",
)
class SmsLoginTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="old-coach", password="CoachPass123!"
        )
        self.coach = CoachProfile.objects.create(
            user=self.user, phone_number="+989121111111", display_name="SMS QA"
        )
        self.student = Student.objects.create(
            coach=self.coach,
            full_name="SMS athlete",
            age=25,
            gender="male",
            height_cm=175,
            weight_kg=75,
            phone_number="+989122222222",
        )
        self.student_user = get_user_model().objects.create_user(
            username="old-athlete", password="StudentPass123!"
        )
        self.profile = StudentProfile.objects.create(
            user=self.student_user,
            student=self.student,
            portal_enabled=True,
            must_change_password=False,
            account_activated_at=timezone.now(),
        )
        transport = patch("accounts.login_codes.http.client.HTTPSConnection")
        self.transport = transport.start()
        self.addCleanup(transport.stop)
        self.response = self.transport.return_value.getresponse.return_value
        self.response.status = 200
        self.response.read.return_value = json.dumps(
            {"return": {"status": 200}, "entries": [{"messageid": 42, "status": 1}]}
        ).encode()
        rng = patch("accounts.login_codes.secrets.randbelow", return_value=234567)
        self.rng = rng.start()
        self.addCleanup(rng.stop)

    def send(self, phone="9121111111", role="coach", ip="127.0.0.10"):
        return self.client.post(
            "/api/v1/auth/request-code/",
            {
                "phone_number": phone,
                "role": role,
            },
            format="json",
            REMOTE_ADDR=ip,
        )

    def login(self, code="334567", phone="9121111111", role="coach"):
        return self.client.post(
            "/api/v1/auth/phone-login/",
            {
                "phone_number": phone,
                "role": role,
                "method": "code",
                "code": code,
            },
            format="json",
        )

    def allow_resend(self):
        PhoneLoginChallenge.objects.update(last_requested_at=timezone.now() - timedelta(seconds=61))

    def test_provider_contract_and_hashed_state_do_not_expose_secrets(self):
        response = self.send()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["delivery_mode"], "sms")
        self.assertEqual(response.data["expires_in_seconds"], 300)
        self.assertEqual(response.data["retry_after_seconds"], 60)
        for secret in ("334567", "1111", "fake-private-provider-key"):
            self.assertNotIn(secret, str(response.data))
        self.assertFalse(response.cookies)
        self.assertNotIn("tokens", response.data)
        self.transport.assert_called_once_with("sms.najva.com", timeout=20)
        args, kwargs = self.transport.return_value.request.call_args
        self.assertEqual(args[0], "POST")
        url = urlsplit(args[1])
        self.assertEqual(url.path, "/v1/fake-private-provider-key/verify/lookup.json")
        self.assertEqual(kwargs, {"headers": {"Accept": "application/json"}})
        self.assertEqual(
            parse_qs(url.query),
            {
                "sender": ["100005676"],
                "receptor": ["09121111111"],
                "template": ["athlore"],
                "token": ["334567"],
            },
        )
        challenge = PhoneLoginChallenge.objects.get()
        self.assertEqual(len(challenge.code_digest), 64)
        self.assertNotIn("334567", challenge.code_digest)
        self.assertNotIn("9121111111", challenge.key)
        self.transport.return_value.close.assert_called_once()

    def test_both_roles_sign_in_to_existing_identities_and_cannot_replay(self):
        for role, phone, user in (
            ("coach", "9121111111", self.user),
            ("student", "9122222222", self.student_user),
        ):
            with self.subTest(role=role):
                self.assertEqual(self.send(phone, role).status_code, 200)
                login = self.login(phone=phone, role=role)
                self.assertEqual(login.status_code, 200, login.data)
                self.assertEqual(login.data["user"]["id"], str(user.pk))
                self.assertEqual(login.data["role"], role)
                self.assertEqual(self.login(phone=phone, role=role).status_code, 401)
        self.user.refresh_from_db()
        self.student_user.refresh_from_db()
        self.assertEqual(self.user.username, "old-coach")
        self.assertEqual(self.student_user.username, "old-athlete")
        self.assertEqual(get_user_model().objects.count(), 2)

    def test_fixed_code_and_codes_without_a_request_are_rejected(self):
        self.assertEqual(self.login().status_code, 401)
        self.send()
        self.assertEqual(self.login(code="1111").status_code, 401)
        self.assertEqual(self.login().status_code, 200)

    def test_persian_digits_and_phone_variants_match_the_same_challenge(self):
        self.assertEqual(self.send("+989121111111").status_code, 200)
        self.assertEqual(self.login("۳۳۴۵۶۷", "09121111111").status_code, 200)

    def test_expired_code_is_rejected(self):
        self.send()
        PhoneLoginChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.login().status_code, 401)

    def test_five_wrong_guesses_lock_the_challenge(self):
        self.send()
        for _ in range(5):
            self.assertEqual(self.login(code="000000").status_code, 401)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(PhoneLoginChallenge.objects.get().attempts, 5)

    def test_resend_invalidates_old_code_and_old_role_cannot_reuse_it(self):
        self.rng.side_effect = [123456, 234567]
        self.send()
        self.allow_resend()
        self.assertEqual(self.send().status_code, 200)
        self.assertEqual(self.login(code="223456").status_code, 401)
        self.assertEqual(self.login(role="student").status_code, 401)
        self.assertEqual(self.login().status_code, 200)

    def test_resend_cooldown_does_not_send_again_or_destroy_the_valid_code(self):
        self.send()
        response = self.send("+989121111111")
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response)
        self.assertEqual(self.transport.call_count, 1)
        self.assertEqual(self.login().status_code, 200)

    def test_phone_hourly_limit_cannot_be_bypassed_by_waiting_for_cooldown(self):
        for _ in range(5):
            self.assertEqual(self.send().status_code, 200)
            self.allow_resend()
        self.assertEqual(self.send().status_code, 429)
        self.assertEqual(self.transport.call_count, 5)

    def test_ip_hourly_limit_covers_multiple_unregistered_numbers(self):
        for i in range(30):
            self.assertEqual(self.send(f"91233{i:05d}").status_code, 200)
        self.assertEqual(self.send("9129999999").status_code, 429)
        self.assertEqual(LoginCodeIpLimit.objects.get().request_count, 30)
        self.transport.assert_not_called()

    def test_unknown_inactive_and_setup_pending_accounts_do_not_receive_sms(self):
        self.assertEqual(self.send("9129999999").status_code, 200)
        self.profile.must_change_password = True
        self.profile.save(update_fields=["must_change_password"])
        self.assertEqual(self.send("9122222222", "student").status_code, 200)
        self.assertEqual(self.login(phone="9122222222", role="student").status_code, 401)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertEqual(self.send().status_code, 200)
        self.transport.assert_not_called()
        self.assertEqual(get_user_model().objects.count(), 2)

    def test_missing_configuration_fails_closed_but_password_still_works(self):
        for config in (
            {"NAJVA_API_KEY": ""},
            {"NAJVA_SENDER": ""},
            {"NAJVA_SENDER": "invalid"},
            {"NAJVA_TEMPLATE": ""},
        ):
            with self.subTest(config=config), override_settings(**config):
                result = self.send()
                self.assertEqual(result.status_code, 503)
                self.assertEqual(result.data["error"]["code"], "sms_not_configured")
        self.assertEqual(self.login(code="1111").status_code, 401)
        self.transport.assert_not_called()
        login = self.client.post(
            "/api/v1/auth/phone-login/",
            {
                "phone_number": "9121111111",
                "role": "coach",
                "method": "password",
                "password": "CoachPass123!",
            },
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_transport_failures_do_not_issue_codes_or_leak_provider_errors(self):
        for result in (
            b"not-json",
            b'{"return": {"status": 424, "message": "fake-private-provider-key"}}',
            b'{"return": {"status": 200}, "entries": []}',
        ):
            with self.subTest(result=result):
                self.response.read.return_value = result
                response = self.send()
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("fake-private-provider-key", str(response.data))
                self.assertEqual(PhoneLoginChallenge.objects.get().code_digest, "")
                self.assertEqual(self.login().status_code, 401)
                self.allow_resend()
        self.response.read.side_effect = TimeoutError("sensitive provider detail")
        response = self.send()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("sensitive provider detail", str(response.data))

    def test_unaccepted_message_states_and_redirects_do_not_issue_a_code(self):
        for entry in (
            {"messageid": 0, "status": 1},
            {"messageid": 42, "status": 6},
            {"messageid": 42, "status": 15},
            {"messageid": "42", "status": 1},
            None,
        ):
            with self.subTest(entry=entry):
                self.response.read.return_value = json.dumps(
                    {"return": {"status": 200}, "entries": [entry]}
                ).encode()
                self.assertEqual(self.send().status_code, 503)
                self.assertEqual(self.login().status_code, 401)
                self.allow_resend()
        self.response.status = 302
        PhoneLoginChallenge.objects.update(request_count=0)
        self.assertEqual(self.send().status_code, 503)
        self.assertEqual(self.transport.call_count, 6)

    def test_url_encoding_and_transport_logs_do_not_leak_credentials(self):
        with override_settings(NAJVA_API_KEY="private/key?value", NAJVA_TEMPLATE="athlore&test"):
            self.assertEqual(self.send().status_code, 200)
        args, _ = self.transport.return_value.request.call_args
        self.assertIn("/v1/private%2Fkey%3Fvalue/verify/lookup.json?", args[1])
        self.assertEqual(parse_qs(urlsplit(args[1]).query)["template"], ["athlore&test"])
        self.allow_resend()
        self.transport.return_value.request.side_effect = OSError(
            "fake-private-provider-key token=334567 receptor=09121111111"
        )
        with self.assertLogs("accounts.login_codes", level="WARNING") as logs:
            response = self.send()
        self.assertEqual(response.status_code, 503)
        for secret in ("fake-private-provider-key", "334567", "09121111111"):
            self.assertNotIn(secret, str(response.data))
            self.assertNotIn(secret, str(logs.output))

    def test_failed_delivery_keeps_limits_and_never_falls_back_to_static_code(self):
        self.response.status = 500
        self.assertEqual(self.send().status_code, 503)
        self.assertEqual(self.send().status_code, 429)
        self.assertEqual(self.login(code="1111").status_code, 401)

    def test_disabled_code_login_does_not_contact_provider(self):
        with override_settings(LOGIN_OTP_ENABLED=False):
            self.assertEqual(self.send().status_code, 403)
            self.assertEqual(self.login().status_code, 401)
        self.transport.assert_not_called()

    def test_stale_challenges_and_ip_buckets_are_pruned(self):
        old = timezone.now() - timedelta(days=2)
        PhoneLoginChallenge.objects.create(key="old", last_requested_at=old)
        LoginCodeIpLimit.objects.create(key="old", window_started_at=old)
        self.send()
        self.assertFalse(PhoneLoginChallenge.objects.filter(key="old").exists())
        self.assertFalse(LoginCodeIpLimit.objects.filter(key="old").exists())
