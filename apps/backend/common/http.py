"""Small HTTP helpers shared across views."""

from __future__ import annotations

from urllib.parse import quote


def content_disposition_attachment(filename: str, *, fallback: str = "download.pdf") -> str:
    """RFC 5987 Content-Disposition with UTF-8 filename*."""
    safe_fallback = (fallback or "download.pdf").replace('"', "")
    encoded = quote(filename, safe="")
    return f"attachment; filename=\"{safe_fallback}\"; filename*=UTF-8''{encoded}"
