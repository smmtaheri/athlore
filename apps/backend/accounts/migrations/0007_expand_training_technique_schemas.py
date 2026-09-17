from django.db import migrations


SUPERSET_SCHEMA = {
    "pairing_mode": {
        "type": "enum",
        "default": "same_muscle_isolation",
        "options": [
            {"value": "same_muscle_isolation", "label": "ایزوله‌های هم‌عضله"},
            {"value": "same_muscle", "label": "حرکات هم‌عضله"},
            {"value": "antagonist", "label": "عضلات مخالف"},
            {"value": "any_eligible", "label": "هر دو حرکت مجاز"},
        ],
    },
    "max_pairs": {"type": "integer", "default": 1, "min": 1, "max": 10},
    "allow_compound": {"type": "boolean", "default": False},
    "rest_between_exercises_seconds": {
        "type": "integer",
        "default": 0,
        "min": 0,
        "max": 600,
    },
    "rest_after_pair_seconds": {
        "type": "integer",
        "default": 90,
        "min": 0,
        "max": 900,
    },
}

DROP_SET_SCHEMA = {
    "drops": {"type": "integer", "default": 1, "min": 1, "max": 3},
    "reduction_percent": {
        "type": "integer",
        "default": 20,
        "min": 1,
        "max": 80,
    },
}


def expand_public_technique_schemas(apps, schema_editor):
    TrainingTechnique = apps.get_model("accounts", "TrainingTechnique")
    schemas = {"superset": SUPERSET_SCHEMA, "drop_set": DROP_SET_SCHEMA}
    for key, schema in schemas.items():
        TrainingTechnique.objects.filter(key=key).update(parameter_schema=schema)


def keep_public_technique_schemas(apps, schema_editor):
    # The previous migration's schemas are intentionally not restored. This is
    # a monotonic metadata expansion and has no data-loss reverse operation.
    pass


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_structured_catalog_and_techniques")]

    operations = [
        migrations.RunPython(expand_public_technique_schemas, keep_public_technique_schemas),
    ]
