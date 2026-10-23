from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0018_programtemplate_execution_plan")]
    operations = [
        migrations.AddField(
            model_name="coachprofile",
            name="program_defaults",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="exercise",
            name="tutorial_url",
            field=models.URLField(blank=True, default="", max_length=1024),
        ),
        migrations.AddField(
            model_name="exercise",
            name="execution_guide",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
