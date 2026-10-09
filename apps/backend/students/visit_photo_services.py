from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from PIL import Image, UnidentifiedImageError

from common.exceptions import ConflictError
from students.models import Visit, VisitPhoto

ALLOWED_IMAGE_TYPES = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}
MAX_IMAGE_PIXELS = 40_000_000


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


def ensure_student_upload_allowed(visit: Visit) -> None:
    if visit.status == Visit.Status.DRAFT:
        raise ValidationError({"visit": ["عکس فقط برای ویزیت ارسال‌شده قابل ثبت است."]})
