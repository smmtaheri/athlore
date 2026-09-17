import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class CoachProfile(models.Model):
    class ControlMode(models.TextChoices):
        STRICT = "strict", "Strict"
        BALANCED = "balanced", "Balanced"
        CREATIVE = "creative", "Creative"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="coach_profile",
    )
    display_name = models.CharField(max_length=120)
    # Canonical E.164 Iranian mobile (+989…). Nullable only for legacy rows.
    phone_number = models.CharField(max_length=16, blank=True, null=True)
    style_notes = models.TextField(blank=True, default="")
    control_mode = models.CharField(
        max_length=20,
        choices=ControlMode.choices,
        default=ControlMode.BALANCED,
    )
    default_session_minutes = models.PositiveIntegerField(default=60)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["phone_number"],
                condition=models.Q(phone_number__isnull=False),
                name="uniq_coach_phone_number",
            ),
        ]

    def __str__(self) -> str:
        return self.display_name


class CoachRuleSet(models.Model):
    """One active rule set per coach; children hold templates, levels, injuries, etc."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.OneToOneField(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="rule_set",
    )
    schema_version = models.PositiveIntegerField(default=1)
    general_extra_notes = models.TextField(blank=True, default="")
    # Optional coach-scoped generator calibration (day targets, set budgets, RX).
    # Empty => platform defaults. Never keyed by coach identity in engine code.
    style_profile = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Rules for {self.coach_id}"


class ProgramTemplate(models.Model):
    class Level(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule_set = models.ForeignKey(
        CoachRuleSet,
        on_delete=models.CASCADE,
        related_name="templates",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="program_templates",
    )
    name = models.CharField(max_length=160)
    goal = models.CharField(max_length=200, blank=True, default="")
    main_goal = models.CharField(max_length=120, blank=True, default="")
    level = models.CharField(max_length=20, choices=Level.choices)
    days_per_week = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(7)],
    )
    intensity = models.CharField(max_length=80, blank=True, default="")
    volume = models.CharField(max_length=80, blank=True, default="")
    rest_time = models.CharField(max_length=80, blank=True, default="")
    split = models.JSONField(default=list, blank=True)
    muscle_priority_order = models.JSONField(default=list, blank=True)
    special_rules = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        indexes = [
            models.Index(fields=["coach", "is_active"]),
            models.Index(fields=["coach", "is_archived"]),
        ]

    def __str__(self) -> str:
        return self.name


class LevelRule(models.Model):
    class LevelKey(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule_set = models.ForeignKey(
        CoachRuleSet,
        on_delete=models.CASCADE,
        related_name="level_rules",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="level_rules",
    )
    level_key = models.CharField(max_length=20, choices=LevelKey.choices)
    intensity = models.TextField(blank=True, default="")
    volume = models.TextField(blank=True, default="")
    allowed_techniques = models.JSONField(default=list, blank=True)
    forbidden_exercises = models.JSONField(default=list, blank=True)
    required_exercises = models.JSONField(default=list, blank=True)
    coach_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["level_key"]
        constraints = [
            models.UniqueConstraint(
                fields=["rule_set", "level_key"],
                name="uniq_level_rule_per_set",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.level_key}@{self.coach_id}"


class InjuryRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule_set = models.ForeignKey(
        CoachRuleSet,
        on_delete=models.CASCADE,
        related_name="injury_rules",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="injury_rules",
    )
    name = models.CharField(max_length=160)
    forbidden_exercises = models.JSONField(default=list, blank=True)
    alternatives = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class MusclePriority(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule_set = models.ForeignKey(
        CoachRuleSet,
        on_delete=models.CASCADE,
        related_name="muscle_priorities",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="muscle_priorities",
    )
    muscle = models.CharField(max_length=80)
    extra_exercises = models.PositiveIntegerField(default=0)
    extra_sets = models.PositiveIntegerField(default=0)
    order_change = models.CharField(max_length=200, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "muscle"]

    def __str__(self) -> str:
        return self.muscle


class ExerciseBankGroup(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule_set = models.ForeignKey(
        CoachRuleSet,
        on_delete=models.CASCADE,
        related_name="exercise_bank_groups",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="exercise_bank_groups",
    )
    group_name = models.CharField(max_length=80)
    favorite_exercises = models.JSONField(default=list, blank=True)
    beginner_friendly = models.JSONField(default=list, blank=True)
    professional_friendly = models.JSONField(default=list, blank=True)
    forbidden_exercises = models.JSONField(default=list, blank=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "group_name"]

    def __str__(self) -> str:
        return self.group_name


class GeneralRule(models.Model):
    class Importance(models.TextChoices):
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule_set = models.ForeignKey(
        CoachRuleSet,
        on_delete=models.CASCADE,
        related_name="general_rules",
    )
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="general_rules",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=80, blank=True, default="")
    importance = models.CharField(
        max_length=16,
        choices=Importance.choices,
        default=Importance.MEDIUM,
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "title"]

    def __str__(self) -> str:
        return self.title


class Exercise(models.Model):
    """Coach-owned exercise bank entry (reusable catalog)."""

    class Level(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"
        ALL = "all", "All"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="exercises",
    )

    class Laterality(models.TextChoices):
        NONE = "", "Not specified"
        UNILATERAL = "unilateral", "Unilateral"
        BILATERAL = "bilateral", "Bilateral"

    name = models.CharField(max_length=160)
    # Canonical Persian display name (kept as `name` for backward compatibility).
    name_en = models.CharField(max_length=160, blank=True, default="")
    primary_muscle = models.CharField(max_length=80)
    secondary_muscles = models.JSONField(default=list, blank=True)
    equipment = models.CharField(max_length=80, blank=True, default="")
    level = models.CharField(max_length=30, choices=Level.choices, default=Level.BEGINNER)
    movement_pattern = models.CharField(max_length=80, blank=True, default="")
    laterality = models.CharField(max_length=20, choices=Laterality.choices, blank=True, default="")
    risk_tags = models.JSONField(default=list, blank=True)
    # Reference document (e.g. a coach-provided PDF/program name) this entry was imported from.
    source_document = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["primary_muscle", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["coach", "name", "primary_muscle"],
                name="uniq_coach_exercise_name_muscle",
            ),
        ]
        indexes = [
            models.Index(fields=["coach", "primary_muscle"]),
            models.Index(fields=["coach", "is_archived"]),
            models.Index(fields=["coach", "name"]),
        ]

    def __str__(self) -> str:
        return self.name


class CoachExercisePreference(models.Model):
    """Preferred / prohibited / level-suitable flags for a coach exercise."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="exercise_preferences",
    )
    exercise = models.ForeignKey(
        Exercise,
        on_delete=models.CASCADE,
        related_name="preferences",
    )
    is_preferred = models.BooleanField(default=False)
    is_prohibited = models.BooleanField(default=False)
    suitable_levels = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["coach", "exercise"],
                name="uniq_coach_exercise_preference",
            ),
        ]

    def __str__(self) -> str:
        return f"pref:{self.exercise_id}"


# Reference-bank (exercise aliases/history) and nutrition/supplement models live in a
# dedicated module for readability; imported here so Django's app registry picks them
# up as part of the `accounts` app (required for migrations autodetection).
from accounts.nutrition_models import (  # noqa: E402,F401
    CoachNutritionTemplate,
    CoachSupplementTemplate,
    ExerciseAlias,
    ExerciseHistoricalUsage,
    NutritionMealOption,
    NutritionMealSlot,
    NutritionOptionItem,
    SupplementTemplateItem,
)
