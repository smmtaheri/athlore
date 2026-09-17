"""Body Check (بادی‌چک روزانه) models — independent from Visit."""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator
from django.db import models

from accounts.models import CoachProfile
from students.models import Student


def body_check_photo_upload_to(instance: BodyCheckProgressPhoto, filename: str) -> str:
    safe = filename.replace("/", "_").replace("\\", "_")[-120:]
    return f"body-check/{instance.cycle.coach_id}/{instance.cycle_id}/w{instance.week_number}/{instance.id}_{safe}"


class BodyCheckCycle(models.Model):
    """A coach-owned Body Check period for one student (V1: 30 days)."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"

    CYCLE_LENGTH_DAYS = 30

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="body_check_cycles",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="body_check_cycles",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    starting_weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        validators=[MinValueValidator(Decimal("20")), MaxValueValidator(Decimal("400"))],
    )
    goal_weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        validators=[MinValueValidator(Decimal("20")), MaxValueValidator(Decimal("400"))],
    )
    # List of CYCLE_LENGTH_DAYS numbers (kg). Coach-editable "system suggestion" targets.
    daily_targets_kg = models.JSONField(default=list, blank=True)
    meal_detail_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date", "-created_at"]
        indexes = [
            models.Index(fields=["coach", "student", "status"]),
            models.Index(fields=["student", "status"]),
        ]

    def __str__(self) -> str:
        return f"BodyCheckCycle({self.student_id}, {self.start_date}→{self.end_date})"


class BodyCheckDailyEntry(models.Model):
    """Student-submitted day log. Missing days have no row (no zero placeholders)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cycle = models.ForeignKey(
        BodyCheckCycle,
        on_delete=models.CASCADE,
        related_name="daily_entries",
    )
    local_date = models.DateField()
    # Snapshot of the coach target for this day at last student save (or coach backfill).
    target_weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        blank=True,
        null=True,
        validators=[MinValueValidator(Decimal("20")), MaxValueValidator(Decimal("400"))],
    )
    actual_weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        blank=True,
        null=True,
        validators=[MinValueValidator(Decimal("20")), MaxValueValidator(Decimal("400"))],
    )
    sleep_start_time = models.TimeField(blank=True, null=True)
    wake_time = models.TimeField(blank=True, null=True)
    sleep_duration_minutes = models.PositiveIntegerField(blank=True, null=True)
    sleep_quality_score = models.PositiveSmallIntegerField(
        blank=True,
        null=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    nutrition_adherence_score = models.PositiveSmallIntegerField(
        blank=True,
        null=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    meal_1 = models.TextField(blank=True, default="")
    meal_2 = models.TextField(blank=True, default="")
    meal_3 = models.TextField(blank=True, default="")
    meal_4 = models.TextField(blank=True, default="")
    meal_5 = models.TextField(blank=True, default="")
    meal_6 = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["local_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["cycle", "local_date"],
                name="uniq_body_check_entry_per_cycle_date",
            ),
        ]
        indexes = [
            models.Index(fields=["cycle", "local_date"]),
        ]

    def __str__(self) -> str:
        return f"BodyCheckDailyEntry({self.cycle_id}, {self.local_date})"


class BodyCheckProgressPhoto(models.Model):
    """Progress photo for a cycle week (V1 weeks 1–4). Served only via authenticated API."""

    MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MiB
    ALLOWED_EXTENSIONS = ("jpg", "jpeg", "png", "webp")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cycle = models.ForeignKey(
        BodyCheckCycle,
        on_delete=models.CASCADE,
        related_name="progress_photos",
    )
    week_number = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(4)],
    )
    file = models.FileField(
        upload_to=body_check_photo_upload_to,
        max_length=512,
        validators=[FileExtensionValidator(allowed_extensions=list(ALLOWED_EXTENSIONS))],
    )
    original_filename = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["week_number", "uploaded_at"]
        indexes = [
            models.Index(fields=["cycle", "week_number"]),
        ]

    def __str__(self) -> str:
        return f"BodyCheckProgressPhoto(w{self.week_number}, {self.cycle_id})"
