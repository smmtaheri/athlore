from django.db import migrations


def extend_options(apps, schema_editor):
    Template = apps.get_model("students", "CoachVisitFormTemplate")
    additions = {
        "equipment_available": [
            {"value": "bench_flat", "label": "نیمکت صاف"},
            {"value": "bench_adjustable", "label": "نیمکت شیب‌دار"},
            {"value": "pullup_bar", "label": "میله بارفیکس"},
        ],
        "goal": [{"value": "strength", "label": "افزایش قدرت"}],
        "primary_goal": [{"value": "strength", "label": "افزایش قدرت"}],
    }
    for template in Template.objects.using(schema_editor.connection.alias).all().iterator():
        sections = template.sections or []
        if isinstance(sections, dict):
            sections = sections.get("sections", [])
        changed = False
        for section in sections:
            for field in section.get("fields", []):
                key = field.get("semantic_key") or field.get("key")
                if key not in additions or not isinstance(field.get("options"), list):
                    continue
                existing = {row.get("value") for row in field["options"]}
                for row in additions[key]:
                    if row["value"] not in existing:
                        field["options"].append(row)
                        changed = True
        if changed:
            template.save(using=schema_editor.connection.alias, update_fields=["sections"])


class Migration(migrations.Migration):
    dependencies = [("students", "0022_student_phone_country")]
    operations = [migrations.RunPython(extend_options, migrations.RunPython.noop)]
