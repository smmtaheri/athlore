from django.db import migrations

MUSCLE_KEYS = {
    "سینه": "chest",
    "chest": "chest",
    "زیربغل": "back",
    "زیر بغل": "back",
    "back": "back",
    "سرشانه": "shoulders",
    "شانه": "shoulders",
    "shoulders": "shoulders",
    "چهارسر ران": "quadriceps",
    "چهارسر": "quadriceps",
    "quadriceps": "quadriceps",
    "پشت پا": "hamstrings",
    "همسترینگ": "hamstrings",
    "hamstrings": "hamstrings",
    "باسن": "glutes",
    "glutes": "glutes",
    "جلو بازو": "biceps",
    "biceps": "biceps",
    "پشت بازو": "triceps",
    "triceps": "triceps",
    "ساق": "calves",
    "calves": "calves",
    "ساعد": "forearms",
    "forearms": "forearms",
    "شکم": "core",
    "abs": "core",
    "core": "core",
    "کول": "traps",
    "traps": "traps",
}


def _migrate_settings(raw):
    settings = dict(raw or {})
    legacy_focus = settings.pop("focus_muscles", [])
    decisions = dict(settings.get("muscle_decisions") or {})
    if isinstance(legacy_focus, list):
        for value in legacy_focus:
            label = str(value or "").strip()
            keys = (
                ("quadriceps", "hamstrings", "glutes")
                if label.lower() in {"پا", "leg", "legs"}
                else (MUSCLE_KEYS[label],)
                if label in MUSCLE_KEYS
                else ()
            )
            for key in keys:
                decisions.setdefault(key, "focus")
    if decisions:
        settings["muscle_decisions"] = decisions
    else:
        settings.pop("muscle_decisions", None)
    return settings


def migrate_coach_decisions(apps, schema_editor):
    alias = schema_editor.connection.alias
    Coach = apps.get_model("accounts", "CoachProfile")
    RuleSet = apps.get_model("accounts", "CoachRuleSet")
    Visit = apps.get_model("students", "Visit")

    for coach in Coach.objects.using(alias).all().iterator():
        defaults = _migrate_settings(coach.program_defaults)
        if defaults != (coach.program_defaults or {}):
            coach.program_defaults = defaults
            coach.save(using=alias, update_fields=["program_defaults"])

    for visit in Visit.objects.using(alias).all().iterator():
        settings = _migrate_settings(visit.program_settings)
        if settings != (visit.program_settings or {}):
            visit.program_settings = settings
            visit.save(using=alias, update_fields=["program_settings"])

    for rules in RuleSet.objects.using(alias).all().iterator():
        style = dict(rules.style_profile or {})
        generation_rules = dict(style.get("generation_rules") or {})
        if "weakness_auto_focus" in generation_rules:
            generation_rules.pop("weakness_auto_focus")
            style["generation_rules"] = generation_rules
            rules.style_profile = style
            rules.save(using=alias, update_fields=["style_profile"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0025_exercise_execution_metadata"),
        ("students", "0022_student_phone_country"),
    ]

    operations = [migrations.RunPython(migrate_coach_decisions, migrations.RunPython.noop)]
