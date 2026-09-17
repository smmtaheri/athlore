"""Secure PDF share-link services."""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from common.exceptions import InvalidStateError
from delivery.models import PdfArtifact, PdfShareLink
from delivery.services.artifacts import open_artifact_file

TOKEN_BYTES = 32


def _share_default_days() -> int:
    return int(getattr(settings, "PDF_SHARE_DEFAULT_DAYS", 7))


def _share_max_days() -> int:
    return int(getattr(settings, "PDF_SHARE_MAX_DAYS", 30))


def hash_share_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def build_public_share_url(raw_token: str) -> str:
    base = getattr(settings, "PUBLIC_API_BASE_URL", "").rstrip("/")
    if not base:
        base = "http://127.0.0.1:8000/api/v1"
    return f"{base}/shared/pdf/{raw_token}/"


@transaction.atomic
def create_share_link(
    coach,
    artifact: PdfArtifact,
    *,
    expires_in_days: int | None = None,
    expires_at=None,
) -> tuple[PdfShareLink, str]:
    if artifact.coach_id != coach.id or artifact.deleted_at:
        raise NotFound(detail="Not found.")
    if artifact.status != PdfArtifact.Status.READY:
        raise InvalidStateError(detail="PDF is not ready.", code="not_ready")
    if not artifact.file:
        raise InvalidStateError(detail="PDF file is missing.", code="missing_file")

    max_days = _share_max_days()
    default_days = _share_default_days()
    now = timezone.now()
    if expires_at is not None:
        if expires_at <= now:
            raise ValidationError(
                {"expires_at": ["Expiry must be in the future."]},
                code="invalid_share_expiry",
            )
        max_expiry = now + timedelta(days=max_days)
        if expires_at > max_expiry:
            raise ValidationError(
                {"expires_at": [f"Expiry may not exceed {max_days} days."]},
                code="invalid_share_expiry",
            )
        final_expiry = expires_at
    else:
        days = default_days if expires_in_days is None else int(expires_in_days)
        if days < 1 or days > max_days:
            raise ValidationError(
                {"expires_in_days": [f"Must be between 1 and {max_days}."]},
                code="invalid_share_expiry",
            )
        final_expiry = now + timedelta(days=days)

    # Revoke prior active links so only one active share exists per artifact.
    PdfShareLink.objects.filter(
        artifact=artifact, revoked_at__isnull=True, expires_at__gt=now
    ).update(revoked_at=now)

    raw = secrets.token_urlsafe(TOKEN_BYTES)
    link = PdfShareLink.objects.create(
        artifact=artifact,
        coach=coach,
        token_hash=hash_share_token(raw),
        expires_at=final_expiry,
    )
    return link, raw


@transaction.atomic
def revoke_share_links(coach, artifact: PdfArtifact) -> int:
    if artifact.coach_id != coach.id or artifact.deleted_at:
        raise NotFound(detail="Not found.")
    now = timezone.now()
    return PdfShareLink.objects.filter(
        artifact=artifact, coach=coach, revoked_at__isnull=True
    ).update(revoked_at=now)


def resolve_share_download(raw_token: str):
    """Return (file_buffer, filename, size) or raise NotFound for any invalid state."""
    if not raw_token or len(raw_token) < 20:
        raise NotFound(detail="Not found.")

    token_hash = hash_share_token(raw_token)
    try:
        link = PdfShareLink.objects.select_related("artifact").get(token_hash=token_hash)
    except PdfShareLink.DoesNotExist as exc:
        raise NotFound(detail="Not found.") from exc

    now = timezone.now()
    if link.revoked_at is not None:
        raise NotFound(detail="Not found.")
    if link.expires_at <= now:
        raise NotFound(detail="Not found.")

    artifact = link.artifact
    if artifact.deleted_at is not None or artifact.status != PdfArtifact.Status.READY:
        raise NotFound(detail="Not found.")

    try:
        buf, name, size = open_artifact_file(artifact)
    except InvalidStateError as exc:
        raise NotFound(detail="Not found.") from exc

    PdfShareLink.objects.filter(pk=link.pk).update(
        last_accessed_at=now,
        download_count=link.download_count + 1,
    )
    return buf, name, size
