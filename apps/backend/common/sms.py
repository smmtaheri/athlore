"""Najva template transport shared by login and program delivery."""

import http.client
import json
import logging
import time
from urllib.parse import quote, urlencode

from django.conf import settings
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)
MOCK_MESSAGE_ID_BASE = 9_000_000_000_000_000_000


class SmsDeliveryUnavailable(APIException):
    status_code = 503
    default_code = "sms_delivery_unavailable"
    default_detail = "ارسال پیامک انجام نشد؛ کمی بعد دوباره تلاش کنید یا با رمز عبور وارد شوید."


class SmsConfigurationError(SmsDeliveryUnavailable):
    default_code = "sms_not_configured"
    default_detail = (
        "تنظیمات سرویس پیامک کامل نیست؛ فعلاً با رمز عبور وارد شوید و به پشتیبانی اطلاع دهید."
    )


class InternationalSmsUnavailable(SmsDeliveryUnavailable):
    default_code = "international_sms_unavailable"
    default_detail = (
        "ارسال پیامک به شماره‌های خارج از ایران هنوز پشتیبانی نمی‌شود؛ با رمز عبور وارد شوید."
    )


def sms_backend() -> str:
    backend = str(getattr(settings, "SMS_BACKEND", "najva") or "").strip().lower()
    if backend not in {"mock", "najva"}:
        raise SmsConfigurationError()
    return backend


def configuration(template: str):
    key = str(settings.NAJVA_API_KEY or "").strip()
    sender = str(settings.NAJVA_SENDER or "").strip()
    template = str(template or "").strip()
    if not key or not sender.isascii() or not sender.isdigit() or not template:
        raise SmsConfigurationError()
    return key, sender, template


def send_template_sms(*, phone: str, template: str, tokens: dict[str, str]) -> int:
    backend = sms_backend()
    template = str(template or "").strip()
    if backend == "mock":
        if not template:
            raise SmsConfigurationError()
        logger.info("Mock SMS accepted; no external delivery (template=%s)", template)
        return MOCK_MESSAGE_ID_BASE + time.time_ns() % 1_000_000_000

    if not phone.startswith("+98"):
        # Never strip a foreign calling code and deliver to an Iranian number.
        raise InternationalSmsUnavailable()
    key, sender, template = configuration(template)
    query = urlencode(
        {"sender": sender, "receptor": "0" + phone[3:], "template": template, **tokens}
    )
    connection = http.client.HTTPSConnection("sms.najva.com", timeout=20)
    try:
        connection.request(
            "POST",
            f"/v1/{quote(key, safe='')}/verify/lookup.json?{query}",
            headers={"Accept": "application/json"},
        )
        response = connection.getresponse()
        payload = json.loads(response.read(65536))
        result = payload.get("return") if isinstance(payload, dict) else None
        entries = payload.get("entries") if isinstance(payload, dict) else None
        if (
            response.status != 200
            or not isinstance(result, dict)
            or result.get("status") != 200
            or not isinstance(entries, list)
            or len(entries) != 1
            or not isinstance(entries[0], dict)
            or type(entries[0].get("messageid")) is not int
            or entries[0]["messageid"] <= 0
            or entries[0].get("status") != 1
        ):
            provider_status = result.get("status") if isinstance(result, dict) else None
            logger.warning(
                "Najva rejected a delivery (HTTP %s, provider status %s)",
                response.status,
                provider_status if isinstance(provider_status, int) else "invalid",
            )
            raise SmsDeliveryUnavailable()
        return entries[0]["messageid"]
    except (OSError, http.client.HTTPException, ValueError) as exc:
        # URLs contain secrets; never log URLs, bodies or exception text.
        logger.warning("Najva delivery failed (%s)", type(exc).__name__)
        raise SmsDeliveryUnavailable() from None
    finally:
        connection.close()
