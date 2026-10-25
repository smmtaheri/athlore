from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("students", "0019_remove_explicit_none_visit_options")]
    operations = [
        migrations.AddField(
            model_name="visit",
            name="program_settings",
            field=models.JSONField(blank=True, default=dict),
        )
    ]
