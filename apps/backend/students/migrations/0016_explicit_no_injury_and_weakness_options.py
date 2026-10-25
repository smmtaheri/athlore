from django.db import migrations

TRAINING_METHOD_OPTIONS = [
    {"value": "superset", "label": "سوپرست"},
    {"value": "antagonist_superset", "label": "سوپرست عضلات مخالف"},
    {"value": "drop_set", "label": "دراپ ست"},
    {"value": "rest_pause", "label": "رست‌پاز"},
    {"value": "tri_set", "label": "تری‌ست"},
    {"value": "giant_set", "label": "جاینت ست"},
    {"value": "post_exhaustion", "label": "پس‌خستگی"},
    {"value": "partial_reps", "label": "تکرار نیمه"},
    {"value": "21s", "label": "۲۱ تکرار"},
    {"value": "5_10_20", "label": "۵-۱۰-۲۰"},
    {"value": "fst_7", "label": "FST-7"},
    {"value": "100_reps", "label": "۱۰۰ تکرار"},
    {"value": "gvt_10x10", "label": "حجم آلمانی ۱۰×۱۰"},
]

LEGACY_METHOD_KEYS = {
    "superset",
    "drop_set",
    "tri_set",
    "giant_set",
    "hundred_rep",
    "hit",
    "gvt",
    "final_pump",
}


def add_explicit_none_options(apps, schema_editor):
    Template = apps.get_model("students", "CoachVisitFormTemplate")
    labels = {
        "injuries": "آسیب یا محدودیت فعالی ندارم",
        "weak_muscles": "ضعف مشخصی ثبت نشده",
    }

    for template in Template.objects.all().iterator():
        sections = template.sections or []
        if isinstance(sections, dict):
            sections = sections.get("sections") or []
        changed = False
        for section in sections:
            if not isinstance(section, dict):
                continue
            for field in section.get("fields") or []:
                if not isinstance(field, dict):
                    continue
                semantic_key = field.get("semantic_key")
                if (
                    template.key in {"arman_visit_v1", "minimal_v1"}
                    and semantic_key == "training_methods"
                ):
                    options = field.get("options") or []
                    option_keys = {
                        str(option.get("value"))
                        for option in options
                        if isinstance(option, dict)
                    }
                    if option_keys and option_keys.issubset(LEGACY_METHOD_KEYS):
                        field["options"] = [dict(option) for option in TRAINING_METHOD_OPTIONS]
                        changed = True
                if semantic_key not in labels:
                    continue
                options = field.get("options")
                if not isinstance(options, list):
                    options = []
                    field["options"] = options
                if any(
                    isinstance(option, dict) and str(option.get("value")) == "none"
                    for option in options
                ):
                    continue
                options.append({"value": "none", "label": labels[semantic_key]})
                changed = True
        if changed:
            template.sections = sections
            template.version += 1
            template.save(update_fields=["sections", "version", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [("students", "0015_stagedvisitphoto")]

    operations = [migrations.RunPython(add_explicit_none_options, migrations.RunPython.noop)]
