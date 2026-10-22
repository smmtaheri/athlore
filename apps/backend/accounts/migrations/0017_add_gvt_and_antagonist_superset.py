from django.db import migrations


def add_training_systems(apps, schema_editor):
    Technique = apps.get_model("accounts", "TrainingTechnique")
    Technique.objects.update_or_create(
        key="gvt_10x10",
        defaults={
            "name": "تمرین حجم آلمانی (۱۰×۱۰)",
            "description": (
                "قالب ۱۰ ست ۱۰ تکراری برای یک حرکت اصلی؛ روش پرحجمی است و برای هر شاگرد یا "
                "هر حرکت مناسب نیست."
            ),
            "execution_method": (
                "یک حرکت اصلی انتخاب کن؛ بار، استراحت و کیفیت اجرا را بازبینی کن و در صورت افت "
                "فرم یا درد، روش را متوقف یا تعدیل کن."
            ),
            "parameter_schema": {},
            "handler_key": "recipe",
            "recipe": {
                "version": 1,
                "target": "last_exercise",
                "steps": [
                    {"op": "prescribe", "sets": 10, "reps": "۱۰", "rest_seconds": 90},
                    {
                        "op": "instruction",
                        "title": "تمرین حجم آلمانی",
                        "text": (
                            "این قالب پرحجم است؛ حرکت اصلی و تناسب آن با سابقه و توان شاگرد را "
                            "مربی بررسی کند. بار را طوری انتخاب کن که هر ۱۰ ست با فرم کنترل‌شده "
                            "تکمیل شوند."
                        ),
                    },
                ],
            },
            "is_active": True,
            "sort_order": 210,
        },
    )
    Technique.objects.update_or_create(
        key="antagonist_superset",
        defaults={
            "name": "سوپرست عضلات مخالف",
            "description": "جفت‌کردن دو حرکت متوالی برای عضلات متقابل، مثل سینه و زیربغل.",
            "execution_method": (
                "دو حرکت متقابل را به‌ترتیب اجرا کن و پس از هر جفت استراحت کن؛ جفت حرکات باید "
                "با برنامه و توان شاگرد سازگار باشد."
            ),
            "parameter_schema": {},
            "handler_key": "recipe",
            "recipe": {
                "version": 1,
                "target": "all",
                "grouping": {
                    "size": 2,
                    "mode": "antagonist",
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 90,
                    "allow_compound": True,
                },
                "steps": [
                    {
                        "op": "instruction",
                        "title": "سوپرست عضلات مخالف",
                        "text": (
                            "دو حرکت متقابل را بدون استراحت یا با مکث کوتاه بین آن‌ها اجرا کن و "
                            "بعد از تکمیل جفت استراحت کن."
                        ),
                    }
                ],
            },
            "is_active": True,
            "sort_order": 220,
        },
    )


def remove_unconfigured_systems(apps, schema_editor):
    Technique = apps.get_model("accounts", "TrainingTechnique")
    CoachTechnique = apps.get_model("accounts", "CoachTechnique")
    for key in ("gvt_10x10", "antagonist_superset"):
        if not CoachTechnique.objects.filter(base_technique__key=key).exists():
            Technique.objects.filter(key=key).delete()


class Migration(migrations.Migration):
    dependencies = [("accounts", "0016_fst7_name_and_100_reps")]

    operations = [migrations.RunPython(add_training_systems, remove_unconfigured_systems)]
