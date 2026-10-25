from django.db import migrations


def remove_explicit_none_options(apps, schema_editor):
    Template = apps.get_model("students", "CoachVisitFormTemplate")
    target_semantics = {"injuries", "weak_muscles"}

    for template in Template.objects.all().iterator():
        sections_value = template.sections or []
        wrapped = isinstance(sections_value, dict)
        sections = (sections_value.get("sections") or []) if wrapped else sections_value
        changed = False

        for section in sections:
            if not isinstance(section, dict):
                continue
            for field in section.get("fields") or []:
                if not isinstance(field, dict) or field.get("semantic_key") not in target_semantics:
                    continue
                options = field.get("options")
                if not isinstance(options, list):
                    continue
                filtered = [
                    option
                    for option in options
                    if not isinstance(option, dict) or str(option.get("value")) != "none"
                ]
                if len(filtered) != len(options):
                    field["options"] = filtered
                    changed = True

        if changed:
            template.sections = {**sections_value, "sections": sections} if wrapped else sections
            template.version += 1
            template.save(update_fields=["sections", "version", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [("students", "0018_optional_visit_observations")]

    operations = [
        migrations.RunPython(remove_explicit_none_options, migrations.RunPython.noop)
    ]
