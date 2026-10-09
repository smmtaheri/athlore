from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("students", "0013_coachvisitformtemplate_theme")]

    operations = [
        migrations.AddField(
            model_name="visitphoto",
            name="pose",
            field=models.CharField(
                blank=True,
                choices=[
                    ("front", "Front"),
                    ("left_side", "Left side"),
                    ("back", "Back"),
                    ("right_side", "Right side"),
                ],
                max_length=16,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="visitphoto",
            constraint=models.UniqueConstraint(
                condition=models.Q(pose__isnull=False),
                fields=("visit", "pose"),
                name="uniq_visit_photo_pose",
            ),
        ),
    ]
