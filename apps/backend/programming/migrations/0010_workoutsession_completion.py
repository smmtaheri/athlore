from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("programming", "0009_workout_set_logs")]

    operations = [
        migrations.AddField(
            model_name="workoutsession",
            name="status",
            field=models.CharField(
                choices=[
                    ("in_progress", "In progress"),
                    ("completed", "Completed"),
                    ("completed_partial", "Completed with unfinished sets"),
                ],
                default="in_progress",
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name="workoutsession",
            name="finished_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
