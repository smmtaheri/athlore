from __future__ import annotations

import hashlib
from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from delivery.models import PdfArtifact, StagedProgramPdf
from delivery.services.artifacts import normalize_display_name
from programming.models import ProgramVersion

MAX_PROGRAM_PDF_BYTES = 25 * 1024 * 1024
MAX_STAGED_BYTES_PER_COACH = 500 * 1024 * 1024
MAX_STAGED_FILES_PER_COACH = 10
STAGED_PROGRAM_PDF_LIFETIME = timedelta(days=7)


def validate_program_pdf(uploaded_file) -> tuple[str, int]:
    size = int(getattr(uploaded_file, "size", 0) or 0)
    name = (getattr(uploaded_file, "name", "") or "program.pdf").replace("\\", "/")
    name = name.rsplit("/", 1)[-1][:255]
    if size <= 0 or size > MAX_PROGRAM_PDF_BYTES:
        raise ValidationError({"file": ["حجم PDF باید بیشتر از صفر و حداکثر ۲۵ مگابایت باشد."]})
    if not name.lower().endswith(".pdf"):
        raise ValidationError({"file": ["فقط فایل PDF پذیرفته می‌شود."]})

    try:
        uploaded_file.seek(0)
        header = uploaded_file.read(5)
        uploaded_file.seek(max(0, size - 2048))
        tail = uploaded_file.read(2048)
        uploaded_file.seek(0)
    except (AttributeError, OSError) as exc:
        raise ValidationError({"file": ["خواندن فایل PDF ممکن نشد."]}) from exc
    if header != b"%PDF-" or b"%%EOF" not in tail:
        raise ValidationError({"file": ["فایل انتخاب‌شده یک PDF معتبر نیست."]})
    return name, size


@transaction.atomic
def stage_program_pdf(*, coach, student, actor, uploaded_file) -> StagedProgramPdf:
    if student.coach_id != coach.id:
        raise NotFound(detail="Not found.")
    # Serialize quota checks for simultaneous uploads by the same coach.
    type(coach).objects.select_for_update().get(pk=coach.pk)
    original_filename, size = validate_program_pdf(uploaded_file)
    now = timezone.now()
    active = StagedProgramPdf.objects.filter(coach=coach, expires_at__gt=now)
    if active.count() >= MAX_STAGED_FILES_PER_COACH:
        raise ValidationError(
            {"file": ["تعداد فایل‌های موقت زیاد است؛ فایل‌های قبلی را ثبت یا حذف کنید."]}
        )
    total = active.aggregate(total=Sum("size_bytes"))["total"] or 0
    if total + size > MAX_STAGED_BYTES_PER_COACH:
        raise ValidationError({"file": ["فضای موقت آپلود پر شده است؛ کمی بعد دوباره تلاش کنید."]})

    staged = StagedProgramPdf(
        coach=coach,
        student=student,
        uploaded_by=actor,
        original_filename=original_filename,
        size_bytes=size,
        expires_at=now + STAGED_PROGRAM_PDF_LIFETIME,
    )
    try:
        staged.file.save(f"{staged.id}.pdf", uploaded_file, save=False)
        staged.save()
    except Exception:
        if staged.file:
            staged.file.delete(save=False)
        raise
    return staged


