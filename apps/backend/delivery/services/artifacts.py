"""PdfArtifact lifecycle services — keep transitions out of DRF views."""

from __future__ import annotations

import hashlib
import logging
import re
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from common.exceptions import InvalidStateError
from common.permissions import get_owned_object
from delivery.models import PdfArtifact, PdfShareLink
from delivery.services.render import (
    RENDER_ENGINE_VERSION,
    RENDER_TEMPLATE_VERSION,
    render_program_pdf_bytes,
)
from programming.models import Program, ProgramVersion

logger = logging.getLogger(__name__)

FILENAME_RE = re.compile(r"^[^/\\\0]{1,200}\.pdf$", re.IGNORECASE)
SAFE_ERROR_CODES = {
    "render_failed": "ساخت فایل PDF ناموفق بود.",
    "missing_file": "فایل PDF موجود نیست.",
    "not_ready": "فایل PDF هنوز آماده نیست.",
    "program_not_finalized": "برنامه باید ابتدا نهایی شود.",
    "version_not_finalized": "نسخه انتخاب‌شده نهایی نیست.",
    "version_mismatch": "نسخه متعلق به این برنامه نیست.",
    "invalid_filename": "نام فایل نامعتبر است.",
    "artifact_deleted": "فایل PDF حذف شده است.",
}


def normalize_display_name(name: str) -> str:
    raw = (name or "").strip()
    if not raw:
        raise ValidationError(
            {"file_name": ["Display name is required."]},
            code="invalid_filename",
        )
    if not raw.lower().endswith(".pdf"):
        raw = f"{raw}.pdf"
    if not FILENAME_RE.match(raw):
        raise ValidationError(
            {"file_name": ["Invalid PDF filename."]},
            code="invalid_filename",
        )
    return raw


def artifacts_for_coach(coach):
    return PdfArtifact.objects.filter(coach=coach, deleted_at__isnull=True)


def get_artifact_for_coach(coach, pdf_id) -> PdfArtifact:
    return get_owned_object(
        artifacts_for_coach(coach),
        coach=coach,
        pk=pdf_id,
        not_found_message="Not found.",
    )


def serialize_artifact(artifact: PdfArtifact, *, include_share_meta: bool = True) -> dict:
    active_share = None
    if include_share_meta and artifact.status == PdfArtifact.Status.READY:
        now = timezone.now()
        link = (
            artifact.share_links.filter(revoked_at__isnull=True, expires_at__gt=now)
            .order_by("-created_at")
            .first()
        )
        if link and link.is_active(now=now):
            active_share = {
                "id": str(link.id),
                "expires_at": link.expires_at.isoformat().replace("+00:00", "Z"),
                "download_count": link.download_count,
                "has_active_link": True,
            }

    return {
        "id": str(artifact.id),
        "student_id": str(artifact.student_id),
        "program_id": str(artifact.program_id),
        "program_version_id": str(artifact.program_version_id),
        "program_title": artifact.program.title,
        "program_type": artifact.program_type or artifact.program.program_type,
        "file_name": artifact.display_name,
        "display_name": artifact.display_name,
        "original_filename": artifact.original_filename,
        "status": artifact.status,
        "mime_type": artifact.mime_type,
        "size_bytes": artifact.size_bytes,
        "checksum_sha256": artifact.checksum_sha256 or None,
        "version_label": artifact.version_label,
        "template_version": artifact.template_version,
        "render_engine_version": artifact.render_engine_version,
        "error_code": artifact.error_code or None,
        "error_summary": artifact.error_summary or None,
        "regenerated_from_id": str(artifact.regenerated_from_id)
        if artifact.regenerated_from_id
        else None,
        "generated_at": artifact.generated_at.isoformat().replace("+00:00", "Z")
        if artifact.generated_at
        else None,
        "created_at": artifact.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": artifact.updated_at.isoformat().replace("+00:00", "Z"),
        "share": active_share,
    }


def _resolve_finalized_version(coach, program: Program, version_id=None) -> ProgramVersion:
    qs = ProgramVersion.objects.filter(program=program, coach=coach)
    if version_id:
        try:
            version = qs.get(pk=version_id)
        except ProgramVersion.DoesNotExist as exc:
            raise NotFound(detail="Not found.") from exc
        if version.program_id != program.id:
            raise InvalidStateError(
                detail="Program version does not belong to this program.",
                code="version_mismatch",
            )
    else:
        finalized = qs.filter(status=ProgramVersion.Status.FINALIZED).order_by("-version_number")
        count = finalized.count()
        if count == 0:
            raise InvalidStateError(
                detail="Program has no finalized version.",
                code="program_not_finalized",
            )
        if count > 1 and program.active_version_id:
            active = finalized.filter(pk=program.active_version_id).first()
            version = active or finalized.first()
        else:
            version = finalized.first()

    if version.status != ProgramVersion.Status.FINALIZED:
        raise InvalidStateError(
            detail="Selected program version is not finalized.",
            code="version_not_finalized",
        )
    return version


