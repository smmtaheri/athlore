# Generated manually on 2026-09-17.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_expand_training_technique_schemas"),
    ]

    operations = [
        migrations.AddField(
            model_name="exercise",
            name="external_key",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
        migrations.AddConstraint(
            model_name="exercise",
            constraint=models.UniqueConstraint(
                condition=models.Q(("external_key", ""), _negated=True),
                fields=("coach", "external_key"),
                name="uniq_coach_exercise_external_key",
            ),
        ),
        migrations.AddIndex(
            model_name="exercise",
            index=models.Index(fields=["coach", "external_key"], name="ex_coach_external_idx"),
        ),
    ]
