from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("students", "0017_visit_training_constraints")]

    operations = [
        migrations.AlterField(
            model_name="visit",
            name=name,
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                default=None,
                max_digits=5,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                    django.core.validators.MaxValueValidator(Decimal("100")),
                ],
            ),
        )
        for name in (
            "adherence_nutrition",
            "adherence_overall",
            "adherence_supplements",
            "adherence_training",
        )
    ] + [
        migrations.AlterField(
            model_name="visit",
            name=name,
            field=models.CharField(
                blank=True,
                choices=[("low", "Low"), ("medium", "Medium"), ("good", "Good"), ("high", "High")],
                max_length=16,
                null=True,
            ),
        )
        for name in ("daily_energy_level", "sleep_quality", "stress_level")
    ]
