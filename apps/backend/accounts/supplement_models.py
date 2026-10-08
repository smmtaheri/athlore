"""Coach-owned supplement catalog; prescriptions are immutable program snapshots."""

import uuid

from django.db import models


class SupplementGoal(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey("accounts.CoachProfile", on_delete=models.CASCADE)
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["coach", "name"], name="supp_goal_coach_name")
        ]


class SupplementCatalogEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey("accounts.CoachProfile", on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    name_en = models.CharField(max_length=200, blank=True)
    aliases = models.JSONField(default=list, blank=True)
    category = models.CharField(max_length=120)
    goals = models.ManyToManyField(SupplementGoal, blank=True)
    reason = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    warnings = models.TextField(blank=True)
    replacement_group = models.CharField(max_length=120, blank=True)
    priority = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    auto_eligible = models.BooleanField(default=False)
    reviewed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-priority", "name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["coach", "name"], name="supp_entry_coach_name")
        ]


class SupplementDose(models.Model):
    class Unit(models.TextChoices):
        SCOOP = "scoop", "اسکوپ"
        GRAM = "gram", "گرم"
        MG = "mg", "میلی‌گرم"
        SERVING = "serving", "سروینگ"
        TABLET = "tablet", "قرص"
        CAPSULE = "capsule", "کپسول"
        ML = "ml", "میلی‌لیتر"
        PIECE = "piece", "عدد"

    class Timing(models.TextChoices):
        MORNING = "morning", "صبح"
        WITH_MEAL = "with_meal", "همراه غذا"
        BEFORE_WORKOUT = "before_workout", "قبل تمرین"
        AFTER_WORKOUT = "after_workout", "بعد تمرین"
        BEDTIME = "bedtime", "قبل خواب"
        CUSTOM = "custom", "زمان دلخواه"

    class Days(models.TextChoices):
        ALL = "all", "همه روزها"
        TRAINING = "training", "روز تمرین"
        REST = "rest", "روز استراحت"

    entry = models.ForeignKey(
        SupplementCatalogEntry, on_delete=models.CASCADE, related_name="doses"
    )
    amount = models.DecimalField(max_digits=9, decimal_places=3)
    unit = models.CharField(max_length=20, choices=Unit.choices)
    timing = models.CharField(max_length=30, choices=Timing.choices)
    custom_time = models.CharField(max_length=120, blank=True)
    days = models.CharField(max_length=20, choices=Days.choices, default=Days.ALL)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
