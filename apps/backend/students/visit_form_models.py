"""Coach-configurable visit form templates.

A Visit is the unified periodic athlete check-in. Dynamic field definitions live
in coach template JSON so taxonomy/labels can evolve without schema migrations.
Absence of an answer means UNKNOWN / NOT ASSESSED — never NORMAL / FALSE / STRONG.
"""

from __future__ import annotations

import uuid

from django.db import models

from accounts.models import CoachProfile


class CoachVisitFormTemplate(models.Model):
    """Per-coach visit form configuration (sections + fields as JSON)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coach = models.ForeignKey(
        CoachProfile,
        on_delete=models.CASCADE,
        related_name="visit_form_templates",
    )
    # Stable natural key for create-only seeding (e.g. "minimal_v1", "arman_visit_v1").
    key = models.CharField(max_length=80)
    name = models.CharField(max_length=160)
    version = models.PositiveIntegerField(default=1)
    description = models.TextField(blank=True, default="")
    # [{key, label, order, fields: [{key, semantic_key, label, type, options,
    #   student_visible, student_editable, coach_editable, ...}]}]
    sections = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["coach", "key"],
                name="uniq_coach_visit_form_template_key",
            ),
            models.UniqueConstraint(
                fields=["coach"],
                condition=models.Q(is_default=True),
                name="uniq_coach_default_visit_form_template",
            ),
        ]
        indexes = [
            models.Index(fields=["coach", "is_active"]),
            models.Index(fields=["coach", "is_default"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.key})@{self.coach_id}"
