"""Coach-scoped uploads and durable, bounded video processing jobs."""

import json
import logging
import shutil
import subprocess
import tempfile
import uuid
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Exercise, ExerciseMediaAsset
from common.exceptions import ConflictError

logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_DURATION_SECONDS = 120
ACTIVE_STATUSES = (ExerciseMediaAsset.Status.QUEUED, ExerciseMediaAsset.Status.PROCESSING)
LEASE = timedelta(minutes=20)


class InvalidExerciseVideo(ValueError):
    pass


def media_payload(exercise):
    asset = exercise.media_asset
    if not asset or not asset.is_active or asset.status != ExerciseMediaAsset.Status.READY:
        return None
    if asset.owner_id and asset.owner_id != exercise.coach_id:
        return None
    return asset.public_payload()


def upload_payload(asset):
    if not asset:
        return None
    return {
        "id": str(asset.id),
        "status": asset.status,
        "original_filename": asset.original_filename,
        "error_message": asset.error_message,
        "can_retry": asset.status == ExerciseMediaAsset.Status.FAILED and bool(asset.original_file),
    }


def latest_upload(exercise):
    if hasattr(exercise, "_media_uploads"):
        return next(iter(exercise._media_uploads), None)
    return exercise.media_uploads.filter(owner_id=exercise.coach_id).order_by("-created_at").first()


def serialize_media(exercise):
    return {
        "media": media_payload(exercise),
        "media_upload": upload_payload(latest_upload(exercise)),
    }


def _ensure_no_pending(exercise):
    if exercise.media_uploads.filter(status__in=ACTIVE_STATUSES).exists():
        raise ConflictError("ویدئوی این حرکت در حال آماده‌سازی است؛ کمی صبر کنید.")


@transaction.atomic
def upload_video(exercise, uploaded_file, *, metadata=None):
    exercise = Exercise.objects.select_for_update().get(pk=exercise.pk)
    if exercise.is_archived:
        raise ValidationError({"file": ["برای حرکت آرشیوشده نمی‌توان ویدئو بارگذاری کرد."]})
    _ensure_no_pending(exercise)
    if not uploaded_file or not 0 < uploaded_file.size <= MAX_UPLOAD_BYTES:
        raise ValidationError({"file": ["یک ویدئو با حجم حداکثر ۱۰۰ مگابایت انتخاب کنید."]})
    filename = uploaded_file.name.replace("\\", "/").rsplit("/", 1)[-1]
    if Path(filename).suffix.lower() not in {".mp4", ".mov"}:
        raise ValidationError({"file": ["فقط ویدئوی MP4 یا MOV پذیرفته می‌شود."]})
    if (
        ExerciseMediaAsset.objects.filter(owner=exercise.coach, status__in=ACTIVE_STATUSES).count()
        >= 5
    ):
        raise ConflictError("حداکثر پنج ویدئو می‌تواند هم‌زمان در صف آماده‌سازی باشد.")
    metadata = metadata or {}
    asset = ExerciseMediaAsset(
        key=f"upload-{uuid.uuid4().hex}",
        owner=exercise.coach,
        upload_for=exercise,
        title_fa=exercise.name,
        author=metadata.get("author") or exercise.coach.display_name,
        source_url=metadata.get("source_url", ""),
        license_name=metadata.get("license_name", ""),
        license_url=metadata.get("license_url", ""),
        original_filename=filename[:255],
        status=ExerciseMediaAsset.Status.QUEUED,
    )
    try:
        asset.original_file.save(filename, uploaded_file, save=False)
        asset.save()
    except Exception:
        if asset.original_file:
            asset.original_file.delete(save=False)
        raise
    return asset


@transaction.atomic
def remove_video(exercise):
    exercise = Exercise.objects.select_for_update().get(pk=exercise.pk)
    exercise.media_uploads.filter(
        status__in=(*ACTIVE_STATUSES, ExerciseMediaAsset.Status.FAILED)
    ).update(status=ExerciseMediaAsset.Status.CANCELLED, updated_at=timezone.now())
    exercise.media_asset = None
    exercise.tutorial_url = ""
    exercise.tutorial_source_url = ""
    exercise.save(
        update_fields=["media_asset", "tutorial_url", "tutorial_source_url", "updated_at"]
    )
    return exercise


@transaction.atomic
def retry_video(exercise):
    exercise = Exercise.objects.select_for_update().get(pk=exercise.pk)
    _ensure_no_pending(exercise)
    asset = latest_upload(exercise)
    if (
        exercise.is_archived
        or not asset
        or asset.status != ExerciseMediaAsset.Status.FAILED
        or not asset.original_file
    ):
        raise ValidationError(
            {"file": ["ویدئوی ناموفق قابل تلاشی وجود ندارد؛ فایل را دوباره انتخاب کنید."]}
        )
    asset.status = ExerciseMediaAsset.Status.QUEUED
    asset.error_message = ""
    asset.save(update_fields=["status", "error_message", "updated_at"])
    return asset


def _run(command, timeout=180):
    # No shell or remote URLs: only local, UUID-named files are passed to FFmpeg.
    return subprocess.run(command, check=True, capture_output=True, timeout=timeout)  # noqa: S603


