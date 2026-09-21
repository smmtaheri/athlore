from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("students", "0010_body_check_v1"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bodycheckcycle",
            name="status",
            field=models.CharField(
                choices=[
                    ("active", "Active"),
                    ("closed", "Closed"),
                    ("expired", "Expired"),
                ],
                default="active",
                max_length=16,
            ),
        ),
    ]
