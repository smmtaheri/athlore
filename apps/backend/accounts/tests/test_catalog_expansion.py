import io

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError

from accounts.catalog_expansion import (
    MOVEMENTS,
    PACK_VERSION,
    expand_catalog,
    movement_payload,
    new_systems,
    seed_systems,
)
from accounts.exercise_metadata import MUSCLE_NAMES, metadata_issues
from accounts.models import CoachProfile, CoachTechnique, Exercise, TrainingTechnique
from accounts.training_recipes import tempo_seconds, validate_training_recipe
from programming.services.techniques import _apply_recipe
from programming.services.volume_planning import estimated_seconds


class CatalogExpansionTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username="expanded-catalog")
        self.coach = CoachProfile.objects.create(user=user, display_name="Catalog QA")

    def test_every_definition_has_usable_metadata_and_covers_supported_muscles(self):
        self.assertEqual({row[3] for row in MOVEMENTS}, set(MUSCLE_NAMES))
        for row in MOVEMENTS:
            with self.subTest(name=row[1]):
                self.assertEqual(metadata_issues(movement_payload(row)), [])

    def test_preview_is_readonly_and_apply_is_additive_idempotent_and_coach_scoped(self):
        before = Exercise.objects.count()
        preview = expand_catalog(self.coach)
        self.assertGreater(len(preview["created"]), 50)
        self.assertEqual(Exercise.objects.count(), before)
        applied = expand_catalog(self.coach, apply=True)
        self.assertEqual(applied["created"], preview["created"])
        rows = list(Exercise.objects.filter(coach=self.coach))
        for row in rows:
            with self.subTest(name=row.name):
                self.assertEqual(metadata_issues(row), [])
        first = rows[0]
        first.name = "Coach edited this exercise"
        first.is_active = False
        first.save(update_fields=["name", "is_active"])
        self.assertEqual(expand_catalog(self.coach, apply=True)["created"], [])
        first.refresh_from_db()
        self.assertEqual(first.name, "Coach edited this exercise")
        self.assertFalse(first.is_active)
        self.assertEqual(Exercise.objects.exclude(coach=self.coach).count(), before)

    def test_five_recipes_are_valid_and_existing_coach_edits_are_preserved(self):
        definitions = new_systems()
        self.assertEqual(len(definitions), 5)
        for row in definitions:
            validate_training_recipe(row["recipe"], allow_empty=False)
        seed_systems()
        technique = TrainingTechnique.objects.get(key="straight_sets")
        technique.name = "Coach's preferred name"
        technique.save(update_fields=["name"])
        self.assertEqual(seed_systems(), [])
        technique.refresh_from_db()
        self.assertEqual(technique.name, "Coach's preferred name")

    def test_strength_5x5_prefers_a_loadable_compound_when_available(self):
        definition = next(row for row in new_systems() if row["key"] == "strength_5x5")
        config = CoachTechnique(coach=self.coach, **definition)
        days = [
            {
                "id": "day-1",
                "exercises": [
                    {
                        "id": "bodyweight",
                        "name": "Bodyweight squat",
                        "targetMuscle": "پا",
                        "sets": 3,
                        "reps": "8-12",
                        "exercise_snapshot": {
                            "mechanics": "multi_joint",
                            "prescription_unit": "reps",
                            "equipment_keys": ["bodyweight"],
                        },
                    },
                    {
                        "id": "loaded",
                        "name": "Barbell squat",
                        "targetMuscle": "پا",
                        "sets": 3,
                        "reps": "8-12",
                        "exercise_snapshot": {
                            "mechanics": "multi_joint",
                            "prescription_unit": "reps",
                            "equipment_keys": ["barbell"],
                        },
                    },
                ],
            }
        ]

        count, _ = _apply_recipe(days, config)

        exercises = {row["id"]: row for row in days[0]["exercises"]}
        self.assertEqual(count, 1)
        self.assertEqual(exercises["loaded"]["sets"], 5)
        self.assertEqual(exercises["loaded"]["reps"], "5")
        self.assertEqual(exercises["bodyweight"]["sets"], 3)

    def test_only_explicit_pending_release_rows_are_activated(self):
        seed_systems()
        pending = TrainingTechnique.objects.get(key="strength_5x5")
        pending.is_active = False
        pending.parameter_schema = {"pending_stage_release": PACK_VERSION}
        pending.save(update_fields=["is_active", "parameter_schema"])
        disabled = TrainingTechnique.objects.get(key="straight_sets")
        disabled.is_active = False
        disabled.save(update_fields=["is_active"])
        seed_systems()
        pending.refresh_from_db()
        disabled.refresh_from_db()
        self.assertTrue(pending.is_active)
        self.assertEqual(pending.parameter_schema, {})
        self.assertFalse(disabled.is_active)

    @override_settings(PUBLIC_DOMAIN="athlore.ir")
    def test_apply_rejects_production_even_with_confirmation(self):
        with self.assertRaises(CommandError):
            call_command(
                "expand_stage_catalog",
                coach_id=str(self.coach.pk),
                apply=True,
                confirm_stage=True,
                stdout=io.StringIO(),
            )

    @override_settings(PUBLIC_DOMAIN="stage.athlore.ir")
    def test_command_requires_confirmation_and_can_apply(self):
        with self.assertRaises(CommandError):
            call_command(
                "expand_stage_catalog",
                coach_id=str(self.coach.pk),
                apply=True,
                stdout=io.StringIO(),
            )
        call_command(
            "expand_stage_catalog",
            coach_id=str(self.coach.pk),
            apply=True,
            confirm_stage=True,
            stdout=io.StringIO(),
        )
        self.assertTrue(Exercise.objects.filter(coach=self.coach).exists())

    def test_tempo_is_numeric_and_changes_execution_time(self):
        self.assertEqual(tempo_seconds("4-0-1-0"), 5)
        self.assertEqual(tempo_seconds("3-1-X", 2), 6)
        item = {"sets": 3, "reps": "10", "rest_seconds": 90}
        self.assertEqual(
            estimated_seconds({**item, "tempoSecondsPerRep": 5}, {"rest_seconds": 90})
            - estimated_seconds(item, {"rest_seconds": 90}),
            60,
        )
        for pattern in ("slow", "0-0-0-0", "3-X-1-0", "3-40-1-0"):
            with self.subTest(pattern=pattern), self.assertRaises(ValidationError):
                tempo_seconds(pattern)

    def test_prescription_numbers_are_not_silently_truncated(self):
        for step in (
            {"op": "prescribe", "sets": True},
            {"op": "prescribe", "sets": 2.5},
            {"op": "prescribe", "reps": "12-8"},
            {"op": "prescribe", "reps": "0"},
        ):
            with self.subTest(step=step), self.assertRaises(ValidationError):
                validate_training_recipe(
                    {"version": 1, "target": "all", "steps": [step]}, allow_empty=False
                )

    def test_new_systems_apply_real_prescriptions_to_eligible_movements(self):
        import copy

        definitions = new_systems()
        baseline = [
            {
                "id": "day",
                "exercises": [
                    {
                        "id": "curl",
                        "name": "Curl",
                        "targetMuscle": "جلو بازو",
                        "sets": 3,
                        "reps": "10",
                        "exercise_snapshot": {
                            "mechanics": "single_joint",
                            "prescription_unit": "reps",
                        },
                    },
                    {
                        "id": "carry",
                        "name": "Carry",
                        "targetMuscle": "شکم",
                        "sets": 3,
                        "reps": "30",
                        "exercise_snapshot": {
                            "mechanics": "multi_joint",
                            "prescription_unit": "seconds",
                        },
                    },
                    {
                        "id": "press",
                        "name": "Press",
                        "targetMuscle": "سینه",
                        "sets": 3,
                        "reps": "10",
                        "exercise_snapshot": {
                            "mechanics": "multi_joint",
                            "prescription_unit": "reps",
                            "equipment_keys": ["barbell"],
                        },
                    },
                    {
                        "id": "row",
                        "name": "Row",
                        "targetMuscle": "زیربغل",
                        "sets": 3,
                        "reps": "10",
                        "exercise_snapshot": {
                            "mechanics": "multi_joint",
                            "prescription_unit": "reps",
                        },
                    },
                ],
            }
        ]
        for definition in definitions:
            with self.subTest(system=definition["key"]):
                days = copy.deepcopy(baseline)
                config = CoachTechnique(coach=self.coach, **definition)
                count, _ = _apply_recipe(days, config)
                self.assertGreater(count, 0)
                exercises = {item["id"]: item for item in days[0]["exercises"]}
                if definition["key"] == "strength_5x5":
                    self.assertEqual(exercises["press"]["sets"], 5)
                    self.assertEqual(exercises["press"]["reps"], "5")
                    self.assertEqual(exercises["curl"]["sets"], 3)
                    self.assertEqual(exercises["carry"]["sets"], 3)
                    self.assertEqual(exercises["row"]["sets"], 3)
                if definition["key"] == "paused_reps":
                    self.assertEqual(exercises["press"]["tempoSecondsPerRep"], 5)
                if definition["key"] == "eccentric_emphasis":
                    self.assertEqual(exercises["curl"]["tempoSecondsPerRep"], 5)
