"""Reviewed corrections only: preserve exercise identity, ownership and media."""

from django.db import migrations


def review_catalog(apps, schema_editor):
    alias = schema_editor.connection.alias
    Exercise = apps.get_model("accounts", "Exercise")
    Equipment = apps.get_model("accounts", "EquipmentTaxonomy")
    Link = apps.get_model("accounts", "ExerciseEquipment")
    Muscle = apps.get_model("accounts", "MuscleTaxonomy")
    Target = apps.get_model("accounts", "ExerciseMuscleTarget")
    Level = apps.get_model("accounts", "ExerciseSuitableLevel")
    equipment = {}
    for key, name in (
        ("bench_flat", "نیمکت صاف"),
        ("bench_adjustable", "نیمکت شیب‌دار"),
        ("pullup_bar", "میله بارفیکس"),
    ):
        equipment[key], _ = Equipment.objects.using(alias).get_or_create(
            key=key, defaults={"name": name, "is_active": True, "sort_order": 100}
        )
    corrections = {
        "فلای معکوس دستگاه": ("shoulder_horizontal_abduction", ["shoulder"]),
        "فلای معکوس دستگاه تک دست": ("shoulder_horizontal_abduction", ["shoulder"]),
        "نشر از پشت سیم کش کراس": ("shoulder_horizontal_abduction", ["shoulder"]),
        "نشر از پشت سیم کش کراس تک دست": ("shoulder_horizontal_abduction", ["shoulder"]),
        "جلوباز هالتر دست جمع": ("elbow_flexion", ["elbow"]),
    }
    dependencies = {
        "پرس بالاسینه دمبل": "bench_adjustable",
        "پرس بالاسینه دمبل موازی": "bench_adjustable",
        "پرس بالاسینه اسمیت": "bench_adjustable",
        "قفسه بالاسینه دمبل": "bench_adjustable",
        "قفسه بالاسینه کراس خوابیده": "bench_adjustable",
        "جلوبازو دمبل نیمکت شیب دار متناوب": "bench_adjustable",
        "جلوبازو دمبل چکشی نیمکت شیب دار جفت دست": "bench_adjustable",
        "جلوبازو دمبل چکشی نیمکت شیب دار متناوب": "bench_adjustable",
        "جلوبازو دمیل نیمکت شیب دار جفت دست": "bench_adjustable",
        "نشر از روبرو دمبل چکشی جفت دست نیمکت شیب دار": "bench_adjustable",
        "نشر جانب دمبل خوابیده نیمکت شیب دار": "bench_adjustable",
        "نشر خم دمبل نیمکت شیب دار": "bench_adjustable",
        "نشر روبرو دمبل جفت دست نیمکت شیب دار": "bench_adjustable",
        "نشر روبرو هالتر نیمکت شیب دار": "bench_adjustable",
        "پرس بالاسینه هالتر": "bench_adjustable",
        "پرس سینه دمبل": "bench_flat",
        "پرس سینه دمبل موازی": "bench_flat",
        "پرس سینه اسمیت": "bench_flat",
        "قفسه کراس خوابیده": "bench_flat",
        "پشت بازو دمبل خوابیده تک دست": "bench_flat",
        "پشت بازو دمبل خوابیده جفت دست": "bench_flat",
        "پشت بازو دیپ نیمکت": "bench_flat",
        "پرس سینه هالتر": "bench_flat",
        "بارفیکس": "pullup_bar",
    }
    for row in Exercise.objects.using(alias).all().iterator():
        if row.name in corrections:
            row.movement_pattern, row.joint_keys = corrections[row.name]
            row.mechanics = "single_joint"
            row.save(using=alias, update_fields=["movement_pattern", "joint_keys", "mechanics"])
        if row.name in dependencies:
            Link.objects.using(alias).get_or_create(
                exercise_id=row.pk, equipment=equipment[dependencies[row.name]]
            )
    # Close the reviewed beginner/home gap without inventing a bench at home.
    dumbbell = Equipment.objects.using(alias).filter(key="dumbbell").first()
    if dumbbell:
        coach_ids = list(
            Exercise.objects.using(alias)
            .filter(is_active=True, is_archived=False)
            .values_list("coach_id", flat=True)
            .distinct()
        )
        for coach_id in coach_ids:
            for name, key, pattern, joints in (
                ("پرس سینه دمبل روی زمین", "chest", "push_horizontal", ["shoulder", "elbow"]),
                ("ددلیفت رومانیایی دمبل", "hamstrings", "hip_hinge", ["hip"]),
            ):
                if Exercise.objects.using(alias).filter(coach_id=coach_id, name=name).exists():
                    continue
                muscle = Muscle.objects.using(alias).filter(key=key).first()
                if not muscle:
                    continue
                row = Exercise.objects.using(alias).create(
                    coach_id=coach_id,
                    name=name,
                    primary_muscle=muscle.name,
                    equipment=dumbbell.name,
                    level="all",
                    movement_pattern=pattern,
                    mechanics="multi_joint",
                    joint_keys=joints,
                    prescription_unit="reps",
                )
                Target.objects.using(alias).create(
                    exercise_id=row.pk, muscle_id=muscle.pk, role="primary"
                )
                Link.objects.using(alias).create(exercise_id=row.pk, equipment_id=dumbbell.pk)
                for level in ("beginner", "intermediate", "advanced"):
                    Level.objects.using(alias).create(exercise_id=row.pk, level=level)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0026_coach_muscle_decisions")]
    operations = [migrations.RunPython(review_catalog, migrations.RunPython.noop)]
