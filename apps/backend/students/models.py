import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from accounts.models import CoachProfile


class Student(models.Model):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="students",
    )
    full_name = models.CharField(max_length=120)
    age = models.PositiveIntegerField(validators=[MinValueValidator(10), MaxValueValidator(100)])
    gender = models.CharField(max_length=16, choices=Gender.choices)
    height_cm = models.DecimalField(
        max_digits=5, decimal_places=1, validators=[MinValueValidator(Decimal("50"))]
    )
    weight_kg = models.DecimalField(
        max_digits=5, decimal_places=1, validators=[MinValueValidator(Decimal("20"))]
    )
    # Canonical E.164 Iranian mobile (+989…). Globally unique when set.
    # Nullable only for legacy rows; new creates require a phone.
    phone_number = models.CharField(max_length=16, blank=True, null=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    coach_notes = models.TextField(blank=True, default="")

    goals = models.JSONField(default=dict, blank=True)
    injuries = models.JSONField(default=dict, blank=True)
    equipment = models.JSONField(default=dict, blank=True)
    lifestyle = models.JSONField(default=dict, blank=True)
    preferences = models.JSONField(default=dict, blank=True)
    training_background = models.JSONField(default=dict, blank=True)
    training_conditions = models.JSONField(default=dict, blank=True)

    # Nutrition/supplement safety fields (used to filter auto-selected templates).
    food_allergies = models.JSONField(default=list, blank=True)
    food_intolerances = models.JSONField(default=list, blank=True)
    dietary_restrictions = models.JSONField(default=list, blank=True)
    dietary_preferences = models.JSONField(default=list, blank=True)
    supplement_restrictions = models.JSONField(default=list, blank=True)
    relevant_medical_notes = models.TextField(blank=True, default="")
    nutrition_notes = models.TextField(blank=True, default="")

    summary_current_program_title = models.CharField(max_length=200, blank=True, default="")
    summary_last_visit_date = models.DateField(blank=True, null=True)
    summary_medical_note = models.CharField(max_length=300, blank=True, default="")

    archived_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["coach", "status"]),
            models.Index(fields=["coach", "full_name"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["phone_number"],
                condition=models.Q(phone_number__isnull=False),
                name="uniq_student_phone_number",
            ),
        ]

    def __str__(self) -> str:
        return self.full_name


class Visit(models.Model):
    class Level(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        GOOD = "good", "Good"
        HIGH = "high", "High"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        WAITING_FOR_STUDENT = "waiting_for_student", "Waiting for student"
        STUDENT_SUBMITTED = "student_submitted", "Student submitted"
        COACH_REVIEW = "coach_review", "Coach review"
        FINALIZED = "finalized", "Finalized"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="visits",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="visits",
    )
    visit_date = models.DateField()
    current_weight_kg = models.DecimalField(
        max_digits=5, decimal_places=1, validators=[MinValueValidator(Decimal("20"))]
    )
    previous_weight_kg = models.DecimalField(
        max_digits=5, decimal_places=1, validators=[MinValueValidator(Decimal("20"))]
    )
    body_fat_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        blank=True,
        null=True,
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )

    waist_cm = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    chest_cm = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    arm_cm = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    thigh_cm = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    hip_cm = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)

    adherence_overall = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )
    adherence_training = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )
    adherence_nutrition = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )
    adherence_supplements = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )

    daily_energy_level = models.CharField(max_length=16, choices=Level.choices)
    sleep_quality = models.CharField(max_length=16, choices=Level.choices)
    stress_level = models.CharField(max_length=16, choices=Level.choices)
    body_feeling = models.TextField(blank=True, default="")
    student_feedback = models.TextField(blank=True, default="")
    coach_assessment = models.TextField(blank=True, default="")
    coach_notes = models.TextField(blank=True, default="")
    has_new_injury = models.BooleanField(default=False)
    new_injury_notes = models.TextField(blank=True, default="")
    next_cycle_goal = models.TextField(blank=True, default="")
    training_condition_changes = models.TextField(blank=True, default="")

    # Dynamic visit form (unified assessment/check-in).
    form_template = models.ForeignKey(
        "students.CoachVisitFormTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="visits",
    )
    form_template_key = models.CharField(max_length=80, blank=True, default="")
    form_template_version = models.PositiveIntegerField(default=1)
    form_template_snapshot = models.JSONField(default=dict, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    answer_sources = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    coach_private_notes = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    submitted_by_student_at = models.DateTimeField(blank=True, null=True)
    finalized_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-visit_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "visit_date"], name="uniq_student_visit_date"
            ),
        ]
        indexes = [
            models.Index(fields=["student", "-visit_date"]),
            models.Index(fields=["coach", "-visit_date"]),
            models.Index(fields=["student", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.student_id} @ {self.visit_date}"


class VisitAnswerRevision(models.Model):
    """Immutable history of a single answer field value change on a Visit."""

    class Source(models.TextChoices):
        STUDENT = "student", "Student"
        COACH = "coach", "Coach"
        PREFILL = "prefill", "Prefill"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    visit = models.ForeignKey(
        Visit,
        on_delete=models.CASCADE,
        related_name="answer_revisions",
    )
    field_key = models.CharField(max_length=200)
    value = models.JSONField(null=True, blank=True)
    source = models.CharField(max_length=16, choices=Source.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="visit_answer_revisions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["visit", "field_key", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.visit_id}:{self.field_key}@{self.created_at}"


class StudentProfile(models.Model):
    """Links an authenticated User to a Student for the student self-service portal."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )
    student = models.OneToOneField(
        Student,
        on_delete=models.CASCADE,
        related_name="auth_profile",
    )
    # Coach-controlled gate: when False, login and student APIs are blocked.
    # Does not delete the Student row or visit history.
    portal_enabled = models.BooleanField(default=False)
    # Set when the student finishes forced password change (first setup).
    account_activated_at = models.DateTimeField(blank=True, null=True)
    # True after coach sets/resets initial password until student chooses a new one.
    must_change_password = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"StudentProfile(student={self.student_id})"

    @property
    def is_account_activated(self) -> bool:
        return self.account_activated_at is not None

    def portal_status(self) -> str:
        """Coach-facing portal status.

        not_started | pending_activation | password_reset_required | active | disabled
        """
        if not self.portal_enabled:
            if self.is_account_activated or self.must_change_password:
                return "disabled"
            return "not_started"
        if self.must_change_password and self.is_account_activated:
            return "password_reset_required"
        if self.must_change_password:
            return "pending_activation"
        if self.is_account_activated:
            return "active"
        # Enabled shell without an initial password yet (seed / pre-provision).
        return "not_started"


# Visit form templates live in a dedicated module; imported here so Django's
# app registry / migrations autodetection pick them up as part of `students`.
# Body Check daily tracking (independent from Visit).
from students.body_check_models import (  # noqa: E402,F401
    BodyCheckCycle,
    BodyCheckDailyEntry,
    BodyCheckProgressPhoto,
)
from students.visit_form_models import CoachVisitFormTemplate  # noqa: E402,F401
