from django.db import migrations

# Explicit variants only; preserve coach-supplied videos and custom sources.
SOURCES = [
    ("سرشانه", "پرس سرشانه دمبل", "https://www.youtube.com/watch?v=fSc8JcuPgtk"),
    ("سرشانه", "نشر جانب سیم کش تک دست", "https://www.strengthlog.com/cable-lateral-raise/"),
    (
        "پشت بازو",
        "پشت بازو سیم کش بالای سر خم",
        "https://fitwill.app/exercise/10765/cable-bent-over-overhead-triceps-extension-straig/",
    ),
    (
        "پشت بازو",
        "پشت بازو سیم کش طناب بالای سر خم",
        "https://www.fittr.com/exercise-video/cable-bent-over-triceps-extension-with-rope-attachment-82/",
    ),
    ("سینه", "پرس بالاسینه اسمیت", "https://www.youtube.com/watch?v=D_h6XI_YxhA"),
    ("سینه", "پرس بالاسینه دستگاه", "https://www.youtube.com/watch?v=DAASbJm0d7E"),
    ("سینه", "پرس بالاسینه دمبل", "https://www.youtube.com/watch?v=8iPEnn-ltC8"),
    ("سرشانه", "پرس سرشانه دستگاه", "https://www.youtube.com/watch?v=6-FxadmQrSM"),
    ("سرشانه", "نشر خم دمبل نیمکت شیب دار", "https://www.youtube.com/watch?v=aUX1ZDMrQW0"),
    ("همسترینگ", "پشت پا ایستاده دستگاه", "https://www.youtube.com/watch?v=Z053-kKjesQ"),
    (
        "پشت بازو",
        "پشت بازو سیم کش طناب بالای سر ایستاده",
        "https://www.youtube.com/watch?v=U_qMtEvHuQM",
    ),
    ("پشت بازو", "پشت بازو هالتر پرسی", "https://www.youtube.com/watch?v=UYJsFzqdgK4"),
]

PREVIOUS_SEEDS = {
    "https://www.dvidshub.net/video/636933/dumbbell-shoulder-press",
    "https://gravitus.com/guides/exercises/one-arm-cable-lateral-raise/",
    "https://www.youtube.com/watch?v=U_qMtEvHuQM",
}


def normalized(value):
    return " ".join(value.replace("\u200c", " ").replace("ي", "ی").replace("ك", "ک").split())


def complete_sources(apps, schema_editor):
    Exercise = apps.get_model("accounts", "Exercise")
    sources = {(muscle, normalized(name)): url for muscle, name, url in SOURCES}
    for exercise in (
        Exercise.objects.using(schema_editor.connection.alias).filter(is_archived=False).iterator()
    ):
        url = sources.get((exercise.primary_muscle, normalized(exercise.name)))
        if (
            url
            and not exercise.tutorial_url
            and not exercise.media_asset_id
            and (not exercise.tutorial_source_url or exercise.tutorial_source_url in PREVIOUS_SEEDS)
        ):
            Exercise.objects.using(schema_editor.connection.alias).filter(pk=exercise.pk).update(
                tutorial_source_url=url
            )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0021_exercise_tutorial_source_links")]
    operations = [migrations.RunPython(complete_sources, migrations.RunPython.noop)]
