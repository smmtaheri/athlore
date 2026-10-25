from django.db import migrations


def add_100_reps_and_clean_fst_name(apps, schema_editor):
    Technique = apps.get_model("accounts", "TrainingTechnique")
    Technique.objects.filter(key="fst_7").update(name="FST-7")
    Technique.objects.update_or_create(
        key="100_reps",
        defaults={
            "name": "۱۰۰ تکرار",
            "description": "یک هدف تجمعی ۱۰۰ تکراری با بار قابل‌کنترل که در ست‌های کوتاه تقسیم می‌شود.",
            "execution_method": "مربی حرکت هدف، بار، مکث‌ها و تقسیم تکرارها را متناسب با شاگرد بازبینی کند؛ با افت فرم یا درد متوقف شود.",
            "parameter_schema": {},
            "handler_key": "recipe",
            "recipe": {
                "version": 1,
                "target": "last_isolation",
                "steps": [
                    {
                        "op": "prescribe",
                        "sets": 1,
                        "reps": "۱۰۰ تکرار تجمیعی (در ست‌های کوتاه)",
                        "rest_seconds": 30,
                    },
                    {
                        "op": "instruction",
                        "title": "هدف ۱۰۰ تکرار",
                        "text": "با بار قابل‌کنترل، مجموعاً ۱۰۰ تکرار باکیفیت را در ست‌های کوتاه تکمیل کن؛ تعداد هر ست را با حفظ فرم تنظیم کن و در صورت درد یا افت فرم متوقف شو.",
                    },
                ],
            },
            "is_active": True,
            "sort_order": 200,
        },
    )


def reverse_100_reps_and_fst_name(apps, schema_editor):
    Technique = apps.get_model("accounts", "TrainingTechnique")
    CoachTechnique = apps.get_model("accounts", "CoachTechnique")
    if not CoachTechnique.objects.filter(base_technique__key="100_reps").exists():
        Technique.objects.filter(key="100_reps").delete()
    Technique.objects.filter(key="fst_7").update(name="FST-7 (گاهی FSTV نوشته می‌شود)")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0015_training_technique_recipes")]

    operations = [
        migrations.RunPython(add_100_reps_and_clean_fst_name, reverse_100_reps_and_fst_name)
    ]
