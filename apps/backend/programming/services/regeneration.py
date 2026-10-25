"""Scoped regeneration of an owned draft, preserving locked prescriptions."""

from copy import deepcopy
from uuid import uuid4

from django.db import transaction
from rest_framework.exceptions import ValidationError

from programming.models import GenerationRun, ProgramVersion
from programming.services import programs
from programming.services.generator import build_input_snapshot, generate_document
from programming.services.training_selection import _role_of_name


@transaction.atomic
def regenerate(coach, program_id, data):
    program = programs.get_program_for_coach(coach, program_id)
    version = (
        ProgramVersion.objects.select_for_update().filter(program=program, status="draft").first()
    )
    if not version or not version.generation_run_id:
        raise ValidationError({"program": ["بازسازی فقط برای پیش‌نویس تولیدشده ممکن است."]})
    if data.get("revision") != version.updated_at.isoformat():
        raise ValidationError({"revision": ["پیش‌نویس تغییر کرده؛ صفحه را دوباره باز کنید."]})
    request = deepcopy(version.generation_run.request)
    request["seed"] = uuid4().hex
    request["exercise_variety"] = "varied"
    request["avoid_exercise_names"] = [
        item.get("name", "")
        for day in (version.training or {}).get("days", [])
        for item in day.get("exercises", [])
    ]
    visit = programs._visit_for_generation(coach, program.student, request)
    template_id = request.get("template_id")
    if template_id:
        from accounts.models import ProgramTemplate

        template = ProgramTemplate.objects.get(pk=template_id, coach=coach)
    else:
        template, _ = programs._build_quick_generation_template(
            coach=coach,
            student=program.student,
            request_data=request,
            requested_sessions=programs._visit_sessions_per_week(visit),
        )
    snapshot = build_input_snapshot(
        coach=coach, student=program.student, visit=visit, template=template, request=request
    )
    original = version.generation_run.input_snapshot or {}
    if any(
        original.get(key) != snapshot.get(key)
        for key in ("student", "visit", "template", "rules_digest")
    ):
        raise ValidationError(
            {
                "source": [
                    "ویزیت، پروفایل یا قوانین پس از تولید تغییر کرده‌اند؛ از ویزیت پیش‌نویس تازه بسازید."
                ]
            }
        )
    document, warnings = generate_document(
        coach=coach, student=program.student, visit=visit, template=template, request=request
    )
    if any(w.startswith("missing_exercise_candidates") for w in warnings):
        raise ValidationError(
            {"catalog": ["کاتالوگ برای بازسازی امن کامل نیست؛ پیش‌نویس قبلی حفظ شد."]}
        )
    training = deepcopy(version.training or {})
    fresh_days = (document.get("training") or {}).get("days", [])
    day_id = data.get("day_id")
    item_id = data.get("exercise_id")
    matched = False
    for index, day in enumerate(training.get("days", [])):
        if day_id and str(day.get("id")) != str(day_id):
            continue
        if index >= len(fresh_days):
            continue
        fresh = fresh_days[index]
        if not item_id and not any(item.get("locked") for item in day.get("exercises", [])):
            if [item.get("name") for item in fresh.get("exercises", [])] != [
                item.get("name") for item in day.get("exercises", [])
            ]:
                day["exercises"] = deepcopy(fresh.get("exercises", []))
                matched = True
            continue
        locked_groups = {
            item.get("trainingGroupId") or item.get("supersetGroupId")
            for item in day.get("exercises", [])
            if item.get("locked")
        }
        replacements = []
        used = {item.get("name") for item in day.get("exercises", [])}
        for item in day.get("exercises", []):
            group = item.get("trainingGroupId") or item.get("supersetGroupId")
            if (
                item.get("locked")
                or (group and (group in locked_groups or not item_id))
                or (item_id and str(item.get("id")) != str(item_id))
            ):
                replacements.append(item)
                continue
            if item_id and group:
                raise ValidationError(
                    {
                        "exercise": [
                            "این حرکت عضو یک گروه است؛ جلسه را بازسازی کنید تا اجرای گروه حفظ شود."
                        ]
                    }
                )
            candidate = next(
                (
                    candidate
                    for candidate in fresh.get("exercises", [])
                    if candidate.get("targetMuscle") == item.get("targetMuscle")
                    and _role_of_name(candidate.get("name", ""), item.get("targetMuscle", ""))
                    == _role_of_name(item.get("name", ""), item.get("targetMuscle", ""))
                    and candidate.get("name") not in used
                    and not candidate.get("supersetGroupId")
                    and not candidate.get("trainingGroupId")
                ),
                None,
            )
            if candidate:
                candidate = deepcopy(candidate)
                candidate["id"], candidate["order"] = item["id"], item["order"]
                used.add(candidate["name"])
                replacements.append(candidate)
                matched = True
            else:
                replacements.append(item)
        day["exercises"] = replacements
    if not matched:
        raise ValidationError({"exercise": ["حرکت متفاوت و سازگاری پیدا نشد؛ برنامهٔ فعلی حفظ شد."]})
    old = deepcopy(version.training)
    version.training = training
    run = GenerationRun.objects.create(
        coach=coach,
        student=program.student,
        program=program,
        resulting_version=version,
        engine="rules_v1",
        seed=request["seed"],
        request=request,
        input_snapshot=snapshot,
        output_snapshot={**document, "training": training, "previous_training": old},
        warnings=warnings,
        status="succeeded",
    )
    version.generation_run = run
    version.save(update_fields=["training", "generation_run", "updated_at"])
    return program
