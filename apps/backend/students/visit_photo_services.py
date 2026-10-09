from __future__ import annotations

from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from PIL import Image, UnidentifiedImageError

from common.exceptions import ConflictError
from students.models import StagedVisitPhoto, Visit, VisitPhoto

ALLOWED_IMAGE_TYPES = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}
MAX_IMAGE_PIXELS = 40_000_000
STAGED_PHOTO_LIFETIME = timedelta(hours=24)
MAX_ACTIVE_STAGED_PHOTOS_PER_USER = 8
MAX_TOTAL_STAGED_BYTES = 512 * 1024 * 1024
POSE_LABELS = {"front": "جلو", "left_side": "پهلو چپ", "back": "پشت", "right_side": "پهلو راست"}


def photos_for_visit(visit: Visit):
    return VisitPhoto.objects.filter(visit=visit).select_related("uploaded_by")


def serialize_photo(photo: VisitPhoto) -> dict:
    return {
        "id": str(photo.id),
        "visit_id": str(photo.visit_id),
        "pose": photo.pose,
        "original_filename": photo.original_filename,
        "content_type": photo.content_type,
        "size_bytes": photo.size_bytes,
        "uploader_role": photo.uploader_role,
        "uploaded_at": photo.uploaded_at.isoformat().replace("+00:00", "Z"),
        "download_path": f"/visits/photos/{photo.id}/download/",
    }


@transaction.atomic
def add_visit_photo(
    visit: Visit, *, uploaded_file, pose: str, actor, uploader_role: str
) -> VisitPhoto:
    if not uploaded_file:
        raise ValidationError({"file": ["یک عکس انتخاب کنید."]})

    visit = Visit.objects.select_for_update().get(pk=visit.pk)
    if VisitPhoto.objects.filter(visit=visit, pose=pose).exists():
        raise ConflictError(
            detail="این پوز قبلاً برای این ویزیت عکس دارد و قابل جایگزینی نیست.",
            code="visit_photo_pose_taken",
        )

    original_filename, content_type, extension, size = validate_visit_photo_file(uploaded_file)

    photo = VisitPhoto(
        visit=visit,
        pose=pose,
        uploaded_by=actor,
        uploader_role=uploader_role,
        original_filename=original_filename,
        content_type=content_type,
        size_bytes=size,
    )
    try:
        with transaction.atomic():
            photo.file.save(f"{photo.id}.{extension}", uploaded_file, save=False)
            photo.save()
    except IntegrityError as exc:
        if photo.file:
            photo.file.delete(save=False)
        if VisitPhoto.objects.filter(visit=visit, pose=pose).exists():
            raise ConflictError(
                detail="این پوز هم‌زمان برای این ویزیت ثبت شده است.",
                code="visit_photo_pose_taken",
            ) from exc
        raise
    return photo


def validate_visit_photo_file(uploaded_file):
    size = getattr(uploaded_file, "size", 0) or 0
    if size <= 0 or size > VisitPhoto.MAX_UPLOAD_BYTES:
        raise ValidationError({"file": ["حجم عکس باید بیشتر از صفر و حداکثر ۱۰ مگابایت باشد."]})

    try:
        image = Image.open(uploaded_file)
        image_format = image.format
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise ValidationError({"file": ["ابعاد عکس بیش از حد مجاز است."]})
        image.verify()
    except ValidationError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValidationError({"file": ["فایل انتخاب‌شده یک تصویر معتبر نیست."]}) from exc

    image_type = ALLOWED_IMAGE_TYPES.get(image_format or "")
    if image_type is None:
        raise ValidationError({"file": ["فقط عکس‌های JPEG، PNG یا WebP پذیرفته می‌شوند."]})
    content_type, extension = image_type
    uploaded_file.seek(0)

    original_filename = (getattr(uploaded_file, "name", "") or "photo").replace("\\", "/")
    original_filename = original_filename.rsplit("/", 1)[-1][:255]
    return original_filename, content_type, extension, size