def _probe(source):
    result = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(source),
        ],
        timeout=30,
    )
    data = json.loads(result.stdout)
    stream = next(
        (item for item in data.get("streams", []) if item.get("codec_type") == "video"), None
    )
    duration = float(data.get("format", {}).get("duration", 0))
    if not stream or not 0 < duration <= MAX_DURATION_SECONDS:
        raise InvalidExerciseVideo("ویدئو باید معتبر و کوتاه‌تر از دو دقیقه باشد.")
    if not 0 < int(stream.get("width", 0)) * int(stream.get("height", 0)) <= 3840 * 2160:
        raise InvalidExerciseVideo("ابعاد ویدئو باید حداکثر 4K باشد.")
    return duration


def _transcode(source, destination, duration):
    common = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        str(source),
        "-threads",
        "2",
        "-filter_threads",
        "1",
    ]
    scale = "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"
    _run(
        [
            *common,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            scale,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "24",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(destination / "video.mp4"),
        ]
    )
    _run(
        [
            *common,
            "-map",
            "0:v:0",
            "-an",
            "-t",
            str(min(duration, 6)),
            "-vf",
            "scale='min(400,iw)':'min(400,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "24",
            "-movflags",
            "+faststart",
            str(destination / "preview.mp4"),
        ]
    )
    _run(
        [
            *common,
            "-ss",
            str(min(duration * 0.15, 2)),
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            scale,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(destination / "poster.jpg"),
        ]
    )


def process_next_video():
    """Claim a durable job; publish a complete revision only after all outputs succeed."""
    now = timezone.now()
    ExerciseMediaAsset.objects.filter(
        status=ExerciseMediaAsset.Status.PROCESSING,
        processing_started_at__lt=now - LEASE,
    ).update(
        status=ExerciseMediaAsset.Status.FAILED,
        error_message="آماده‌سازی قطع شد؛ دوباره تلاش کنید.",
        updated_at=now,
    )
    with transaction.atomic():
        asset = (
            ExerciseMediaAsset.objects.select_for_update()
            .filter(
                status=ExerciseMediaAsset.Status.QUEUED,
            )
            .order_by("created_at")
            .first()
        )
        if asset is None:
            return False
        asset.status = ExerciseMediaAsset.Status.PROCESSING
        asset.processing_started_at = now
        asset.save(update_fields=["status", "processing_started_at", "updated_at"])
    published_directory = None
    try:
        duration = _probe(asset.original_file.path)
        private_directory = Path(asset.original_file.path).parent
        with tempfile.TemporaryDirectory(dir=private_directory) as temporary:
            outputs = Path(temporary)
            _transcode(asset.original_file.path, outputs, duration)
            with transaction.atomic():
                exercise = (
                    Exercise.objects.select_for_update().filter(pk=asset.upload_for_id).first()
                )
                current = ExerciseMediaAsset.objects.select_for_update().get(pk=asset.pk)
                if (
                    current.status != ExerciseMediaAsset.Status.PROCESSING
                    or not exercise
                    or exercise.coach_id != asset.owner_id
                    or exercise.is_archived
                ):
                    if current.status == ExerciseMediaAsset.Status.PROCESSING:
                        current.status = ExerciseMediaAsset.Status.CANCELLED
                        current.save(update_fields=["status", "updated_at"])
                    return True
                published_directory = (
                    Path(settings.MEDIA_ROOT) / "workout" / "uploads" / str(asset.id)
                )
                published_directory.parent.mkdir(parents=True, exist_ok=True)
                # A worker may have stopped after publishing files but before
                # committing this still-unpublished job's database association.
                if published_directory.exists():
                    shutil.rmtree(published_directory)
                outputs.chmod(0o755)
                for output in outputs.iterdir():
                    output.chmod(0o644)
                shutil.move(str(outputs), published_directory)
                url = f"/media/workout/uploads/{asset.id}"
                current.preview_path = f"{url}/preview.mp4"
                current.poster_path = f"{url}/poster.jpg"
                current.reel_path = f"{url}/video.mp4"
                current.duration_seconds = duration
                current.status = ExerciseMediaAsset.Status.READY
                current.error_message = ""
                current.save()
                exercise.media_asset = current
                exercise.save(update_fields=["media_asset", "updated_at"])
    except Exception as exc:
        if published_directory and published_directory.exists():
            shutil.rmtree(published_directory)
        logger.exception(
            "Exercise video processing failed asset_id=%s coach_id=%s", asset.id, asset.owner_id
        )
        message = (
            str(exc)
            if isinstance(exc, InvalidExerciseVideo)
            else "آماده‌سازی ویدئو ناموفق بود؛ دوباره تلاش کنید یا فایل دیگری انتخاب کنید."
        )
        ExerciseMediaAsset.objects.filter(
            pk=asset.pk, status=ExerciseMediaAsset.Status.PROCESSING
        ).update(
            status=ExerciseMediaAsset.Status.FAILED,
            error_message=message[:255],
            updated_at=timezone.now(),
        )
    return True
