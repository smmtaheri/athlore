import uuid

from django.conf import settings
from django.db import models

from accounts.models import CoachProfile
from students.models import Student


class Program(models.Model):
    class ProgramType(models.TextChoices):
        COMPLETE = "complete", "Complete"
        WORKOUT = "workout", "Workout"
        NUTRITION = "nutrition", "Nutrition"
        SUPPLEMENT = "supplement", "Supplement"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="programs",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="programs",
    )
    title = models.CharField(max_length=200)
    program_type = models.CharField(max_length=20, choices=ProgramType.choices)
    active_version = models.ForeignKey(
        "ProgramVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    date_range_start = models.DateField(blank=True, null=True)
    date_range_end = models.DateField(blank=True, null=True)
    date_range_label = models.CharField(max_length=120, blank=True, default="")
    archived_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["coach", "-updated_at"]),
            models.Index(fields=["student", "-updated_at"]),
            models.Index(fields=["coach", "program_type"]),
            models.Index(fields=["coach", "archived_at"]),
        ]

    def __str__(self) -> str:
        return self.title


class ProgramVersion(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FINALIZED = "finalized", "Finalized"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="program_versions",
    )
    version_number = models.PositiveIntegerField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    training = models.JSONField(blank=True, null=True)
    nutrition = models.JSONField(blank=True, null=True)
    supplements = models.JSONField(blank=True, null=True)
    pdf_settings = models.JSONField(default=dict, blank=True)
    content_schema_version = models.PositiveIntegerField(default=1)
    source_version = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_versions",
    )
    copied_from_program = models.ForeignKey(
        Program,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="duplicated_as_versions",
    )
    generation_run = models.ForeignKey(
        "GenerationRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resulting_versions",
    )
    finalized_at = models.DateTimeField(blank=True, null=True)
    finalized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finalized_program_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["program", "version_number"],
                name="uniq_program_version_number",
            ),
        ]
        indexes = [
            models.Index(fields=["program", "status"]),
            models.Index(fields=["coach", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.program_id} v{self.version_number}"


class GenerationRun(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="generation_runs",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="generation_runs",
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generation_runs",
    )
    resulting_version = models.ForeignKey(
        ProgramVersion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    engine = models.CharField(max_length=40, default="rules_v1")
    seed = models.CharField(max_length=80, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    request = models.JSONField(default=dict, blank=True)
    input_snapshot = models.JSONField(default=dict, blank=True)
    output_snapshot = models.JSONField(blank=True, null=True)
    warnings = models.JSONField(default=list, blank=True)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["coach", "-created_at"]),
            models.Index(fields=["student", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.engine}:{self.status}:{self.id}"
