"""HTTP-only refresh cookie helpers for JWT auth."""

from __future__ import annotations

from django.conf import settings
from django.http import HttpResponse

REFRESH_COOKIE_NAME = "coach_assistant_refresh"


def refresh_cookie_kwargs() -> dict:
    secure = bool(getattr(settings, "SESSION_COOKIE_SECURE", False)) or not settings.DEBUG
    # SameSite=Lax works for same-site SPA behind Nginx; Strict would break some redirects.
    return {
        "httponly": True,
        "secure": secure,
        "samesite": "Lax",
        "path": "/api/v1/auth/",
        "max_age": int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
    }


def set_refresh_cookie(response: HttpResponse, refresh_token: str) -> HttpResponse:
    response.set_cookie(REFRESH_COOKIE_NAME, refresh_token, **refresh_cookie_kwargs())
    return response


def clear_refresh_cookie(response: HttpResponse) -> HttpResponse:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/v1/auth/")
    return response


def read_refresh_token(request) -> str | None:
    # Prefer explicit body/JSON refresh so API clients and rotation tests behave
    # predictably; fall back to the HttpOnly cookie for browser SPA flows.
    data = getattr(request, "data", None) or {}
    if isinstance(data, dict):
        value = data.get("refresh")
        if value:
            return str(value)
    cookie = request.COOKIES.get(REFRESH_COOKIE_NAME)
    if cookie:
        return cookie
    return None
