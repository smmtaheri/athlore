"""Visit-driven preparation shared by all coach entry points."""

from copy import deepcopy
from datetime import date, timedelta
from uuid import UUID, uuid4

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from accounts.exercise_metadata import MUSCLE_NAMES, muscle_key
from accounts.models import ProgramTemplate
from programming.models import GenerationRun, ProgramRequest
from programming.services import program_requests, programs
from programming.services.assessment_context import build_generation_context_from_visit
from programming.services.techniques import normalize_training_system_muscles
from students.models import Visit


def validate_settings(data):
    if not isinstance(data, dict):
        raise ValidationError({"program_settings": ["تنظیمات برنامه باید ساختاریافته باشد."]})
    allowed = {
        "start_date",
        "training_systems",
        "session_muscles",
        "exercise_variety",
        "duration_weeks",
        "template_id",
        "sections",
        "muscle_decisions",
    }
    if set(data) - allowed:
        raise ValidationError({"program_settings": ["گزینهٔ ناشناخته در تنظیمات برنامه."]})
    result = deepcopy(data)
    if "muscle_decisions" in result:
        decisions = result["muscle_decisions"]
        if not isinstance(decisions, dict) or len(decisions) > len(MUSCLE_NAMES):
            raise ValidationError({"muscle_decisions": ["تصمیم عضلانی معتبر نیست."]})
        normalized_decisions = {}
        for raw_muscle, decision in decisions.items():
            key = muscle_key(raw_muscle)
            if (
                key not in MUSCLE_NAMES
                or not isinstance(decision, str)
                or decision not in {"balanced", "focus", "maintenance"}
            ):
                raise ValidationError({"muscle_decisions": ["عضله یا تصمیم انتخاب‌شده معتبر نیست."]})
            normalized_decisions[key] = decision
        result["muscle_decisions"] = normalized_decisions
    if result.get("start_date"):
        try:
            date.fromisoformat(result["start_date"])
        except (TypeError, ValueError) as exc:
            raise ValidationError({"start_date": ["تاریخ شروع معتبر نیست."]}) from exc
    methods = result.get("training_systems", [])
    if (
        not isinstance(methods, list)
        or len(methods) > 50
        or any(
            not isinstance(item, dict) or not isinstance(item.get("key"), str) or not item["key"]
            for item in methods
        )
    ):
        raise ValidationError({"training_systems": ["سیستم‌های انتخاب‌شده معتبر نیستند."]})
    for method in methods:
        if "muscles" in method:
            method["muscles"] = normalize_training_system_muscles(method["muscles"])
    split = result.get("session_muscles", [])
    if (
        not isinstance(split, list)
        or len(split) > 7
        or any(
            not isinstance(day, list)
            or len(day) > 20
            or any(not isinstance(muscle, str) for muscle in day)
            for day in split
        )
    ):
        raise ValidationError({"session_muscles": ["چیدمان جلسات معتبر نیست."]})
    variety = result.get("exercise_variety", "varied")
    if not isinstance(variety, str) or variety not in {"stable", "balanced", "varied"}:
        raise ValidationError({"exercise_variety": ["میزان تنوع معتبر نیست."]})
    weeks = result.get("duration_weeks", 4)
    if isinstance(weeks, bool) or not isinstance(weeks, int) or not 1 <= weeks <= 52:
        raise ValidationError({"duration_weeks": ["مدت دوره باید بین ۱ و ۵۲ هفته باشد."]})
    if "sections" in result and (
        not isinstance(result["sections"], list)
        or not result["sections"]
        or any(
            not isinstance(section, str) or section not in {"workout", "nutrition", "supplement"}
            for section in result["sections"]
        )
    ):
        raise ValidationError({"sections": ["بخش‌های برنامه معتبر نیستند."]})
    if result.get("template_id"):
        try:
            UUID(str(result["template_id"]))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValidationError({"template_id": ["قالب انتخاب‌شده معتبر نیست."]}) from exc
    return result