def _mark_failed(artifact: PdfArtifact, *, code: str, summary: str | None = None) -> PdfArtifact:
    artifact.status = PdfArtifact.Status.FAILED
    artifact.error_code = code
    artifact.error_summary = summary or SAFE_ERROR_CODES.get(code, "ساخت PDF ناموفق بود.")
    if artifact.file:
        try:
            artifact.file.delete(save=False)
        except Exception:  # pragma: no cover
            logger.exception("Failed to cleanup partial PDF file")
        artifact.file = None
    artifact.size_bytes = None
    artifact.checksum_sha256 = ""
    artifact.save(
        update_fields=[
            "status",
            "error_code",
            "error_summary",
            "file",
            "size_bytes",
            "checksum_sha256",
            "updated_at",
        ]
    )
    return artifact


def _render_into_artifact(
    artifact: PdfArtifact,
    *,
    pdf_settings_override: dict | None = None,
) -> PdfArtifact:
    artifact.status = PdfArtifact.Status.RENDERING
    artifact.error_code = ""
    artifact.error_summary = ""
    artifact.save(update_fields=["status", "error_code", "error_summary", "updated_at"])

    program = artifact.program
    version = artifact.program_version
    student = artifact.student
    coach = artifact.coach

    try:
        pdf_bytes = render_program_pdf_bytes(
            artifact=artifact,
            program=program,
            version=version,
            student=student,
            coach=coach,
            pdf_settings_override=pdf_settings_override,
        )
    except Exception:
        logger.exception("PDF render failed for artifact %s", artifact.id)
        return _mark_failed(artifact, code="render_failed")

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        return _mark_failed(artifact, code="render_failed")

    checksum = hashlib.sha256(pdf_bytes).hexdigest()
    filename = artifact.original_filename or artifact.display_name
    artifact.file.save(filename, ContentFile(pdf_bytes), save=False)
    artifact.status = PdfArtifact.Status.READY
    artifact.size_bytes = len(pdf_bytes)
    artifact.checksum_sha256 = checksum
    artifact.mime_type = "application/pdf"
    artifact.template_version = RENDER_TEMPLATE_VERSION
    artifact.render_engine_version = f"{RENDER_ENGINE_VERSION}"
    artifact.generated_at = timezone.now()
    artifact.error_code = ""
    artifact.error_summary = ""
    artifact.save()
    return artifact


@transaction.atomic
def create_artifact_from_version(
    coach,
    program: Program,
    *,
    version_id=None,
    display_name: str | None = None,
    user=None,
    regenerated_from: PdfArtifact | None = None,
    program_type: str | None = None,
) -> PdfArtifact:
    if program.coach_id != coach.id:
        raise NotFound(detail="Not found.")

    version = _resolve_finalized_version(coach, program, version_id)
    name = normalize_display_name(
        display_name
        or (version.pdf_settings or {}).get("fileTitle")
        or f"{program.title}-v{version.version_number}.pdf"
    )

    artifact = PdfArtifact.objects.create(
        coach=coach,
        student=program.student,
        program=program,
        program_version=version,
        display_name=name,
        original_filename=name,
        status=PdfArtifact.Status.PENDING,
        program_type=program_type or program.program_type,
        version_label=f"v{version.version_number}",
        template_version=RENDER_TEMPLATE_VERSION,
        render_engine_version=str(RENDER_ENGINE_VERSION),
        created_by=user,
        regenerated_from=regenerated_from,
    )
    # Release row lock / short transaction before potentially long render.
    transaction.on_commit(lambda: None)
    return artifact


def create_and_render(
    coach,
    program: Program,
    *,
    version_id=None,
    display_name: str | None = None,
    user=None,
    regenerated_from: PdfArtifact | None = None,
    pdf_settings_override: dict | None = None,
    program_type: str | None = None,
) -> PdfArtifact:
    artifact = create_artifact_from_version(
        coach,
        program,
        version_id=version_id,
        display_name=display_name,
        user=user,
        regenerated_from=regenerated_from,
        program_type=program_type,
    )
    return _render_into_artifact(artifact, pdf_settings_override=pdf_settings_override)


def _has_nutrition_content(version: ProgramVersion) -> bool:
    nutrition = version.nutrition if isinstance(version.nutrition, dict) else {}
    return bool(nutrition.get("meals") or nutrition.get("notes"))


def _has_supplement_content(version: ProgramVersion) -> bool:
    supplements = version.supplements if isinstance(version.supplements, dict) else {}
    return bool(supplements.get("items") or supplements.get("notes"))


