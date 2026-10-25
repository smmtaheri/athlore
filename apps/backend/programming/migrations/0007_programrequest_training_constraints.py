from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("programming", "0006_programrequest_cancelled_by")]

    operations = [
        migrations.AddField(
            model_name="programrequest",
            name="session_duration_minutes",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="programrequest",
            name="equipment_available",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
