import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import students.models


class Migration(migrations.Migration):
    dependencies = [
        ("students", "0014_visitphoto_pose_slots"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="StagedVisitPhoto",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("session_id", models.UUIDField(db_index=True)),
                (
                    "uploader_role",
                    models.CharField(
                        choices=[("coach", "Coach"), ("student", "Student")], max_length=16
                    ),
                ),
                (
                    "pose",
                    models.CharField(
                        choices=[
                            ("front", "Front"),
                            ("left_side", "Left side"),
                            ("back", "Back"),
                            ("right_side", "Right side"),
                        ],
                        max_length=16,
                    ),
                ),
                (
                    "file",
                    models.FileField(
                        max_length=512, upload_to=students.models.staged_visit_photo_upload_to
                    ),
                ),
                ("original_filename", models.CharField(max_length=255)),
                ("content_type", models.CharField(max_length=100)),
                ("size_bytes", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField(db_index=True)),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="students.student"
                    ),
                ),
                (
                    "visit",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to="students.visit",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("session_id", "pose"), name="uniq_staged_visit_photo_pose"
                    )
                ],
            },
        ),
    ]