@transaction.atomic
def prepare_from_visit(coach, actor, visit_id, operation_key, section_methods=None):
    if not isinstance(operation_key, str) or not 8 <= len(operation_key) <= 100:
        raise ValidationError({"operation_key": ["شناسهٔ عملیات معتبر نیست."]})
    try:
        visit = (
            Visit.objects.select_for_update()
            .select_related("student")
            .get(pk=visit_id, coach=coach)
        )
    except (Visit.DoesNotExist, ValueError) as exc:
        raise NotFound("ویزیت پیدا نشد.") from exc
    previous = GenerationRun.objects.filter(
        coach=coach,
        request__preparation_key=operation_key,
        request__visit_id=str(visit.id),
        status="succeeded",
    ).first()
    if previous and previous.program_id:
        return previous.program, previous
    settings = {
        **validate_settings(coach.program_defaults or {}),
        **validate_settings(visit.program_settings or {}),
    }
    stale_template = bool(
        settings.get("template_id")
        and not ProgramTemplate.objects.filter(
            pk=settings["template_id"], coach=coach, is_active=True, is_archived=False
        ).exists()
    )
    if stale_template:
        raise ValidationError(
            {"template_id": ["قالب انتخاب‌شده در دسترس نیست؛ قالب را حذف یا دوباره انتخاب کنید."]}
        )
    semantic = (build_generation_context_from_visit(visit) or {}).get("executable") or {}
    sections = settings.get("sections", ["workout"])
    methods = settings.get("training_systems", semantic.get("training_methods", []))
    methods = [{"key": item} if isinstance(item, str) else item for item in methods]
    if settings.get("template_id") and "workout" in sections and methods:
        raise ValidationError(
            {
                "training_systems": [
                    "قالب دقیق، حرکت‌ها و سیستم‌های خودش را تعیین می‌کند؛ برای اعمال سیستم‌های "
                    "انتخاب‌شده در همین ویزیت، قالب را روی «بدون قالب؛ تقسیم خودکار» بگذارید."
                ]
            }
        )
    weeks = settings.get("duration_weeks", 4)
    start = (
        date.fromisoformat(settings["start_date"])
        if settings.get("start_date")
        else timezone.localdate()
    )
    level = semantic.get("training_level")
    if level in {"professional", "semi_professional"}:
        level = "advanced"
    request = {
        "student_id": str(visit.student_id),
        "visit_id": str(visit.id),
        "title": f"برنامه {visit.student.full_name}",
        "program_type": sections[0] if len(sections) == 1 else "complete",
        "program_sections": sections,
        "duration_weeks": weeks,
        "exercise_variety": settings.get("exercise_variety", "varied"),
        "training_systems": methods,
        "seed": uuid4().hex,
        "preparation_key": operation_key,
        "date_range_start": start,
        "date_range_end": start + timedelta(weeks=weeks) - timedelta(days=1),
        "apply_injury_rules": True,
        "apply_level_rules": True,
        "apply_exercise_catalog": True,
        "apply_general_rules": True,
        "apply_muscle_priority_rules": True,
        "catalog_only": True,
        # Visit preparation creates a coach-review draft. A missing catalog
        # candidate for one target muscle should be reported in generation
        # warnings, not prevent the entire draft from being created.
        "fail_on_missing_exercises": False,
    }
    open_request = ProgramRequest.objects.filter(
        coach=coach,
        student=visit.student,
        visit=visit,
        status__in=["submitted", "awaiting_info", "in_progress"],
    ).first()
    if open_request:
        request["program_request_id"] = str(open_request.id)
        request["program_sections"] = list(open_request.sections)
        request["program_type"] = (
            open_request.sections[0] if len(open_request.sections) == 1 else "complete"
        )
        sections = list(open_request.sections)
    if section_methods is not None:
        if (
            not isinstance(section_methods, dict)
            or not section_methods
            or set(section_methods) - {"workout", "nutrition", "supplement"}
            or any(
                not isinstance(method, str) or method not in {"generated", "uploaded", "omitted"}
                for method in section_methods.values()
            )
        ):
            raise ValidationError({"section_methods": ["روش تحویل بخش‌های برنامه معتبر نیست."]})
        selected = [section for section, method in section_methods.items() if method != "omitted"]
        if open_request and set(selected) != set(sections):
            raise ValidationError(
                {"section_methods": ["بخش‌های برنامه باید با درخواست شاگرد هم‌خوان باشند."]}
            )
        if not selected or not any(method == "generated" for method in section_methods.values()):
            raise ValidationError(
                {"section_methods": ["برای فایل آماده از مسیر آپلود استفاده کنید."]}
            )
        sections = selected
        request["program_sections"] = sections
        request["program_type"] = sections[0] if len(sections) == 1 else "complete"
        for section, flag in (
            ("workout", "include_training"),
            ("nutrition", "include_nutrition"),
            ("supplement", "include_supplements"),
        ):
            request[flag] = section_methods.get(section) == "generated"
    if "session_muscles" in settings:
        request["session_muscles"] = settings["session_muscles"]
    request["muscle_decisions"] = settings.get("muscle_decisions", {})
    if level:
        request["level"] = level
    if settings.get("template_id"):
        request["template_id"] = settings["template_id"]
    if not open_request:
        # Establish the in-person request before taking the generation snapshot:
        # its profile defaults must not mutate the source after generation.
        open_request, _ = program_requests.create_request(
            student=visit.student,
            actor=actor,
            coach=coach,
            data={
                **program_requests.request_defaults(visit.student),
                "sections": sections,
                "visit_id": str(visit.id),
                "assessment_mode": "in_person",
            },
        )
        request["program_request_id"] = str(open_request.id)
    # JSON snapshots contain dates as ISO strings.
    for key in ("date_range_start", "date_range_end"):
        request[key] = request[key].isoformat()
    program, run = programs.generate_program(coach, request)
    program_requests.link_program(program=program, actor=actor, visit_id=visit.id)
    version = run.resulting_version
    version.pdf_settings = {
        **version.pdf_settings,
        "deliverySections": section_methods or {section: "generated" for section in sections},
    }
    version.save(update_fields=["pdf_settings", "updated_at"])
    return program, run
