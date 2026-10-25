import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("programming", "0002_programversion_delivery_source")]

    operations = [
        migrations.CreateModel(
            name="ProgramReadySms",
            fields=[
                (
                    "version",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        primary_key=True,
                        related_name="ready_sms",
                        serialize=False,
                        to="programming.programversion",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("sending", "Sending"),
                            ("sent", "Accepted by provider"),
                            ("failed", "Failed"),
                            ("skipped", "Not eligible"),
                        ],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("provider_message_id", models.PositiveBigIntegerField(blank=True, null=True)),
                ("error_code", models.CharField(blank=True, default="", max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("attempted_at", models.DateTimeField(blank=True, null=True)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
            ],
        ),
    ]
