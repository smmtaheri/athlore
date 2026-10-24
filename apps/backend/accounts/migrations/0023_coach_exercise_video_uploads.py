import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

import accounts.models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0022_complete_student_tutorial_sources")]

    operations = [
        migrations.AddField("exercisemediaasset", "owner", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="exercise_media_assets", to="accounts.coachprofile")),
        migrations.AddField("exercisemediaasset", "upload_for", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="media_uploads", to="accounts.exercise")),
        migrations.AddField("exercisemediaasset", "original_file", models.FileField(blank=True, max_length=512, upload_to=accounts.models.exercise_video_upload_to)),
        migrations.AddField("exercisemediaasset", "original_filename", models.CharField(blank=True, default="", max_length=255)),
        migrations.AddField("exercisemediaasset", "status", models.CharField(choices=[("queued", "Queued"), ("processing", "Processing"), ("ready", "Ready"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="ready", max_length=16)),
        migrations.AddField("exercisemediaasset", "error_message", models.CharField(blank=True, default="", max_length=255)),
        migrations.AddField("exercisemediaasset", "processing_started_at", models.DateTimeField(blank=True, null=True)),
        migrations.AddField("exercisemediaasset", "duration_seconds", models.FloatField(blank=True, null=True)),
        migrations.AddField("exercisemediaasset", "created_at", models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now), preserve_default=False),
        migrations.AddField("exercisemediaasset", "updated_at", models.DateTimeField(auto_now=True)),
        migrations.AlterField("exercisemediaasset", "source_url", models.URLField(blank=True, max_length=1024)),
        migrations.AlterField("exercisemediaasset", "license_url", models.URLField(blank=True, max_length=1024)),
        migrations.AlterField("exercisemediaasset", "license_name", models.CharField(blank=True, max_length=160)),
        migrations.AlterField("exercisemediaasset", "preview_path", models.CharField(blank=True, max_length=255)),
        migrations.AlterField("exercisemediaasset", "poster_path", models.CharField(blank=True, max_length=255)),
        migrations.AlterField("exercisemediaasset", "reel_path", models.CharField(blank=True, max_length=255)),
    ]
