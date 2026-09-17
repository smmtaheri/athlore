"""Canonical Iranian mobile phone normalization.

All uniqueness checks must use normalize_iran_mobile(), never raw input.
Canonical form: +989XXXXXXXXX (E.164 with Iran country code).
"""

from __future__ import annotations

import re

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
    """Raised when a phone number cannot be normalized to a valid Iranian mobile."""

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


def phones_equivalent(a: str | None, b: str | None) -> bool:
    """True when both normalize to the same canonical mobile (non-empty)."""
    try:
        na = normalize_iran_mobile(a, required=True)
        nb = normalize_iran_mobile(b, required=True)
    except InvalidPhoneError:
        return False
    return na == nb
