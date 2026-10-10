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
def stage_program_pdf(*, coach, student, actor, uploaded_file, section="") -> StagedProgramPdf:
    if student.coach_id != coach.id:
        raise NotFound(detail="Not found.")
    if section not in {"", "workout", "nutrition", "supplement"}:
        raise ValidationError({"section": ["نوع بخش برنامه معتبر نیست."]})
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
        section=section,
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
    """Copy uploaded section PDFs into a new draft's private staging area."""
    staged_sources = list(
        StagedProgramPdf.objects.filter(
            program_version=source_version,
            expires_at__gt=timezone.now(),
        ).order_by("section", "created_at")
    )
    sources = [
        (item.file, item.original_filename, item.section, item.uploaded_by)
        for item in staged_sources
    ]
    if not sources:
        artifacts = list(
            PdfArtifact.objects.filter(
                program_version=source_version,
                source=PdfArtifact.Source.UPLOADED,
                status=PdfArtifact.Status.READY,
                deleted_at__isnull=True,
            ).order_by("section", "-created_at")
        )
        latest_by_section = {}
        for artifact in artifacts:
            latest_by_section.setdefault(artifact.section, artifact)
        sources = [
            (
                item.file,
                item.original_filename or item.display_name,
                item.section,
                item.created_by,
            )
            for item in latest_by_section.values()
            if item.file
        ]

    if not sources:
        return None

    clones = []
    for source_file, original_filename, section, source_actor in sources:
        try:
            source_file.open("rb")
            contents = source_file.read()
        except (OSError, FileNotFoundError):
            continue
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
            actor=actor or source_actor or target_version.coach.user,
            uploaded_file=copy_file,
            section=section,
        )
        clone.program_version = target_version
        clone.expires_at = timezone.now() + STAGED_PROGRAM_PDF_LIFETIME
        clone.save(update_fields=["program_version", "expires_at"])
        clones.append(clone)
    return clones[0] if clones else None


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
def promote_staged_pdfs(version: ProgramVersion, *, actor) -> list[PdfArtifact]:
    staged_files = list(
        StagedProgramPdf.objects.select_for_update()
        .filter(program_version=version, expires_at__gt=timezone.now())
        .order_by("section", "created_at")
    )
    delivery_sections = (version.pdf_settings or {}).get("deliverySections")
    requested_uploads = (
        {key for key, value in delivery_sections.items() if value == "uploaded"}
        if isinstance(delivery_sections, dict)
        else set()
    )
    staged_sections = {staged.section for staged in staged_files}
    missing_sections = requested_uploads - staged_sections
    if missing_sections or (
        version.delivery_source == ProgramVersion.DeliverySource.UPLOADED_PDF and not staged_files
    ):
        raise ValidationError(
            {"file": ["فایل موقت منقضی شده یا پیدا نمی‌شود؛ لطفاً PDF را دوباره بارگذاری کنید."]},
            code="staged_pdf_missing",
        )

    validated_files = []
    for staged in staged_files:
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
            raise ValidationError(
                {"file": ["PDF بارگذاری‌شده دیگر معتبر نیست؛ دوباره بارگذاری کنید."]}
            )
        validated_files.append((staged, contents))

    artifacts = []
    try:
        for staged, contents in validated_files:
            title = version.program.title.replace("/", "-").replace("\\", "-").strip()
            section_label = {
                "workout": "تمرینی",
                "nutrition": "غذایی",
                "supplement": "مکمل",
            }.get(staged.section, "")
            suffix = f"_{section_label}" if section_label else ""
            display_name = normalize_display_name(f"{(title or 'برنامه')[:190]}{suffix}.pdf")
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
                section=staged.section,
                version_label=f"v{version.version_number}",
                created_by=actor,
                generated_at=timezone.now(),
            )
            artifacts.append(artifact)
            artifact.file.save(display_name, ContentFile(contents), save=False)
            artifact.save()
            transaction.on_commit(lambda staged_id=staged.id: _discard_promoted_stage(staged_id))
    except Exception:
        for artifact in artifacts:
            if artifact.file:
                artifact.file.delete(save=False)
        raise
    return artifacts


def promote_staged_pdf(version: ProgramVersion, *, actor) -> PdfArtifact:
    """Compatibility wrapper for legacy callers that expect one uploaded PDF."""
    artifacts = promote_staged_pdfs(version, actor=actor)
    if not artifacts:
        raise ValidationError(
            {"file": ["فایل موقت منقضی شده یا پیدا نمی‌شود؛ لطفاً PDF را دوباره بارگذاری کنید."]},
            code="staged_pdf_missing",
        )
    return artifacts[0]
