from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0017_add_gvt_and_antagonist_superset")]

    operations = [
        migrations.AddField(
            model_name="programtemplate",
            name="execution_plan",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
