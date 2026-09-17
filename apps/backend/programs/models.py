from django.db import models


class Coach(models.Model):
    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True, default="")
    style_notes = models.TextField(blank=True, default="")
    control_mode = models.CharField(
        max_length=20,
        default="balanced",
        choices=[("strict", "Strict"), ("balanced", "Balanced"), ("creative", "Creative")],
        help_text="strict = less random, creative = more variation",
    )
    default_session_minutes = models.PositiveIntegerField(default=60)

    def __str__(self):
        return self.name


class Exercise(models.Model):
    name = models.CharField(max_length=160)
    primary_muscle = models.CharField(max_length=80)
    secondary_muscles = models.JSONField(default=list, blank=True)
    equipment = models.CharField(max_length=80, blank=True, default="")
    level = models.CharField(max_length=30, default="beginner")
    movement_pattern = models.CharField(max_length=80, blank=True, default="")
    risk_tags = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("name", "primary_muscle")]

    def __str__(self):
        return self.name


class CoachExercisePreference(models.Model):
    coach = models.ForeignKey(Coach, on_delete=models.CASCADE, related_name="exercise_preferences")
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE)
    weight = models.IntegerField(default=50, help_text="0=never, 100=favorite")
    allowed_levels = models.JSONField(default=list, blank=True)
    blocked_for_injuries = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        unique_together = [("coach", "exercise")]


class CoachTemplate(models.Model):
    coach = models.ForeignKey(Coach, on_delete=models.CASCADE, related_name="templates")
    name = models.CharField(max_length=160)
    goal = models.CharField(max_length=80, default="hypertrophy")
    level = models.CharField(max_length=30, default="beginner")
    days_per_week = models.PositiveIntegerField(default=3)
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=50)
    split = models.JSONField(
        default=list,
        help_text="Simple days: [{'name':'Day 1','muscles':['chest','back'],'slots':4}]",
    )
    volume = models.JSONField(
        default=dict,
        blank=True,
        help_text="Defaults: {'sets':3,'reps':'8-12','rest_seconds':90}",
    )
    rules = models.JSONField(
        default=dict,
        blank=True,
        help_text="Template-local simple rules, e.g. {'avoid_same_day': [['chest','triceps']]}",
    )
    notes = models.TextField(blank=True, default="")

    def __str__(self):
        return f"{self.coach.name} - {self.name}"


class CoachRule(models.Model):
    coach = models.ForeignKey(Coach, on_delete=models.CASCADE, related_name="rules")
    code = models.SlugField(max_length=80)
    name = models.CharField(max_length=160)
    kind = models.CharField(
        max_length=60,
        help_text="exclude_exercises, block_risk_tags, extra_sets_for_muscles, cap_sets, prefer_equipment, note",
    )
    params = models.JSONField(default=dict, blank=True)
    priority = models.IntegerField(default=50)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("coach", "code")]
        ordering = ["priority", "id"]

    def __str__(self):
        return f"{self.coach.name}:{self.code}"


class StudentProfile(models.Model):
    coach = models.ForeignKey(Coach, on_delete=models.CASCADE, related_name="students")
    name = models.CharField(max_length=120)
    goal = models.CharField(max_length=80, default="hypertrophy")
    level = models.CharField(max_length=30, default="beginner")
    days_per_week = models.PositiveIntegerField(default=3)
    session_minutes = models.PositiveIntegerField(default=60)
    focus_muscles = models.JSONField(default=list, blank=True)
    injuries = models.JSONField(default=list, blank=True)
    available_equipment = models.JSONField(default=list, blank=True)
    disliked_exercises = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, default="")

    def __str__(self):
        return self.name


class GeneratedProgram(models.Model):
    coach = models.ForeignKey(Coach, on_delete=models.CASCADE)
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="programs")
    template = models.ForeignKey(CoachTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    seed = models.CharField(max_length=80)
    signature = models.CharField(max_length=255, db_index=True)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
