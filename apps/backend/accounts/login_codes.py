"""Najva delivery and database-backed, single-use phone login challenges."""

import hmac
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import Throttled

from accounts.login_code_models import LoginCodeIpLimit, PhoneLoginChallenge
from accounts.models import CoachProfile
from common.sms import SmsConfigurationError, configuration, send_template_sms, sms_backend

TTL_SECONDS = 300
RESEND_SECONDS = 60
MAX_ATTEMPTS = 5
MAX_PHONE_REQUESTS = 5
MAX_IP_REQUESTS = 30


def _digest(scope: str, value: str) -> str:
    return salted_hmac(f"athlore-login-{scope}", value, algorithm="sha256").hexdigest()


def _challenge_key(phone: str, role: str) -> str:
    return _digest("phone", f"{role}:{phone}")


def _code_digest(key: str, nonce, code: str) -> str:
    return _digest("code", f"{key}:{nonce}:{code}")


def _configuration():
    if sms_backend() == "mock":
        code = str(getattr(settings, "LOGIN_OTP_MOCK_CODE", "") or "")
        if len(code) != 6 or not code.isascii() or not code.isdigit():
            raise SmsConfigurationError()
        return
    configuration(settings.NAJVA_TEMPLATE)


def _send_sms(phone: str, code: str) -> None:
    send_template_sms(phone=phone, template=settings.NAJVA_TEMPLATE, tokens={"token": code})


def _eligible(phone: str, role: str) -> bool:
    if role == "coach":
        return CoachProfile.objects.filter(phone_number=phone, user__is_active=True).exists()
    from students.models import StudentProfile

    return StudentProfile.objects.filter(
        student__phone_number=phone,
        portal_enabled=True,
        user__is_active=True,
        must_change_password=False,
        account_activated_at__isnull=False,
    ).exists()


def request_sms_code(*, phone: str, role: str, client_ip: str) -> dict:
    _configuration()
    mock_delivery = sms_backend() == "mock"
    now = timezone.now()
    key = _challenge_key(phone, role)
    nonce = uuid.uuid4()
    code = (
        str(settings.LOGIN_OTP_MOCK_CODE)
        if mock_delivery
        else str(secrets.randbelow(900000) + 100000)
    )
    with transaction.atomic():
        ip_limit, _ = LoginCodeIpLimit.objects.select_for_update().get_or_create(
            key=_digest("ip", client_ip or "unknown")
        )
        if now >= ip_limit.window_started_at + timedelta(hours=1):
            ip_limit.window_started_at, ip_limit.request_count = now, 0
        if ip_limit.request_count >= MAX_IP_REQUESTS:
            raise Throttled(wait=3600, detail="تعداد درخواست‌های ارسال کد زیاد است؛ بعداً تلاش کنید.")
        challenge, _ = PhoneLoginChallenge.objects.select_for_update().get_or_create(key=key)
        if challenge.last_requested_at and now < challenge.last_requested_at + timedelta(
            seconds=RESEND_SECONDS
        ):
            wait = max(
                1,
                int(
                    (
                        challenge.last_requested_at + timedelta(seconds=RESEND_SECONDS) - now
                    ).total_seconds()
                )
                + 1,
            )
            raise Throttled(wait=wait, detail="برای ارسال دوباره کد، یک دقیقه صبر کنید.")
        if now >= challenge.window_started_at + timedelta(hours=1):
            challenge.window_started_at, challenge.request_count = now, 0
        if challenge.request_count >= MAX_PHONE_REQUESTS:
            raise Throttled(
                wait=3600, detail="تعداد درخواست‌های این شماره زیاد است؛ بعداً تلاش کنید."
            )
        ip_limit.request_count += 1
        ip_limit.save()
        challenge.nonce, challenge.code_digest = nonce, ""
        challenge.last_requested_at, challenge.expires_at = now, now
        challenge.attempts = 0
        challenge.request_count += 1
        challenge.save()

    # Keep account existence private and do not send paid SMS to unregistered phones.
    if _eligible(phone, role):
        _send_sms(phone, code)
        PhoneLoginChallenge.objects.filter(key=key, nonce=nonce).update(
            code_digest=_code_digest(key, nonce, code),
            expires_at=timezone.now() + timedelta(seconds=TTL_SECONDS),
        )
    # These are temporary records, not account data; no separate cleanup service is needed.
    PhoneLoginChallenge.objects.filter(last_requested_at__lt=now - timedelta(days=1)).delete()
    LoginCodeIpLimit.objects.filter(window_started_at__lt=now - timedelta(days=1)).delete()
    return {
        "delivery_mode": "test" if mock_delivery else "sms",
        "message": (
            "در محیط آزمایشی پیامک واقعی ارسال نمی‌شود؛ از کد آزمایشی استفاده کنید."
            if mock_delivery
            else "در صورت فعال بودن حساب، کد ورود پیامک می‌شود. اعتبار کد ۵ دقیقه است."
        ),
        "expires_in_seconds": TTL_SECONDS,
        "retry_after_seconds": RESEND_SECONDS,
    }


def verify_sms_code(*, phone: str, role: str, code: str) -> bool:
    with transaction.atomic():
        challenge = (
            PhoneLoginChallenge.objects.select_for_update()
            .filter(key=_challenge_key(phone, role))
            .first()
        )
        if (
            challenge is None
            or not challenge.code_digest
            or challenge.expires_at <= timezone.now()
            or challenge.attempts >= MAX_ATTEMPTS
        ):
            return False
        challenge.attempts += 1
        valid = (
            len(code) == 6
            and code.isascii()
            and code.isdigit()
            and hmac.compare_digest(
                challenge.code_digest, _code_digest(challenge.key, challenge.nonce, code)
            )
        )
        if valid or challenge.attempts >= MAX_ATTEMPTS:
            challenge.code_digest = ""
        challenge.save(update_fields=["attempts", "code_digest"])
        return valid
