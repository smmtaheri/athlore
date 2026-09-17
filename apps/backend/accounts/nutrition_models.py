"""Coach reference-bank extensions: exercise aliases/history, nutrition and supplement templates.

Split out of accounts/models.py for readability; models here are still part of the
`accounts` app (imported at the bottom of accounts/models.py) so migrations work normally.
"""

import uuid

from django.db import models

DEFAULT_SUPPLEMENT_DISCLAIMER = (
    "این برنامه مکمل صرفاً یک پیشنهاد مرجع است و جای مشاوره پزشک یا متخصص تغذیه را "
    "نمی‌گیرد. پیش از مصرف هرگونه مکمل، به‌ویژه در صورت وجود بیماری زمینه‌ای، بارداری، "
    "شیردهی یا مصرف داروی دیگر، حتماً با پزشک یا متخصص تغذیه مشورت کنید."
)


class ExerciseAlias(models.Model):
    """Alternative name(s) a coach uses for a canonical exercise bank entry."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        "accounts.CoachProfile",
        on_delete=models.CASCADE,
        related_name="exercise_aliases",
    )
    exercise = models.ForeignKey(
        "accounts.Exercise",
        on_delete=models.CASCADE,
        related_name="aliases",
    )
    alias = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["alias"]
        constraints = [
            # Aliases are unique per coach across the whole exercise bank, not just
            # within a single exercise, so two different exercises can never share
            # the same alias for one coach.
            models.UniqueConstraint(
                fields=["coach", "alias"],
                name="uniq_coach_exercise_alias",
            ),
            models.UniqueConstraint(
                fields=["coach", "exercise", "alias"],
                name="uniq_coach_exercise_alias_per_exercise",
            ),
        ]
        indexes = [
            models.Index(fields=["coach", "alias"]),
        ]

    def __str__(self) -> str:
        return self.alias


class ExerciseHistoricalUsage(models.Model):
    """A historical prescription of an exercise, imported from a past coach program."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        "accounts.CoachProfile",
        on_delete=models.CASCADE,
        related_name="exercise_historical_usages",
    )
    exercise = models.ForeignKey(
        "accounts.Exercise",
        on_delete=models.CASCADE,
        related_name="historical_usages",
    )
    # e.g. "arman_1405_02_27" - identifies the source program this row came from.
    source_program_key = models.CharField(max_length=120)
    # Jalali date string exactly as given in the source document, e.g. "1405/02/27".
    source_date = models.CharField(max_length=32, blank=True, default="")
    duration_weeks = models.PositiveIntegerField(default=4)
    raw_prescription = models.TextField()
    day_label = models.CharField(max_length=160, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["source_date", "day_label"]
        indexes = [
            models.Index(fields=["coach", "exercise"]),
            models.Index(fields=["coach", "source_program_key"]),
        ]

    def __str__(self) -> str:
        return f"{self.source_program_key}:{self.exercise_id}"


class CoachNutritionTemplate(models.Model):
    """Coach-owned reusable nutrition plan (needs manual review before it can be auto-selected)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    class DayType(models.TextChoices):
        NONE = "", "Not specified"
        TRAINING = "training", "Training day"
        REST = "rest", "Rest day"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        "accounts.CoachProfile",
        on_delete=models.CASCADE,
        related_name="nutrition_templates",
    )
    rule_set = models.ForeignKey(
        "accounts.CoachRuleSet",
        on_delete=models.CASCADE,
        related_name="nutrition_templates",
    )
    name = models.CharField(max_length=200)
    purpose = models.CharField(max_length=255, blank=True, default="")
    day_type = models.CharField(max_length=20, choices=DayType.choices, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    needs_coach_review = models.BooleanField(default=True)
    source_document = models.CharField(max_length=255, blank=True, default="")
    source_version = models.CharField(max_length=60, blank=True, default="")
    # Only ever true once a coach has reviewed the template and marked it active;
    # imported templates always start False regardless of `status`.
    is_eligible_for_auto_select = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["coach", "name"],
                name="uniq_coach_nutrition_template_name",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class NutritionMealSlot(models.Model):
    class SlotKey(models.TextChoices):
        BREAKFAST = "breakfast", "Breakfast"
        SNACK_1 = "snack_1", "Snack 1"
        LUNCH = "lunch", "Lunch"
        LUNCH_SIDE = "lunch_side", "Lunch side"
        SNACK_2 = "snack_2", "Snack 2"
        DINNER = "dinner", "Dinner"
        DINNER_SIDE = "dinner_side", "Dinner side"
        SNACK_3 = "snack_3", "Snack 3"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        CoachNutritionTemplate,
        on_delete=models.CASCADE,
        related_name="meal_slots",
    )
    slot_key = models.CharField(max_length=20, choices=SlotKey.choices)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "slot_key"]
        constraints = [
            models.UniqueConstraint(
                fields=["template", "slot_key"],
                name="uniq_template_meal_slot",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.template_id}:{self.slot_key}"


class NutritionMealOption(models.Model):
    """One interchangeable option (e.g. option A/B) offered for a meal slot."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slot = models.ForeignKey(
        NutritionMealSlot,
        on_delete=models.CASCADE,
        related_name="options",
    )
    option_index = models.PositiveIntegerField()
    sort_order = models.IntegerField(default=0)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["sort_order", "option_index"]
        constraints = [
            models.UniqueConstraint(
                fields=["slot", "option_index"],
                name="uniq_slot_option_index",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.slot_id}:option{self.option_index}"


class NutritionOptionItem(models.Model):
    """A single food line within a meal option."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    option = models.ForeignKey(
        NutritionMealOption,
        on_delete=models.CASCADE,
        related_name="items",
    )
    sort_order = models.IntegerField(default=0)
    food_name = models.CharField(max_length=200)
    # Raw quantity exactly as written in the source (e.g. "۱/۵ نان سنگک", "۲۰۰ گرم").
    quantity_text = models.CharField(max_length=200)
    unit = models.CharField(max_length=60, blank=True, default="")
    preparation = models.CharField(max_length=255, blank=True, default="")
    substitution_group = models.CharField(max_length=120, blank=True, default="")
    # True when quantity_text is ambiguous (fractions like "1/5", "یک‌چهارم") and a
    # coach should confirm the normalized amount before it's used in generation.
    needs_review = models.BooleanField(default=False)
    reviewed_quantity = models.CharField(max_length=200, blank=True, null=True, default=None)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["sort_order", "food_name"]

    def __str__(self) -> str:
        return self.food_name


class CoachSupplementTemplate(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        "accounts.CoachProfile",
        on_delete=models.CASCADE,
        related_name="supplement_templates",
    )
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    needs_coach_review = models.BooleanField(default=True)
    # List of source document references (e.g. PDF filenames/labels) this was compiled from.
    source_documents = models.JSONField(default=list, blank=True)
    is_eligible_for_auto_select = models.BooleanField(default=False)
    medical_disclaimer = models.TextField(default=DEFAULT_SUPPLEMENT_DISCLAIMER, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["coach", "name"],
                name="uniq_coach_supplement_template_name",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class SupplementTemplateItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        CoachSupplementTemplate,
        on_delete=models.CASCADE,
        related_name="items",
    )
    sort_order = models.IntegerField(default=0)
    name = models.CharField(max_length=200)
    quantity_text = models.CharField(max_length=200)
    timing = models.CharField(max_length=120, blank=True, default="")
    frequency = models.CharField(max_length=120, blank=True, default="")
    day_applicability = models.CharField(max_length=20, blank=True, default="")
    instructions = models.TextField(blank=True, default="")
    warnings = models.TextField(blank=True, default="")
    needs_review = models.BooleanField(default=True)
    normalized_amount = models.CharField(max_length=120, blank=True, null=True, default=None)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name
