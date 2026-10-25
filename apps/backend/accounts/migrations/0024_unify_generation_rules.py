from django.db import migrations


def unify(apps, schema_editor):
    RuleSet = apps.get_model("accounts", "CoachRuleSet")
    Visit = apps.get_model("students", "Visit")
    Template = apps.get_model("accounts", "ProgramTemplate")
    Coach = apps.get_model("accounts", "CoachProfile")
    Supplement = apps.get_model("accounts", "CoachSupplementTemplate")
    for row in RuleSet.objects.all().iterator():
        style = dict(row.style_profile or {})
        # Legacy style strings must not compete with the typed prescription policy.
        style.pop("rx_by_class", None)
        style.pop("sets_per_class", None)
        row.style_profile = style
        row.save(update_fields=["style_profile"])
    for coach in Coach.objects.all().iterator():
        valid = set(
            str(pk)
            for pk in Template.objects.filter(
                coach_id=coach.pk, is_archived=False, is_active=True
            ).values_list("pk", flat=True)
        )
        defaults = dict(coach.program_defaults or {})
        if defaults.get("template_id") and str(defaults["template_id"]) not in valid:
            defaults.pop("template_id")
            coach.program_defaults = defaults
            coach.save(update_fields=["program_defaults"])
        for visit in (
            Visit.objects.filter(student__coach_id=coach.pk).exclude(status="finalized").iterator()
        ):
            settings = dict(visit.program_settings or {})
            if settings.get("template_id") and str(settings["template_id"]) not in valid:
                settings.pop("template_id")
                visit.program_settings = settings
                visit.save(update_fields=["program_settings"])
    Supplement.objects.update(is_eligible_for_auto_select=False)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0023_coach_exercise_video_uploads"),
        ("students", "0021_visit_finalized_sms"),
    ]
    operations = [migrations.RunPython(unify, migrations.RunPython.noop)]
