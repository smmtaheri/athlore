from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0008_visit_coach_review_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentprofile",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
        migrations.RemoveField(
            model_name="studentprofile",
            name="activation_code_expires_at",
        ),
        migrations.RemoveField(
            model_name="studentprofile",
            name="activation_code_hash",
        ),
        migrations.RemoveField(
            model_name="studentprofile",
            name="activation_code_used_at",
        ),
    ]