@transaction.atomic
def stage_visit_photo(*, session_id, student, visit, pose, uploaded_file, actor, uploader_role):
    if not uploaded_file:
        raise ValidationError({"file": ["یک عکس انتخاب کنید."]})
    if visit and (visit.student_id != student.id or visit.coach_id != student.coach_id):
        raise ValidationError({"visit": ["ویزیت و شاگرد مطابقت ندارند."]})
    if visit and VisitPhoto.objects.filter(visit=visit, pose=pose).exists():
        raise ConflictError(
            detail="این پوز قبلاً برای این ویزیت ثبت شده است.",
            code="visit_photo_pose_taken",
        )
    if (
        StagedVisitPhoto.objects.filter(session_id=session_id)
        .exclude(uploaded_by=actor, student=student, visit=visit)
        .exists()
    ):
        raise ConflictError(detail="جلسهٔ آپلود برای این ویزیت معتبر نیست.")

    existing = (
        StagedVisitPhoto.objects.select_for_update()
        .filter(session_id=session_id, pose=pose)
        .first()
    )
    if (
        existing is None
        and StagedVisitPhoto.objects.filter(
            uploaded_by=actor, expires_at__gt=timezone.now()
        ).count()
        >= MAX_ACTIVE_STAGED_PHOTOS_PER_USER
    ):
        raise ValidationError(
            {"file": ["سقف عکس‌های موقت پر شده است؛ عکس‌های قبلی را ثبت یا حذف کنید."]}
        )
    original_filename, content_type, extension, size = validate_visit_photo_file(uploaded_file)
    staged_bytes = StagedVisitPhoto.objects.aggregate(total=Sum("size_bytes"))["total"] or 0
    previous_bytes = existing.size_bytes if existing else 0
    if staged_bytes - previous_bytes + size > MAX_TOTAL_STAGED_BYTES:
        raise ValidationError({"file": ["فضای آپلود موقت پر شده است؛ کمی بعد دوباره تلاش کنید."]})

    staged = existing or StagedVisitPhoto(
        session_id=session_id,
        student=student,
        visit=visit,
        uploaded_by=actor,
        uploader_role=uploader_role,
        pose=pose,
    )
    old_name = staged.file.name if existing else ""
    staged.original_filename = original_filename
    staged.content_type = content_type
    staged.size_bytes = size
    staged.expires_at = timezone.now() + STAGED_PHOTO_LIFETIME
    try:
        staged.file.save(f"{staged.id}.{extension}", uploaded_file, save=False)
        staged.save()
    except Exception:
        if staged.file and staged.file.name != old_name:
            staged.file.delete(save=False)
        raise
    if old_name and old_name != staged.file.name:
        storage = staged.file.storage
        transaction.on_commit(lambda: storage.delete(old_name))
    return staged


@transaction.atomic
def discard_staged_photo(*, photo_id, actor):
    staged = (
        StagedVisitPhoto.objects.select_for_update().filter(pk=photo_id, uploaded_by=actor).first()
    )
    if staged is None:
        return False
    staged.delete()
    return True


@transaction.atomic
def commit_staged_photos(*, session_id, visit, actor, allow_unbound=False):
    visit = Visit.objects.select_for_update().get(pk=visit.pk)
    # Existing visit uploads have a visit scope; new-visit uploads do not.
    scoped = list(
        StagedVisitPhoto.objects.select_for_update().filter(
            session_id=session_id, uploaded_by=actor, student=visit.student
        )
    )
    allowed_visit_ids = (None, visit.id) if allow_unbound else (visit.id,)
    staged_photos = [item for item in scoped if item.visit_id in allowed_visit_ids]
    issues = []
    if not staged_photos:
        return ["عکس‌های موقت این ویزیت پیدا نشدند؛ در صورت نیاز دوباره آپلود کنید."]
    for staged in staged_photos:
        pose_label = POSE_LABELS.get(staged.pose, staged.pose)
        if staged.expires_at <= timezone.now():
            issues.append(f"عکس پوز {pose_label} منقضی شد.")
            staged.delete()
            continue
        if VisitPhoto.objects.filter(visit=visit, pose=staged.pose).exists():
            issues.append(f"پوز {pose_label} قبلاً ثبت شده است.")
            staged.delete()
            continue
        VisitPhoto.objects.create(
            visit=visit,
            pose=staged.pose,
            uploaded_by=actor,
            uploader_role=staged.uploader_role,
            file=staged.file.name,
            original_filename=staged.original_filename,
            content_type=staged.content_type,
            size_bytes=staged.size_bytes,
        )
        staged.delete()
    return issues


def ensure_student_upload_allowed(visit: Visit) -> None:
    if visit.status == Visit.Status.DRAFT:
        raise ValidationError({"visit": ["عکس فقط برای ویزیت ارسال‌شده قابل ثبت است."]})
