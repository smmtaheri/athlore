"""Presentation-only calendar policy. Storage always remains Gregorian ISO."""

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

import jdatetime

TEHRAN = ZoneInfo("Asia/Tehran")


def format_date(value, *, calendar="persian", include_time=False, filename=False):
    if value is None or value == "":
        return "—"
    if isinstance(value, str):
        try:
            value = (
                datetime.fromisoformat(value.replace("Z", "+00:00"))
                if "T" in value
                else date.fromisoformat(value)
            )
        except ValueError:
            return value
    if not isinstance(value, (date, datetime)):
        return str(value)
    clock = ""
    if isinstance(value, datetime):
        value = value.replace(tzinfo=TEHRAN) if value.tzinfo is None else value.astimezone(TEHRAN)
        if include_time:
            clock = value.strftime(" %H:%M")
        value = value.date()
    if calendar == "persian":
        value = jdatetime.date.fromgregorian(date=value)
    separator = "-" if filename else "/"
    result = f"{value.year:04d}{separator}{value.month:02d}{separator}{value.day:02d}{clock}"
    if not filename:
        result = result.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    return result


def format_date_text(value, *, calendar="persian"):
    """Convert explicit ISO and Jalali date tokens in legacy display labels."""

    def replace_iso(match):
        token = match.group()
        return format_date(token, calendar=calendar, include_time="T" in token)

    def replace_jalali(match):
        token = match.group()
        try:
            year, month, day = (int(part) for part in re.split(r"[/.]", token))
            gregorian = jdatetime.date(year, month, day).togregorian()
        except (ValueError, OverflowError):
            return token
        return format_date(gregorian, calendar=calendar)

    formatted = re.sub(
        r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?",
        replace_iso,
        str(value or ""),
    )
    return re.sub(r"(?<!\d)1[34]\d{2}[/.]\d{1,2}[/.]\d{1,2}(?!\d)", replace_jalali, formatted)
