from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("students", "0012_visitphoto")]

    operations = [
        migrations.AddField(
            model_name="coachvisitformtemplate",
            name="theme",
            field=models.CharField(
                choices=[("athlore", "Athlore"), ("athlore_compact", "Athlore compact")],
                default="athlore",
                max_length=24,
            ),
        ),
    ]
