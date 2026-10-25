import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("programming", "0007_programrequest_training_constraints")]
    operations = [
        migrations.CreateModel(
            name="WorkoutSession",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, primary_key=True, serialize=False, editable=False
                    ),
                ),
                ("week", models.PositiveIntegerField()),
                ("day_id", models.CharField(max_length=160)),
                ("completed_sets", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="students.student"
                    ),
                ),
                (
                    "version",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT, to="programming.programversion"
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("student", "version", "week", "day_id"),
                        name="unique_workout_session",
                    )
                ]
            },
        )
    ]
