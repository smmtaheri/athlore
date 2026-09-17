"""Shared helpers for API tests."""

from __future__ import annotations

import hashlib


def unique_iran_mobile(key: str) -> str:
    """Deterministic unique 09… mobile derived from a stable key (e.g. email)."""
    digest = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16)
    national = 9000000000 + (digest % 1_000_000_000)
    return f"0{national}"


def register(
    client,
    email: str,
    password: str = "SecurePass123!",
    full_name: str = "Coach",
    *,
    phone_number: str | None = None,
):
    """POST /api/v1/auth/register/ with a unique phone when not supplied."""
    phone = phone_number or unique_iran_mobile(email)
    return client.post(
        "/api/v1/auth/register/",
        {
            "email": email,
            "password": password,
            "full_name": full_name,
            "phone_number": phone,
        },
        format="json",
    )


def auth_header(tokens: dict) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {tokens['access']}"}