@transaction.atomic
def clone_program_pdf_to_draft(
    source_version: ProgramVersion, target_version: ProgramVersion, *, actor=None
) -> StagedProgramPdf | None:
    """Copy an uploaded PDF into a new draft's private staging area."""
    if source_version.delivery_source != ProgramVersion.DeliverySource.UPLOADED_PDF:
        return None

    source_file = None
    original_filename = "program.pdf"
    staged_source = StagedProgramPdf.objects.filter(
        program_version=source_version,
        expires_at__gt=timezone.now(),
    ).first()
    if staged_source:
        source_file = staged_source.file
        original_filename = staged_source.original_filename
        actor = actor or staged_source.uploaded_by
    else:
        artifact = (
            PdfArtifact.objects.filter(
                program_version=source_version,
                source=PdfArtifact.Source.UPLOADED,
                status=PdfArtifact.Status.READY,
                deleted_at__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        if artifact and artifact.file:
            source_file = artifact.file
            original_filename = artifact.original_filename or artifact.display_name

    if source_file is None:
        return None

    try:
        source_file.open("rb")
        contents = source_file.read()
    except (OSError, FileNotFoundError):
        return None
    finally:
        try:
            source_file.close()
        except OSError:
            pass

    copy_file = ContentFile(contents, name=original_filename)
    validate_program_pdf(copy_file)
    clone = stage_program_pdf(
        coach=target_version.coach,
        student=target_version.program.student,
        actor=actor or target_version.coach.user,
        uploaded_file=copy_file,
    )
    clone.program_version = target_version
    clone.expires_at = timezone.now() + STAGED_PROGRAM_PDF_LIFETIME
    clone.save(update_fields=["program_version", "expires_at"])
    return clone


def get_staged_pdf_for_coach(coach, staged_id) -> StagedProgramPdf:
    try:
        return StagedProgramPdf.objects.select_related("student", "program_version").get(
            pk=staged_id,
            coach=coach,
            expires_at__gt=timezone.now(),
        )
    except StagedProgramPdf.DoesNotExist as exc:
        raise NotFound(detail="فایل موقت پیدا نشد یا مهلتش تمام شده است.") from exc


@transaction.atomic
def discard_staged_pdf(*, coach, staged_id) -> None:
    try:
        staged = StagedProgramPdf.objects.select_for_update().get(pk=staged_id, coach=coach)
    except StagedProgramPdf.DoesNotExist as exc:
        raise NotFound(detail="Not found.") from exc
    if staged.program_version_id:
        version = staged.program_version
        if version.status != ProgramVersion.Status.DRAFT:
            raise ValidationError({"file": ["فایل برنامه نهایی‌شده قابل حذف نیست."]})
        staged.program_version = None
        staged.save(update_fields=["program_version"])
    filename = staged.file.name
    storage = staged.file.storage
    staged.delete()
    transaction.on_commit(lambda: storage.delete(filename))


def _discard_promoted_stage(staged_id) -> None:
    staged = StagedProgramPdf.objects.filter(pk=staged_id).first()
    if not staged:
        return
    filename = staged.file.name
    storage = staged.file.storage
    staged.delete()
    storage.delete(filename)


@transaction.atomic
def promote_staged_pdf(version: ProgramVersion, *, actor) -> PdfArtifact:
    staged = (
        StagedProgramPdf.objects.select_for_update()
        .filter(program_version=version, expires_at__gt=timezone.now())
        .first()
    )
    if staged is None:
        raise ValidationError(
            {"file": ["فایل موقت منقضی شده یا پیدا نمی‌شود؛ لطفاً PDF را دوباره بارگذاری کنید."]},
            code="staged_pdf_missing",
        )

    try:
        staged.file.open("rb")
        contents = staged.file.read()
        staged.file.close()
    except (OSError, DjangoValidationError) as exc:
        raise ValidationError({"file": ["خواندن PDF بارگذاری‌شده ممکن نشد."]}) from exc
    if (
        not contents
        or len(contents) > MAX_PROGRAM_PDF_BYTES
        or not contents.startswith(b"%PDF-")
        or b"%%EOF" not in contents[-2048:]
    ):
        raise ValidationError({"file": ["PDF بارگذاری‌شده دیگر معتبر نیست؛ دوباره بارگذاری کنید."]})

    title = version.program.title.replace("/", "-").replace("\\", "-").strip()
    display_name = normalize_display_name(f"{(title or 'برنامه')[:200]}.pdf")
    artifact = PdfArtifact(
        coach=version.coach,
        student=version.program.student,
        program=version.program,
        program_version=version,
        source=PdfArtifact.Source.UPLOADED,
        display_name=display_name,
        original_filename=staged.original_filename,
        status=PdfArtifact.Status.READY,
        mime_type="application/pdf",
        size_bytes=len(contents),
        checksum_sha256=hashlib.sha256(contents).hexdigest(),
        program_type=version.program.program_type,
        version_label=f"v{version.version_number}",
        created_by=actor,
        generated_at=timezone.now(),
    )
    artifact.file.save(display_name, ContentFile(contents), save=False)
    artifact.save()
    transaction.on_commit(lambda: _discard_promoted_stage(staged.id))
    return artifact
