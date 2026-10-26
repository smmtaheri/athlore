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


def send_template_sms(
    *, phone: str, template: str, tokens: dict[str, str], event: str, reference_id: str = ""
) -> int:
    template = str(template or "").strip()
    recipient_suffix = phone[-4:] if len(phone) >= 4 else "unknown"

    try:
        backend = sms_backend()
    except SmsConfigurationError:
        logger.error(
            "SMS delivery state=not_sent reason=invalid_backend event=%s template=%s reference_id=%s",
            event,
            template or "unknown",
            reference_id or "none",
        )
        raise

    if backend == "mock":
        if not template:
            raise SmsConfigurationError()
        logger.info(
            "SMS delivery state=accepted_mock provider=mock event=%s template=%s "
            "recipient_suffix=%s reference_id=%s network_request=false",
            event,
            template,
            recipient_suffix,
            reference_id or "none",
        )
        return MOCK_MESSAGE_ID_BASE + time.time_ns() % 1_000_000_000

    if not phone.startswith("+98"):
        # Never strip a foreign calling code and deliver to an Iranian number.
        logger.warning(
            "SMS delivery state=not_sent reason=unsupported_country event=%s template=%s "
            "recipient_suffix=%s reference_id=%s",
            event,
            template or "unknown",
            recipient_suffix,
            reference_id or "none",
        )
        raise InternationalSmsUnavailable()

    try:
        key, sender, template = configuration(template)
    except SmsConfigurationError:
        logger.error(
            "SMS delivery state=not_sent reason=provider_configuration event=%s template=%s "
            "recipient_suffix=%s reference_id=%s",
            event,
            template or "unknown",
            recipient_suffix,
            reference_id or "none",
        )
        raise

    query = urlencode(
        {"sender": sender, "receptor": "0" + phone[3:], "template": template, **tokens}
    )
    connection = http.client.HTTPSConnection("sms.najva.com", timeout=20)
    http_status = None
    provider_status = None
    entry_status = None
    message_id = None
    try:
        logger.info(
            "SMS delivery state=request_started provider=najva event=%s template=%s "
            "recipient_suffix=%s reference_id=%s",
            event,
            template,
            recipient_suffix,
            reference_id or "none",
        )
        connection.request(
            "POST",
            f"/v1/{quote(key, safe='')}/verify/lookup.json?{query}",
            headers={"Accept": "application/json"},
        )
        response = connection.getresponse()
        http_status = response.status
        payload = json.loads(response.read(65536))
        result = payload.get("return") if isinstance(payload, dict) else None
        entries = payload.get("entries") if isinstance(payload, dict) else None
        provider_status = result.get("status") if isinstance(result, dict) else None
        entry = entries[0] if isinstance(entries, list) and len(entries) == 1 else None
        entry_status = entry.get("status") if isinstance(entry, dict) else None
        message_id = entry.get("messageid") if isinstance(entry, dict) else None
        if (
            response.status != 200
            or provider_status != 200
            or not isinstance(entries, list)
            or len(entries) != 1
            or not isinstance(entries[0], dict)
            or type(message_id) is not int
            or message_id <= 0
            or entry_status != 1
        ):
            logger.warning(
                "SMS delivery state=rejected provider=najva event=%s template=%s "
                "recipient_suffix=%s reference_id=%s http_status=%s provider_status=%s "
                "entry_status=%s message_id=%s",
                event,
                template,
                recipient_suffix,
                reference_id or "none",
                http_status,
                provider_status if isinstance(provider_status, int) else "invalid",
                entry_status if isinstance(entry_status, int) else "invalid",
                message_id if isinstance(message_id, int) else "none",
            )
            raise SmsDeliveryUnavailable()

        logger.info(
            "SMS delivery state=accepted provider=najva event=%s template=%s "
            "recipient_suffix=%s reference_id=%s http_status=%s provider_status=%s "
            "entry_status=%s message_id=%s",
            event,
            template,
            recipient_suffix,
            reference_id or "none",
            http_status,
            provider_status,
            entry_status,
            message_id,
        )
        return entries[0]["messageid"]
    except (OSError, http.client.HTTPException) as exc:
        # URLs contain secrets; never log URLs, bodies or exception text.
        logger.warning(
            "SMS delivery state=transport_error provider=najva event=%s template=%s "
            "recipient_suffix=%s reference_id=%s http_status=%s provider_status=%s "
            "entry_status=%s error_type=%s",
            event,
            template,
            recipient_suffix,
            reference_id or "none",
            http_status if http_status is not None else "none",
            provider_status if isinstance(provider_status, int) else "unknown",
            entry_status if isinstance(entry_status, int) else "unknown",
            type(exc).__name__,
        )
        raise SmsDeliveryUnavailable() from None
    except ValueError as exc:
        # JSON parsing failures are provider responses, not network failures.
        logger.warning(
            "SMS delivery state=invalid_response provider=najva event=%s template=%s "
            "recipient_suffix=%s reference_id=%s http_status=%s provider_status=%s "
            "entry_status=%s error_type=%s",
            event,
            template,
            recipient_suffix,
            reference_id or "none",
            http_status if http_status is not None else "none",
            provider_status if isinstance(provider_status, int) else "unknown",
            entry_status if isinstance(entry_status, int) else "unknown",
            type(exc).__name__,
        )
        raise SmsDeliveryUnavailable() from None
    finally:
        connection.close()
