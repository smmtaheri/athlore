import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("students", "0020_visit_program_settings")]
    operations = [
        migrations.CreateModel(
            name="VisitFinalizedSms",
            fields=[
                (
                    "visit",
                    models.OneToOneField(
                        primary_key=True,
                        serialize=False,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="finalized_sms",
                        to="students.visit",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        max_length=16,
                        default="pending",
                        choices=[
                            ("pending", "Pending"),
                            ("sending", "Sending"),
                            ("sent", "Accepted by provider"),
                            ("failed", "Failed"),
                            ("skipped", "Not eligible"),
                        ],
                    ),
                ),
                ("provider_message_id", models.PositiveBigIntegerField(null=True, blank=True)),
                ("error_code", models.CharField(max_length=64, blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("attempted_at", models.DateTimeField(null=True, blank=True)),
                ("sent_at", models.DateTimeField(null=True, blank=True)),
            ],
        )
    ]
