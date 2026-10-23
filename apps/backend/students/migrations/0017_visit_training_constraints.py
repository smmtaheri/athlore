from django.db import migrations

ENVIRONMENT_OPTIONS = [
    {"value": "gym", "label": "باشگاه"},
    {"value": "home", "label": "خانه"},
    {"value": "outdoors", "label": "فضای باز"},
    {"value": "other", "label": "محیط دیگر"},
]
EQUIPMENT_OPTIONS = [
    {"value": "full_gym", "label": "باشگاه با تجهیزات کامل"},
    {"value": "bodyweight_only", "label": "فقط وزن بدن"},
    {"value": "dumbbell", "label": "دمبل"},
    {"value": "barbell", "label": "هالتر"},
    {"value": "cable", "label": "کابل"},
    {"value": "machines", "label": "دستگاه"},
    {"value": "resistance_band", "label": "کش تمرینی"},
]
DURATION_OPTIONS = [
    {"value": str(minutes), "label": f"{minutes} دقیقه"}
    for minutes in (30, 45, 60, 75, 90, 120)
]


def _field(key, label, field_type, semantic_key, options, order, prefill_from="", coach_help_text=""):
    return {
        "key": key,
        "semantic_key": semantic_key,
        "label": label,
        "type": field_type,
        "options": options,
        "required": False,
        "enabled": True,
        "order": order,
        "help_text": "",
        "coach_help_text": coach_help_text,
        "prefill_from": prefill_from,
        "student_visible": False,
        "student_visible_when_finalized": False,
        "student_editable": False,
        "coach_editable": True,
    }


def add_training_constraints(apps, schema_editor):
    Template = apps.get_model("students", "CoachVisitFormTemplate")
    definitions = {
        "arman_visit_v1": (
            "general",
            [
                _field(
                    "training_environment",
                    "محیط تمرین تأییدشده",
                    "single_select",
                    "training_environment",
                    ENVIRONMENT_OPTIONS,
                    13,
                    "student.training_conditions.environment",
                    "مقدار درخواست شاگرد را بررسی و در صورت نیاز اصلاح کنید.",
                ),
                _field(
                    "equipment_available",
                    "وسایل تمرین در دسترس",
                    "multi_select",
                    "equipment_available",
                    EQUIPMENT_OPTIONS,
                    14,
                    "student.equipment.available_equipment",
                    "انتخاب خالی یعنی نامشخص؛ محدودیت تازه‌ای اعمال نمی‌شود.",
                ),
                _field(
                    "session_duration_minutes",
                    "زمان قابل‌اختصاص برای هر جلسه",
                    "single_select",
                    "session_duration_minutes",
                    DURATION_OPTIONS,
                    15,
                    "student.training_conditions.session_duration_minutes",
                    "زمان نهایی شاگرد را تأیید کنید؛ حجم برآوردی برنامه با آن سنجیده می‌شود.",
                ),
            ],
        ),
        "minimal_v1": (
            "core",
            [
                _field(
                    "training_environment",
                    "محیط تمرین تأییدشده",
                    "single_select",
                    "training_environment",
                    ENVIRONMENT_OPTIONS,
                    5,
                    "student.training_conditions.environment",
                ),
                _field(
                    "equipment_available",
                    "وسایل تمرین در دسترس",
                    "multi_select",
                    "equipment_available",
                    EQUIPMENT_OPTIONS,
                    6,
                    "student.equipment.available_equipment",
                    "انتخاب خالی یعنی نامشخص؛ محدودیت تازه‌ای اعمال نمی‌شود.",
                ),
                _field(
                    "session_duration_minutes",
                    "زمان هر جلسه",
                    "single_select",
                    "session_duration_minutes",
                    DURATION_OPTIONS,
                    7,
                    "student.training_conditions.session_duration_minutes",
                ),
            ],
        ),
    }

    for template in Template.objects.filter(key__in=definitions):
        section_key, additions = definitions[template.key]
        sections = template.sections or []
        if isinstance(sections, dict):
            sections = sections.get("sections") or []
        section = next(
            (item for item in sections if isinstance(item, dict) and item.get("key") == section_key),
            None,
        )
        if section is None:
            continue
        fields = section.setdefault("fields", [])
        existing_semantics = {
            str(field.get("semantic_key"))
            for field in fields
            if isinstance(field, dict)
        }
        changed = False
        for field in additions:
            if field["semantic_key"] not in existing_semantics:
                fields.append(field)
                existing_semantics.add(field["semantic_key"])
                changed = True
        if changed:
            template.sections = sections
            template.version += 1
            template.save(update_fields=["sections", "version", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [("students", "0016_explicit_no_injury_and_weakness_options")]

    operations = [migrations.RunPython(add_training_constraints, migrations.RunPython.noop)]
