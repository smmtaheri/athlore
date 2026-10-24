from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.exercise_media_services import process_next_video, remove_video
from accounts.models import CoachProfile, Exercise, ExerciseMediaAsset
from programming.models import Program, ProgramVersion
from programming.services.programs import serialize_student_program_detail
from students.models import Student


@override_settings(SMS_BACKEND="mock", PROGRAM_READY_SMS_ENABLED=False)
class ExerciseMediaTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username="video-coach")
        cls.coach = CoachProfile.objects.create(user=cls.user, display_name="Video Coach")
        cls.other_user = get_user_model().objects.create_user(username="other-video-coach")
        cls.other_coach = CoachProfile.objects.create(user=cls.other_user, display_name="Other")
        cls.shared = ExerciseMediaAsset.objects.get(key="incline")
        cls.exercise = Exercise.objects.create(
            coach=cls.coach, name="Press", primary_muscle="سینه", media_asset=cls.shared
        )
        cls.other_exercise = Exercise.objects.create(
            coach=cls.other_coach, name="Press", primary_muscle="سینه"
        )

    def setUp(self):
        self.media_directory = TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media_directory.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.client.force_authenticate(self.user)
        self.url = f"/api/v1/exercises/{self.exercise.pk}/media/"

    def upload(self, *, data=None, filename="demo.mp4"):
        if data is None:
            data = (
                Path(settings.BASE_DIR).parent / "front/public/media/workout/incline-preview.mp4"
            ).read_bytes()
        return self.client.post(
            self.url,
            {"file": SimpleUploadedFile(filename, data, content_type="video/mp4")},
            format="multipart",
        )

    def test_real_processing_generates_all_outputs_and_replaces_only_when_ready(self):
        response = self.upload()
        self.assertEqual(response.status_code, 202, response.data)
        asset = ExerciseMediaAsset.objects.get(pk=response.data["media_upload"]["id"])
        self.assertEqual(asset.owner_id, self.coach.id)
        self.exercise.refresh_from_db()
        self.assertEqual(self.exercise.media_asset_id, self.shared.id)
        self.assertTrue(process_next_video())
        asset.refresh_from_db()
        self.exercise.refresh_from_db()
        self.assertEqual(asset.status, "ready", asset.error_message)
        self.assertEqual(self.exercise.media_asset_id, asset.id)
        for value in (asset.preview_path, asset.poster_path, asset.reel_path):
            path = Path(self.media_directory.name) / value.removeprefix("/media/")
            self.assertTrue(path.is_file(), value)
            self.assertGreater(path.stat().st_size, 0)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o755)
        self.assertTrue(asset.original_file.storage.exists(asset.original_file.name))
        self.assertFalse(process_next_video())

    def test_other_coach_cannot_read_write_delete_or_retry_uploads(self):
        self.client.force_authenticate(self.other_user)
        for method in ("get", "post", "delete"):
            response = getattr(self.client, method)(self.url)
            self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(self.client.post(self.url + "retry/").status_code, 404)
        self.assertEqual(ExerciseMediaAsset.objects.filter(owner=self.other_coach).count(), 0)

    def test_invalid_extension_and_concurrent_upload_are_explicit_errors(self):
        response = self.upload(data=b"bad", filename="demo.exe")
        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.data["error"]["details"])
        self.assertEqual(self.upload().status_code, 202)
        self.assertEqual(self.upload().status_code, 409)

    def test_invalid_content_fails_without_replacing_previous_video_and_can_retry(self):
        response = self.upload(data=b"not a video")
        asset = ExerciseMediaAsset.objects.get(pk=response.data["media_upload"]["id"])
        with self.assertLogs("accounts.exercise_media_services", level="ERROR"):
            process_next_video()
        asset.refresh_from_db()
        self.exercise.refresh_from_db()
        self.assertEqual(asset.status, "failed")
        self.assertTrue(asset.error_message)
        self.assertEqual(self.exercise.media_asset_id, self.shared.id)
        self.assertEqual(self.client.post(self.url + "retry/").status_code, 202)
        asset.refresh_from_db()
        self.assertEqual(asset.status, "queued")

    def test_cancellation_during_transcoding_never_publishes_or_reattaches_media(self):
        response = self.upload()
        with patch(
            "accounts.exercise_media_services._transcode",
            side_effect=lambda *_: remove_video(self.exercise),
        ):
            process_next_video()
        asset = ExerciseMediaAsset.objects.get(pk=response.data["media_upload"]["id"])
        self.assertEqual(asset.status, "cancelled")
        self.exercise.refresh_from_db()
        self.assertIsNone(self.exercise.media_asset_id)

    def test_removal_cancels_failed_retry_and_does_not_delete_shared_asset(self):
        response = self.upload(data=b"invalid")
        ExerciseMediaAsset.objects.filter(pk=response.data["media_upload"]["id"]).update(
            status="failed"
        )
        removed = self.client.delete(self.url)
        self.assertEqual(removed.status_code, 200)
        self.assertIsNone(removed.data["media"])
        self.assertFalse(removed.data["media_upload"]["can_retry"])
        self.assertTrue(ExerciseMediaAsset.objects.filter(pk=self.shared.pk).exists())

    def test_stale_processing_job_becomes_visible_failure(self):
        response = self.upload()
        asset = ExerciseMediaAsset.objects.get(pk=response.data["media_upload"]["id"])
        asset.status = "processing"
        asset.processing_started_at = timezone.now() - timedelta(minutes=25)
        asset.save()
        self.assertFalse(process_next_video())
        asset.refresh_from_db()
        self.assertEqual(asset.status, "failed")

    def test_existing_program_resolves_current_owned_video_without_mutating_prescription(self):
        student = Student.objects.create(
            coach=self.coach,
            full_name="Athlete",
            age=28,
            gender="male",
            height_cm=180,
            weight_kg=80,
        )
        program = Program.objects.create(
            coach=self.coach,
            student=student,
            title="Plan",
            program_type="workout",
            date_range_start=date(2026, 10, 1),
            date_range_end=date(2026, 10, 28),
        )
        training = {
            "days": [
                {
                    "id": "d1",
                    "exercises": [
                        {
                            "id": "e1",
                            "exercise_id": str(self.exercise.id),
                            "sets": 3,
                            "media": {"key": "old", "reel_url": "https://stale.test/video.mp4"},
                        },
                        {
                            "id": "e2",
                            "exercise_id": str(self.other_exercise.id),
                            "media": {"key": "foreign"},
                        },
                    ],
                }
            ]
        }
        version = ProgramVersion.objects.create(
            program=program,
            coach=self.coach,
            version_number=1,
            status="finalized",
            training=training,
        )
        program.active_version = version
        program.save()
        before = deepcopy(training)
        exercises = serialize_student_program_detail(program)["training"]["days"][0]["exercises"]
        self.assertEqual(exercises[0]["media"]["key"], "incline")
        self.assertTrue(exercises[0]["media"]["reel_url"].startswith("/media/workout/"))
        self.assertIsNone(exercises[1]["media"])
        remove_video(self.exercise)
        self.assertIsNone(
            serialize_student_program_detail(program)["training"]["days"][0]["exercises"][0][
                "media"
            ]
        )
        version.refresh_from_db()
        self.assertEqual(version.training, before)
