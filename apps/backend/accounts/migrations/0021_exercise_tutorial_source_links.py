from django.db import migrations, models

SOURCE_LINKS = [
    {
        "url": "https://www.dvidshub.net/video/636933/dumbbell-shoulder-press",
        "names": [
            "پرس سرشانه دمبل نشسته",
            "پرس سرشانه دمبل",
            "پرس شانه دمبل",
            "Seated Dumbbell Shoulder Press",
            "Dumbbell Shoulder Press",
        ],
        "muscles": ["سرشانه"],
    },
    {
        "url": "https://gravitus.com/guides/exercises/one-arm-cable-lateral-raise/",
        "names": [
            "نشر جانب تک‌دست سیم‌کش",
            "نشر جانب تک دست سیم کش",
            "نشر جانب تک دست سیم‌کش",
            "نشر جانب سیم‌کش تک دست",
            "نشر جانب سیم کش تک دست",
            "نشر جانب تک‌دست کابل",
            "نشر جانب کابل تک دست",
            "Single-Arm Cable Lateral Raise",
            "Single Arm Cable Lateral Raise",
            "One Arm Cable Lateral Raise",
        ],
        "muscles": ["سرشانه"],
    },
    {
        "url": "https://www.youtube.com/watch?v=U_qMtEvHuQM",
        "names": [
            "پشت بازو سیم‌کش بالای سر با طناب",
            "پشت بازو سیم کش طناب بالای سر",
            "پشت بازو سیم‌کش طناب بالای سر خم",
            "پشت بازو سیم کش بالای سر خم با طناب",
            "پشت بازو کابل بالای سر طناب",
            "Cable Rope Overhead Triceps Extension",
            "Overhead Cable Rope Triceps Extension",
        ],
        "muscles": ["پشت بازو"],
    },
]


def add_exact_tutorial_sources(apps, schema_editor):
    Exercise = apps.get_model("accounts", "Exercise")
    db = schema_editor.connection.alias
    for source in SOURCE_LINKS:
        Exercise.objects.using(db).filter(
            models.Q(name__in=source["names"]) | models.Q(name_en__in=source["names"]),
            is_archived=False,
            tutorial_source_url="",
            primary_muscle__in=source["muscles"],
        ).update(tutorial_source_url=source["url"])


def remove_exact_tutorial_sources(apps, schema_editor):
    Exercise = apps.get_model("accounts", "Exercise")
    db = schema_editor.connection.alias
    urls = [source["url"] for source in SOURCE_LINKS]
    Exercise.objects.using(db).filter(tutorial_source_url__in=urls).update(tutorial_source_url="")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0020_exercise_media_assets")]

    operations = [
        migrations.AddField(
            model_name="exercise",
            name="tutorial_source_url",
            field=models.URLField(blank=True, default="", max_length=1024),
        ),
        migrations.RunPython(add_exact_tutorial_sources, remove_exact_tutorial_sources),
    ]
