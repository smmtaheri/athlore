"""Persistent PDF artifacts and public share links."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from accounts.models import CoachProfile
from programming.models import Program, ProgramVersion
from students.models import Student


def pdf_artifact_upload_to(instance: PdfArtifact, filename: str) -> str:
    safe_name = (filename or "program.pdf").replace("/", "_").replace("\\", "_")
    return f"pdfs/{instance.coach_id}/{instance.id}/{safe_name}"


class PdfArtifact(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RENDERING = "rendering", "Rendering"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="pdf_artifacts",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="pdf_artifacts",
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name="pdf_artifacts",
    )
    program_version = models.ForeignKey(
        ProgramVersion,
        on_delete=models.PROTECT,
        related_name="pdf_artifacts",
    )
    display_name = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    file = models.FileField(
        upload_to=pdf_artifact_upload_to,
        blank=True,
        null=True,
        max_length=512,
    )
    mime_type = models.CharField(max_length=100, default="application/pdf")
    size_bytes = models.BigIntegerField(blank=True, null=True)
    checksum_sha256 = models.CharField(max_length=64, blank=True, default="")
    render_engine_version = models.CharField(max_length=64, blank=True, default="")
    template_version = models.CharField(max_length=32, blank=True, default="")
    program_type = models.CharField(max_length=20, blank=True, default="")
    version_label = models.CharField(max_length=32, blank=True, default="")
    error_code = models.CharField(max_length=64, blank=True, default="")
    error_summary = models.CharField(max_length=300, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_pdf_artifacts",
    )
    regenerated_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="regenerations",
    )
    generated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["coach", "-created_at"]),
            models.Index(fields=["student", "-created_at"]),
            models.Index(fields=["program", "-created_at"]),
            models.Index(fields=["program_version"]),
            models.Index(fields=["coach", "status"]),
            models.Index(fields=["coach", "deleted_at"]),
        ]

    def __str__(self) -> str:
        return self.display_name

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class PdfShareLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    artifact = models.ForeignKey(
        PdfArtifact,
        on_delete=models.CASCADE,
        related_name="share_links",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="pdf_share_links",
    )
    token_hash = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(blank=True, null=True)
    last_accessed_at = models.DateTimeField(blank=True, null=True)
    download_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["artifact", "-created_at"]),
            models.Index(fields=["coach", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"share:{self.id}"

    def is_active(self, *, now=None) -> bool:
        from django.utils import timezone

        now = now or timezone.now()
        if self.revoked_at is not None:
            return False
        if self.expires_at <= now:
            return False
        if self.artifact.deleted_at is not None:
            return False
        if self.artifact.status != PdfArtifact.Status.READY:
            return False
        return True