def create_and_render_delivery_pair(
    coach,
    program: Program,
    *,
    version_id=None,
    user=None,
) -> list[PdfArtifact]:
    """Create the student-facing delivery pair: training PDF + nutrition/supplements PDF.

    A single combined PDF is intentionally not produced. Nutrition+supplements is
    skipped when the finalized version has neither section.
    """
    version = _resolve_finalized_version(coach, program, version_id)
    base_settings = version.pdf_settings if isinstance(version.pdf_settings, dict) else {}
    base_title = (base_settings.get("fileTitle") or program.title or "program").strip() or "program"
    base_slug = re.sub(r"\s+", "_", base_title)
    version_tag = f"v{version.version_number}"

    artifacts: list[PdfArtifact] = []

    training = create_and_render(
        coach,
        program,
        version_id=version.id,
        display_name=f"{base_slug}_تمرین_{version_tag}.pdf",
        user=user,
        program_type=Program.ProgramType.WORKOUT,
        pdf_settings_override={
            "includeTraining": True,
            "includeNutrition": False,
            "includeSupplements": False,
            "fileTitle": f"{base_title} — تمرین",
        },
    )
    artifacts.append(training)

    include_nutrition = _has_nutrition_content(version)
    include_supplements = _has_supplement_content(version)
    if include_nutrition or include_supplements:
        nutrition = create_and_render(
            coach,
            program,
            version_id=version.id,
            display_name=f"{base_slug}_تغذیه_مکمل_{version_tag}.pdf",
            user=user,
            program_type=Program.ProgramType.NUTRITION,
            pdf_settings_override={
                "includeTraining": False,
                "includeNutrition": include_nutrition,
                "includeSupplements": include_supplements,
                "fileTitle": f"{base_title} — تغذیه و مکمل",
            },
        )
        artifacts.append(nutrition)

    return artifacts


def regenerate_artifact(coach, artifact: PdfArtifact, *, user=None) -> PdfArtifact:
    if artifact.deleted_at:
        raise InvalidStateError(detail="Artifact is deleted.", code="artifact_deleted")
    program = artifact.program
    return create_and_render(
        coach,
        program,
        version_id=artifact.program_version_id,
        display_name=artifact.display_name,
        user=user,
        regenerated_from=artifact,
    )


def rename_artifact(coach, artifact: PdfArtifact, display_name: str) -> PdfArtifact:
    if artifact.deleted_at:
        raise InvalidStateError(detail="Artifact is deleted.", code="artifact_deleted")
    name = normalize_display_name(display_name)
    artifact.display_name = name
    artifact.save(update_fields=["display_name", "updated_at"])
    return artifact


@transaction.atomic
def delete_artifact(coach, artifact: PdfArtifact) -> None:
    if artifact.coach_id != coach.id:
        raise NotFound(detail="Not found.")
    now = timezone.now()
    PdfShareLink.objects.filter(artifact=artifact, revoked_at__isnull=True).update(revoked_at=now)
    if artifact.file:
        try:
            artifact.file.delete(save=False)
        except Exception:  # pragma: no cover
            logger.exception("Failed deleting PDF storage object")
        artifact.file = None
    artifact.deleted_at = now
    artifact.status = (
        artifact.status if artifact.status == PdfArtifact.Status.FAILED else artifact.status
    )
    artifact.save(update_fields=["deleted_at", "file", "updated_at"])


def open_artifact_file(artifact: PdfArtifact) -> tuple[BytesIO, str, int]:
    if artifact.deleted_at:
        raise InvalidStateError(detail="Artifact is deleted.", code="artifact_deleted")
    if artifact.status != PdfArtifact.Status.READY:
        raise InvalidStateError(detail="PDF is not ready.", code="not_ready")
    if not artifact.file:
        raise InvalidStateError(detail="PDF file is missing.", code="missing_file")
    try:
        artifact.file.open("rb")
        data = artifact.file.read()
        artifact.file.close()
    except Exception as exc:
        logger.exception("Missing PDF file for artifact %s", artifact.id)
        raise InvalidStateError(detail="PDF file is missing.", code="missing_file") from exc
    if not data:
        raise InvalidStateError(detail="PDF file is missing.", code="missing_file")
    return BytesIO(data), artifact.display_name, len(data)


def filter_artifacts_queryset(qs, *, request):
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)

    program_id = request.query_params.get("program_id")
    if program_id:
        qs = qs.filter(program_id=program_id)

    search = (request.query_params.get("search") or "").strip()
    if search:
        qs = qs.filter(Q(display_name__icontains=search) | Q(program__title__icontains=search))

    ordering = request.query_params.get("ordering") or "-created_at"
    allowed = {
        "created_at",
        "-created_at",
        "generated_at",
        "-generated_at",
        "display_name",
        "-display_name",
        "size_bytes",
        "-size_bytes",
    }
    if ordering in allowed:
        qs = qs.order_by(ordering)
    else:
        qs = qs.order_by("-created_at")
    return qs
