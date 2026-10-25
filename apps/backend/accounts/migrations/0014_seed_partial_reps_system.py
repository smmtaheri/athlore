from django.db import migrations

VARIANTS = [
    {"value": "one_and_half", "label": "تکرار یک‌ونیم"},
    {"value": "after_failure", "label": "نیم‌تکرار پس از ناتوانی"},
    {"value": "partial_only", "label": "اجرای کل ست در دامنهٔ نیمه"},
]

SCHEMA = {
    "variants": {
        "type": "multi_enum",
        "default": [item["value"] for item in VARIANTS],
        "options": VARIANTS,
    },
    "after_failure_reps": {"type": "integer", "default": 3, "min": 1, "max": 10},
    "half_range": {"type": "enum", "default": "coach_defined_per_exercise"},
}


def seed_partial_reps(apps, schema_editor):
    TrainingTechnique = apps.get_model("accounts", "TrainingTechnique")
    TrainingTechnique.objects.update_or_create(
        key="partial_reps",
        defaults={
            "name": "تکرار نیمه",
            "description": (
                "سه شیوه از یادداشت‌های ویدئو: تکرار یک‌ونیم، نیم‌تکرار پس از ناتوانی، "
                "و اجرای ست در دامنهٔ نیمه. جزئیات تعداد نیم‌تکرار و دامنهٔ حرکت در ویدئو "
                "کاملاً خوانا نبود؛ مقادیر اولیهٔ این سیستم پیشنهادی و قابل‌ویرایش‌اند."
            ),
            "execution_method": (
                "مربی برای هر برنامه شیوه را انتخاب می‌کند. محل دامنهٔ نیمه باید برای هر حرکت "
                "بازبینی شود. مقدار اولیهٔ پس از ناتوانی ۳ تکرار نیمه و سقف اولیه ۲ حرکت در "
                "هر جلسه است؛ هر دو مقدار قابل‌ویرایش‌اند."
            ),
            "parameter_schema": SCHEMA,
            "handler_key": "partial_reps",
            "is_active": True,
            "sort_order": 30,
        },
    )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0013_phone_login_challenges")]

    operations = [migrations.RunPython(seed_partial_reps, migrations.RunPython.noop)]
