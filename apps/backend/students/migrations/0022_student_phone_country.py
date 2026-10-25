from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("students", "0021_visit_finalized_sms")]

    operations = [
        migrations.AddField(
            model_name="student",
            name="phone_country",
            field=models.CharField(default="IR", max_length=2),
        ),
    ]
