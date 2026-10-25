"""Canonical E.164 mobile normalization, including existing Iranian input formats."""

from __future__ import annotations

import re

import phonenumbers
from rest_framework.exceptions import ValidationError

# Persian / Arabic-Indic digits → ASCII
_DIGIT_TRANSLATION = str.maketrans(
    {
        "۰": "0",
        "۱": "1",
        "۲": "2",
        "۳": "3",
        "۴": "4",
        "۵": "5",
        "۶": "6",
        "۷": "7",
        "۸": "8",
        "۹": "9",
        "٠": "0",
        "١": "1",
        "٢": "2",
        "٣": "3",
        "٤": "4",
        "٥": "5",
        "٦": "6",
        "٧": "7",
        "٨": "8",
        "٩": "9",
    }
)

_FORMATTING_RE = re.compile(r"[\s\-\(\)\.\,_/]+")
_CANONICAL_RE = re.compile(r"^\+989\d{9}$")


class InvalidPhoneError(ValueError):
    """Raised when a phone number cannot be normalized to a valid mobile."""

    def __init__(self, message: str = "شماره موبایل معتبر نیست."):
        super().__init__(message)
        self.message = message


def _to_ascii_digits(value: str) -> str:
    return value.translate(_DIGIT_TRANSLATION)


def normalize_iran_mobile(raw: str | None, *, required: bool = True) -> str | None:
    """Normalize an Iranian mobile number to +989XXXXXXXXX.

    Accepts 09…, 989…, +989…, Persian/Arabic digits, and common formatting.
    Returns None only when required=False and input is empty/blank.
    """
    if raw is None:
        if required:
            raise InvalidPhoneError("شماره موبایل الزامی است.")
        return None

    text = _to_ascii_digits(str(raw)).strip()
    if not text:
        if required:
            raise InvalidPhoneError("شماره موبایل الزامی است.")
        return None

    # Keep leading + then strip formatting
    has_plus = text.startswith("+")
    text = _FORMATTING_RE.sub("", text)
    if has_plus and not text.startswith("+"):
        text = "+" + text
    # Remove any remaining non-digit except leading +
    if text.startswith("+"):
        digits = "+" + re.sub(r"\D", "", text[1:])
    else:
        digits = re.sub(r"\D", "", text)

    # Strip trunk/country variants into national 9XXXXXXXXX (10 digits starting with 9)
    national: str | None = None
    if digits.startswith("+98"):
        national = digits[3:]
    elif digits.startswith("0098"):
        national = digits[4:]
    elif digits.startswith("98") and len(digits) >= 12:
        national = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        national = digits[1:]
    elif digits.startswith("9") and len(digits) == 10:
        national = digits
    else:
        raise InvalidPhoneError("شماره موبایل باید به صورت ۰۹۱۲۱۲۳۴۵۶۷ یا +۹۸۹۱۲۱۲۳۴۵۶۷ باشد.")

    if not re.fullmatch(r"9\d{9}", national or ""):
        raise InvalidPhoneError("شماره موبایل ایران باید ۱۰ رقم و با ۹ شروع شود (مثلاً ۹۱۲۱۲۳۴۵۶۷).")

    canonical = f"+98{national}"
    if not _CANONICAL_RE.fullmatch(canonical):
        raise InvalidPhoneError("شماره موبایل معتبر نیست.")
    return canonical


def normalize_iran_mobile_or_validation_error(
    raw: str | None,
    *,
    required: bool = True,
    field: str = "phone_number",
) -> str | None:
    """DRF-friendly wrapper that raises ValidationError with Persian messages."""
    try:
        return normalize_iran_mobile(raw, required=required)
    except InvalidPhoneError as exc:
        raise ValidationError({field: [exc.message]}) from exc


def normalize_mobile(raw: str | None, *, required: bool = True) -> str | None:
    """Store all phones as E.164; unqualified legacy numbers still mean Iran.

    Country-selecting clients submit a complete +calling-code number. Explicit
    international numbers must already have their national trunk prefix removed.
    """
    text = _FORMATTING_RE.sub("", _to_ascii_digits(str(raw or "")).strip())
    if not text:
        if required:
            raise InvalidPhoneError("شماره موبایل الزامی است.")
        return None
    if not re.fullmatch(r"\+?[0-9]+", text):
        raise InvalidPhoneError("شماره موبایل فقط باید شامل رقم و پیش‌شمارهٔ کشور باشد.")
    if text.startswith("0098") or not text.startswith("+") or text.startswith("+98"):
        return normalize_iran_mobile(text, required=required)
    if not re.fullmatch(r"\+[1-9][0-9]{7,14}", text):
        raise InvalidPhoneError("شماره موبایل بین‌المللی معتبر نیست.")
    try:
        phone = phonenumbers.parse(text, None)
    except phonenumbers.NumberParseException as exc:
        raise InvalidPhoneError("کشور و شماره موبایل معتبر نیستند.") from exc
    canonical = phonenumbers.format_number(phone, phonenumbers.PhoneNumberFormat.E164)
    if (
        canonical != text
        or not phonenumbers.is_valid_number(phone)
        or phonenumbers.number_type(phone)
        not in {
            phonenumbers.PhoneNumberType.MOBILE,
            phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
        }
    ):
        raise InvalidPhoneError(
            "شماره موبایل برای کشور انتخاب‌شده معتبر نیست؛ صفر و کد کشور را دوباره وارد نکنید."
        )
    return canonical


def normalize_mobile_or_validation_error(
    raw: str | None, *, required: bool = True, field: str = "phone_number"
) -> str | None:
    try:
        return normalize_mobile(raw, required=required)
    except InvalidPhoneError as exc:
        raise ValidationError({field: [exc.message]}) from exc


def mobile_country(phone: str, country: str | None = None) -> str:
    """Validate the selected region, including regions sharing a calling code."""
    parsed = phonenumbers.parse(phone, None)
    selected = str(country or phonenumbers.region_code_for_number(parsed) or "").upper()
    if selected not in phonenumbers.SUPPORTED_REGIONS:
        raise ValidationError({"phone_country": ["کشور شماره موبایل معتبر نیست."]})
    if selected == "IR" and phone.startswith("+98"):
        return selected
    if not phonenumbers.is_valid_number_for_region(parsed, selected):
        raise ValidationError({"phone_number": ["شماره موبایل با کشور انتخاب‌شده مطابقت ندارد."]})
    return selected


def phones_equivalent(a: str | None, b: str | None) -> bool:
    """True when both normalize to the same canonical mobile (non-empty)."""
    try:
        na = normalize_mobile(a, required=True)
        nb = normalize_mobile(b, required=True)
    except InvalidPhoneError:
        return False
    return na == nb
