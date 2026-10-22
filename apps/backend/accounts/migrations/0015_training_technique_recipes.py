from django.db import migrations, models


def _recipe(target, steps, grouping=None):
    value = {"version": 1, "target": target, "steps": steps}
    if grouping:
        value["grouping"] = grouping
    return value


def seed_recipes(apps, schema_editor):
    Technique = apps.get_model("accounts", "TrainingTechnique")
    recipes = [
        {
            "key": "superset",
            "name": "سوپرست",
            "description": "اجرای دو حرکت سازگار پشت‌سرهم با استراحت محدود بین حرکت‌ها.",
            "execution_method": "حرکت‌ها را به‌ترتیب گروه اجرا کن؛ پس از پایان گروه استراحت کن.",
            "handler_key": "superset",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "اجرا",
                        "text": "حرکت‌های گروه را پشت‌سرهم اجرا کن و پس از تکمیل گروه استراحت کن.",
                    }
                ],
                {
                    "size": 2,
                    "mode": "same_muscle_isolation",
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 90,
                },
            ),
            "sort_order": 10,
        },
        {
            "key": "drop_set",
            "name": "دراپ‌ست",
            "description": "پس از ست اصلی، بار را مرحله‌ای کم کن و بدون استراحت طولانی ادامه بده.",
            "execution_method": "کاهش بار باید با حفظ دامنه و فرم صحیح انجام شود.",
            "handler_key": "drop_set",
            "recipe": _recipe(
                "last_isolation",
                [
                    {
                        "op": "repeat",
                        "count": 1,
                        "steps": [
                            {"op": "load_change", "direction": "down", "percent": 20},
                            {"op": "prescribe", "reps": "۸ تا ۱۵"},
                        ],
                    }
                ],
            ),
            "sort_order": 20,
        },
        {
            "key": "partial_reps",
            "name": "تکرار نیمه",
            "description": "تکرار یک‌ونیم، نیم‌تکرار پس از ناتوانی یا اجرای دامنهٔ نیمه.",
            "execution_method": "مربی باید شیوه و دامنهٔ حرکت را برای هر حرکت بازبینی کند.",
            "parameter_schema": {
                "variants": {
                    "type": "multi_enum",
                    "default": ["one_and_half", "after_failure", "partial_only"],
                },
                "after_failure_reps": {"type": "integer", "default": 3, "min": 1, "max": 10},
            },
            "handler_key": "partial_reps",
            "recipe": _recipe(
                "all", [{"op": "partial_range", "mode": "after_failure", "count": 3}]
            ),
            "sort_order": 30,
        },
        {
            "key": "rest_pause",
            "name": "رست‌پاز",
            "description": "یک ست نزدیک ناتوانی فنی، مکث کوتاه و سپس مینی‌ست‌های کوتاه با فرم صحیح.",
            "execution_method": "نمونهٔ آغازین: ۱۵ تا ۲۰ ثانیه مکث و ۲ تا ۳ مینی‌ست؛ مربی با سطح شاگرد تنظیم کند.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "last_isolation",
                [
                    {
                        "op": "prescribe",
                        "sets": 1,
                        "reps": "۱۰ تا ۱۵ + ۲ تا ۳ مینی‌ست",
                        "rest_seconds": 90,
                    },
                    {
                        "op": "repeat",
                        "count": 3,
                        "steps": [
                            {"op": "rest", "seconds": 20},
                            {
                                "op": "instruction",
                                "title": "مینی‌ست",
                                "text": "چند تکرار باکیفیت دیگر اجرا کن و پیش از افت فرم متوقف شو.",
                            },
                        ],
                    },
                ],
            ),
            "sort_order": 40,
        },
        {
            "key": "tri_set",
            "name": "تری‌ست",
            "description": "اجرای سه حرکت پشت‌سرهم در یک گروه، سپس استراحت.",
            "execution_method": "سه حرکت هم‌عضله یا سازگار را به‌ترتیب اجرا کن.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "ترتیب",
                        "text": "سه حرکت گروه را با حداقل مکث بین آن‌ها اجرا کن.",
                    }
                ],
                {
                    "size": 3,
                    "mode": "same_muscle",
                    "allow_compound": True,
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 120,
                },
            ),
            "sort_order": 50,
        },
        {
            "key": "21s",
            "name": "۲۱ (۲۱ تکرار)",
            "description": "یک ست ۲۱ تکراری: ۷ تکرار نیمهٔ ابتدایی، ۷ تکرار نیمهٔ انتهایی و ۷ تکرار کامل.",
            "execution_method": "دامنه و کنترل هر بخش را برای حرکت انتخابی بازبینی کن.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "last_isolation",
                [
                    {
                        "op": "prescribe",
                        "sets": 3,
                        "reps": "۲۱ (۷ نیمهٔ ابتدایی + ۷ نیمهٔ انتهایی + ۷ کامل)",
                        "rest_seconds": 90,
                    },
                ],
            ),
            "sort_order": 60,
        },
        {
            "key": "5_10_20",
            "name": "۵-۱۰-۲۰",
            "description": "یک تری‌ست با سه حرکت متوالی در محدوده‌های ۵، ۱۰ و ۲۰ تکرار.",
            "execution_method": "حرکت سنگین‌تر، متوسط و ایزوله را به‌ترتیب قرار بده؛ ترکیب حرکات باید بازبینی شود.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "ترتیب اجرا",
                        "text": "سه حرکت را به‌ترتیب ۵، ۱۰ و ۲۰ تکرار اجرا کن.",
                    }
                ],
                {
                    "size": 3,
                    "mode": "same_muscle",
                    "allow_compound": True,
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 120,
                    "exercise_order": "compound_first",
                    "exercise_prescriptions": [
                        {"sets": 1, "reps": "۵"},
                        {"sets": 1, "reps": "۱۰"},
                        {"sets": 1, "reps": "۲۰"},
                    ],
                },
            ),
            "sort_order": 70,
        },
        {
            "key": "giant_set",
            "name": "جاینت‌ست",
            "description": "گروه سه یا چند حرکت؛ نمونهٔ اولیهٔ این فهرست چهار حرکت هم‌عضله است.",
            "execution_method": "حجم و تعداد حرکت‌ها را با توان شاگرد تنظیم کن؛ پس از کل گروه استراحت بده.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "اجرا",
                        "text": "چهار حرکت گروه را پشت‌سرهم اجرا کن و بعد استراحت کن.",
                    }
                ],
                {
                    "size": 4,
                    "mode": "same_muscle",
                    "allow_compound": True,
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 150,
                },
            ),
            "sort_order": 80,
        },
        {
            "key": "mammoth_set",
            "name": "ماموت‌ست (نسخهٔ مربی)",
            "description": "این نام پروتکل یگانه و تثبیت‌شده‌ای ندارد؛ نمونهٔ پیش‌فرض فقط یک گروه پنج‌حرکتی قابل‌ویرایش است.",
            "execution_method": "پیش از استفاده تعداد حرکت‌ها، حجم و استراحت را با هدف و سطح شاگرد بازبینی کن.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "بازبینی مربی",
                        "text": "این نسخه یک الگوی شروع است، نه تعریف استاندارد؛ مربی ساختار را متناسب‌سازی کند.",
                    }
                ],
                {
                    "size": 5,
                    "mode": "same_muscle",
                    "allow_compound": True,
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 180,
                },
            ),
            "sort_order": 90,
        },
        {
            "key": "post_exhaustion",
            "name": "پس‌خستگی",
            "description": "پس از حرکت چندمفصلی، حرکت ایزولهٔ همان عضله برای ادامهٔ کار.",
            "execution_method": "حرکت چندمفصلی را اول و حرکت ایزوله را دوم قرار بده.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "ترتیب",
                        "text": "ابتدا حرکت چندمفصلی و سپس حرکت ایزولهٔ همان عضله را اجرا کن.",
                    }
                ],
                {
                    "size": 2,
                    "mode": "same_muscle",
                    "allow_compound": True,
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 90,
                    "exercise_order": "compound_first",
                    "exercise_prescriptions": [
                        {"sets": 3, "reps": "۶ تا ۱۰"},
                        {"sets": 2, "reps": "۱۲ تا ۱۵"},
                    ],
                },
            ),
            "sort_order": 100,
        },
        {
            "key": "fst_7",
            "name": "FST-7 (گاهی FSTV نوشته می‌شود)",
            "description": "هفت ست پایانی برای یک حرکت ایزوله، معمولاً با مکث کوتاه حدود ۳۰ تا ۴۵ ثانیه.",
            "execution_method": "این روش پرحجم است؛ حرکت، بار و کاربردش را برای شاگرد بازبینی کن.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "last_isolation",
                [
                    {"op": "prescribe", "sets": 7, "reps": "۸ تا ۱۲", "rest_seconds": 40},
                ],
            ),
            "sort_order": 110,
        },
        {
            "key": "pyramid_sets",
            "name": "ست هرمی",
            "description": "افزایش تدریجی بار و کاهش تکرارها در ست‌های متوالی.",
            "execution_method": "نمونهٔ شروع: ۱۲، ۱۰، ۸، ۶ تکرار؛ بار هر پله متناسب تنظیم شود.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {"op": "prescribe", "sets": 4, "reps": "۱۲ / ۱۰ / ۸ / ۶"},
                    {
                        "op": "instruction",
                        "title": "بار",
                        "text": "در هر پله بار را متناسب با کاهش تکرار بالا ببر.",
                    },
                ],
            ),
            "sort_order": 120,
        },
        {
            "key": "reverse_pyramid",
            "name": "هرم معکوس",
            "description": "پس از گرم‌کردن، ست سنگین‌تر در ابتدای بخش اصلی و سپس کاهش تدریجی بار.",
            "execution_method": "نمونهٔ شروع: ۶، ۸، ۱۰ تکرار با کاهش بار در ست‌های بعدی.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {"op": "prescribe", "sets": 3, "reps": "۶ / ۸ / ۱۰"},
                    {
                        "op": "instruction",
                        "title": "بار",
                        "text": "ست نخست پس از گرم‌کردن با بار بالاتر؛ سپس بار را کاهش بده.",
                    },
                ],
            ),
            "sort_order": 130,
        },
        {
            "key": "top_backoff",
            "name": "ست اصلی و بک‌آف",
            "description": "یک ست اصلی سنگین‌تر و سپس ست‌های پشتیبان با بار کمتر.",
            "execution_method": "نمونهٔ شروع: ۱ ست ۵ تا ۸ تکرار، سپس ۲ ست ۸ تا ۱۲ با ۱۰ تا ۱۵٪ بار کمتر.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {"op": "prescribe", "sets": 3, "reps": "۱×۵–۸ اصلی + ۲×۸–۱۲ بک‌آف"},
                    {
                        "op": "instruction",
                        "title": "بار",
                        "text": "در ست‌های بک‌آف بار را حدود ۱۰ تا ۱۵٪ کمتر کن.",
                    },
                ],
            ),
            "sort_order": 140,
        },
        {
            "key": "cluster_sets",
            "name": "کلاسترست",
            "description": "تقسیم تکرارهای یک ست به خوشه‌های کوچک با مکث کوتاه درون‌ست.",
            "execution_method": "نمونهٔ شروع: ۳+۳+۳ تکرار با ۱۵ تا ۲۰ ثانیه مکث بین خوشه‌ها.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "prescribe",
                        "sets": 3,
                        "reps": "۳+۳+۳ (مکث ۱۵–۲۰ ثانیه بین خوشه‌ها)",
                        "rest_seconds": 150,
                    },
                ],
            ),
            "sort_order": 150,
        },
        {
            "key": "pre_exhaustion",
            "name": "پیش‌خستگی",
            "description": "حرکت ایزولهٔ عضله پیش از حرکت چندمفصلی همان عضله.",
            "execution_method": "نمونهٔ شروع: ایزوله ۱۲ تا ۱۵ تکرار، سپس چندمفصلی ۸ تا ۱۲ تکرار.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "ترتیب",
                        "text": "ایزوله را پیش از حرکت چندمفصلی همان عضله اجرا کن.",
                    }
                ],
                {
                    "size": 2,
                    "mode": "same_muscle",
                    "allow_compound": True,
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 0,
                    "rest_after_seconds": 90,
                    "exercise_order": "isolation_first",
                    "exercise_prescriptions": [
                        {"sets": 2, "reps": "۱۲ تا ۱۵"},
                        {"sets": 3, "reps": "۸ تا ۱۲"},
                    ],
                },
            ),
            "sort_order": 160,
        },
        {
            "key": "myo_reps",
            "name": "مایو‌رپس",
            "description": "ست فعال‌سازی و مینی‌ست‌های کوتاه با مکث محدود، معمولاً برای حرکت ایزوله.",
            "execution_method": "نمونهٔ شروع: ۱۲ تا ۲۰ تکرار فعال‌سازی، سپس مینی‌ست‌های ۳ تا ۵ تکراری با مکث کوتاه.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "last_isolation",
                [
                    {"op": "prescribe", "sets": 1, "reps": "۱۲–۲۰ فعال‌سازی + مینی‌ست‌های ۳–۵ تکراری"},
                    {
                        "op": "repeat",
                        "count": 3,
                        "steps": [
                            {"op": "rest", "seconds": 15},
                            {
                                "op": "instruction",
                                "title": "مینی‌ست",
                                "text": "۳ تا ۵ تکرار باکیفیت اجرا کن؛ با افت فرم متوقف شو.",
                            },
                        ],
                    },
                ],
            ),
            "sort_order": 170,
        },
        {
            "key": "tempo_isometric",
            "name": "تمپو / مکث ایزومتریک",
            "description": "تنظیم زمان بخش‌های حرکت یا مکث کنترل‌شده در نقطه‌ای از دامنه.",
            "execution_method": "نمونهٔ شروع: ۳ ثانیه بخش منفی، ۱ ثانیه مکث، ۲ ثانیه بخش مثبت.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "all",
                [
                    {"op": "tempo", "pattern": "3-1-2", "hold_seconds": 1},
                ],
            ),
            "sort_order": 180,
        },
        {
            "key": "mechanical_drop_set",
            "name": "دراپ‌ست مکانیکی",
            "description": "پس از نزدیک‌شدن به ناتوانی، تغییر به حالت یا اهرم آسان‌تر بدون تعویض بار.",
            "execution_method": "مربی باید تغییر دقیق حالت/دامنه را برای همان حرکت بنویسد؛ سیستم آن را حدس نمی‌زند.",
            "handler_key": "recipe",
            "recipe": _recipe(
                "last_isolation",
                [
                    {
                        "op": "instruction",
                        "title": "تغییر مکانیکی",
                        "text": "پس از ست اصلی، حالت یا دامنهٔ آسان‌ترِ از پیش تعیین‌شده را اجرا کن.",
                    },
                ],
            ),
            "sort_order": 190,
        },
    ]

    for row in recipes:
        key = row.pop("key")
        defaults = {**row, "is_active": True}
        Technique.objects.update_or_create(key=key, defaults=defaults)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0014_seed_partial_reps_system")]

    operations = [
        migrations.AddField(
            model_name="trainingtechnique",
            name="recipe",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="coachtechnique",
            name="recipe",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(seed_recipes, migrations.RunPython.noop),
    ]
