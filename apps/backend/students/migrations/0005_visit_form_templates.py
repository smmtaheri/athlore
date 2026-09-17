# Refactor assessment templates into visit form templates; fold assessments into Visit.

import django.db.models.deletion
import uuid
from decimal import Decimal
from django.db import migrations, models
from django.utils import timezone


def forwards_migrate(apps, schema_editor):
    CoachVisitFormTemplate = apps.get_model("students", "CoachVisitFormTemplate")
    StudentAssessment = apps.get_model("students", "StudentAssessment")
    Visit = apps.get_model("students", "Visit")

    # Rename legacy Arman assessment key → visit form key.
    for tpl in CoachVisitFormTemplate.objects.filter(key="arman_v1"):
        # Avoid unique collisions if arman_visit_v1 already exists for coach.
        if CoachVisitFormTemplate.objects.filter(coach_id=tpl.coach_id, key="arman_visit_v1").exists():
            continue
        tpl.key = "arman_visit_v1"
        if not tpl.name or "ارزیابی" in tpl.name:
            tpl.name = "فرم ویزیت کامل آرمان"
        tpl.save(update_fields=["key", "name"])

    # One default per coach: prefer arman_visit_v1 / active template.
    coach_ids = CoachVisitFormTemplate.objects.values_list("coach_id", flat=True).distinct()
    for coach_id in coach_ids:
        qs = CoachVisitFormTemplate.objects.filter(coach_id=coach_id, is_active=True)
        if qs.filter(is_default=True).exists():
            continue
        preferred = qs.filter(key="arman_visit_v1").first() or qs.order_by("created_at").first()
        if preferred is not None:
            preferred.is_default = True
            preferred.save(update_fields=["is_default"])

    # Fold StudentAssessment rows into Visit (best-effort; pilot has little/no history).
    for assessment in StudentAssessment.objects.all().iterator():
        visit = (
            Visit.objects.filter(student_id=assessment.student_id, visit_date=assessment.assessment_date)
            .order_by("-created_at")
            .first()
        )
        weight = Decimal("70.0")
        # Try to read weight from answers.
        answers = assessment.answers or {}
        raw_w = answers.get("weight_kg")
        try:
            if raw_w is not None and str(raw_w).strip() != "":
                weight = Decimal(str(raw_w))
        except Exception:
            pass

        if visit is None:
            visit = Visit(
                id=uuid.uuid4(),
                coach_id=assessment.coach_id,
                student_id=assessment.student_id,
                visit_date=assessment.assessment_date,
                current_weight_kg=weight,
                previous_weight_kg=weight,
                daily_energy_level="medium",
                sleep_quality="medium",
                stress_level="medium",
                coach_notes=assessment.coach_notes or "",
                status="finalized",
                finalized_at=timezone.now(),
                created_at=assessment.created_at,
                updated_at=assessment.updated_at,
            )
        visit.form_template_id = assessment.template_id
        visit.form_template_key = assessment.template_key or ""
        visit.form_template_version = assessment.template_version or 1
        visit.form_template_snapshot = assessment.template_snapshot or {}
        visit.answers = answers
        if assessment.coach_notes:
            visit.coach_private_notes = assessment.coach_notes
        if not visit.status:
            visit.status = "finalized"
        if visit.finalized_at is None and visit.status == "finalized":
            visit.finalized_at = timezone.now()
        visit.save()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_assessment_and_style_profile"),
        ("students", "0004_assessment_and_style_profile"),
    ]

    operations = [
        # --- Rename template model (preserves rows) ---
        migrations.RenameModel(
            old_name="CoachAssessmentTemplate",
            new_name="CoachVisitFormTemplate",
        ),
        migrations.AlterModelOptions(
            name="coachvisitformtemplate",
            options={"ordering": ["name"]},
        ),
        migrations.RemoveConstraint(
            model_name="coachvisitformtemplate",
            name="uniq_coach_assessment_template_key",
        ),
        migrations.RemoveIndex(
            model_name="coachvisitformtemplate",
            name="students_co_coach_i_dd04a0_idx",
        ),
        migrations.AlterField(
            model_name="coachvisitformtemplate",
            name="coach",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="visit_form_templates",
                to="accounts.coachprofile",
            ),
        ),
        migrations.AddField(
            model_name="coachvisitformtemplate",
            name="is_default",
            field=models.BooleanField(default=False),
        ),
        migrations.AddIndex(
            model_name="coachvisitformtemplate",
            index=models.Index(fields=["coach", "is_active"], name="students_co_coach_i_1d2b42_idx"),
        ),
        migrations.AddIndex(
            model_name="coachvisitformtemplate",
            index=models.Index(fields=["coach", "is_default"], name="students_co_coach_i_6733d0_idx"),
        ),
        migrations.AddConstraint(
            model_name="coachvisitformtemplate",
            constraint=models.UniqueConstraint(
                fields=("coach", "key"), name="uniq_coach_visit_form_template_key"
            ),
        ),
        migrations.AddConstraint(
            model_name="coachvisitformtemplate",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_default", True)),
                fields=("coach",),
                name="uniq_coach_default_visit_form_template",
            ),
        ),
        # --- Extend Visit ---
        migrations.AddField(
            model_name="visit",
            name="answer_sources",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="visit",
            name="answers",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="visit",
            name="coach_private_notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="visit",
            name="finalized_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="visit",
            name="form_template_key",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
        migrations.AddField(
            model_name="visit",
            name="form_template_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="visit",
            name="form_template_version",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="visit",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("waiting_for_student", "Waiting for student"),
                    ("student_submitted", "Student submitted"),
                    ("finalized", "Finalized"),
                ],
                default="finalized",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="visit",
            name="submitted_by_student_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="visit",
            name="form_template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="visits",
                to="students.coachvisitformtemplate",
            ),
        ),
        migrations.AddIndex(
            model_name="visit",
            index=models.Index(fields=["student", "status"], name="students_vi_student_fe70e3_idx"),
        ),
        # --- Data move then drop StudentAssessment ---
        migrations.RunPython(forwards_migrate, noop_reverse),
        migrations.DeleteModel(name="StudentAssessment"),
    ]
