from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.test import TestCase

from accounts.exercise_catalog_import import (
    CatalogImportError,
    apply_import,
    load_catalog,
    prepare_import,
)
from accounts.models import (
    CoachProfile,
    EquipmentTaxonomy,
    Exercise,
    ExerciseMuscleTarget,
    MuscleRegion,
    MuscleTaxonomy,
)
from accounts.services import create_coach_account


def _coach(email: str, phone: str) -> CoachProfile:
    _, coach = create_coach_account(
        email=email,
        password="SecurePass123!",
        full_name=email.split("@", 1)[0],
        phone_number=phone,
    )
    return coach


def _catalog(external_key: str = "qa.chest.press") -> dict:
    return {
        "schema": "athlore.exercise_catalog.v1",
        "version": 1,
        "source": {
            "review_status": "confirmed",
            "documents": ["qa.txt"],
        },
        "exercises": [
            {
                "external_key": external_key,
                "name_fa": "حرکت تست کاتالوگ",
                "name_en": "Catalog QA Press",
                "aliases_fa": ["پرس تست کاتالوگ"],
                "targets": [
                    {
                        "muscle_key": "chest",
                        "region_key": "upper_chest",
                        "role": "primary",
                    }
                ],
                "levels": ["intermediate"],
                "equipment_keys": ["dumbbell"],
                "movement_pattern": "horizontal_press",
                "risk_tags": [],
                "is_preferred": True,
                "is_prohibited": False,
                "priority": 10,
                "coach_notes": "QA source",
                "source_document": "qa.txt",
            }
        ],
    }


class ExerciseCatalogImportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.coach = _coach("catalog-a@example.com", "09121110101")
        cls.other_coach = _coach("catalog-b@example.com", "09121110102")
        cls.chest = MuscleTaxonomy.objects.get(key="chest")
        cls.back = MuscleTaxonomy.objects.get(key="back")
        cls.upper_chest = MuscleRegion.objects.get(muscle=cls.chest, key="upper_chest")
        cls.dumbbell = EquipmentTaxonomy.objects.get(key="dumbbell")

    def test_apply_is_idempotent_and_coach_scoped(self):
        plan = prepare_import(self.coach, _catalog())
        self.assertEqual(plan.report["created"], 1)
        apply_import(plan)

        second_plan = prepare_import(self.coach, _catalog())
        self.assertEqual(second_plan.report["created"], 0)
        self.assertEqual(second_plan.report["updated"], 0)
        self.assertEqual(second_plan.report["skipped"], 1)
        self.assertEqual(Exercise.objects.filter(coach=self.other_coach).count(), 0)

    def test_coach_id_in_document_and_unknown_taxonomy_are_rejected_before_write(self):
        invalid = _catalog()
        invalid["coach_id"] = str(self.coach.id)
        with self.assertRaises(CatalogImportError):
            prepare_import(self.coach, invalid)
        self.assertEqual(Exercise.objects.filter(coach=self.coach).count(), 0)

        invalid = _catalog()
        invalid["exercises"][0]["targets"][0]["muscle_key"] = "not-a-muscle"
        with self.assertRaises(CatalogImportError):
            prepare_import(self.coach, invalid)
        self.assertEqual(Exercise.objects.filter(coach=self.coach).count(), 0)

    def test_replacement_removes_only_exact_chest_rows(self):
        old_chest = Exercise.objects.create(
            coach=self.coach,
            name="حرکت قدیمی سینه",
            name_en="Old Chest",
            primary_muscle=self.chest.name,
        )
        ExerciseMuscleTarget.objects.create(
            exercise=old_chest,
            muscle=self.chest,
            region=self.upper_chest,
            role=ExerciseMuscleTarget.Role.PRIMARY,
        )
        old_back = Exercise.objects.create(
            coach=self.coach,
            name="حرکت قدیمی پشت",
            name_en="Old Back",
            primary_muscle=self.back.name,
        )
        ExerciseMuscleTarget.objects.create(
            exercise=old_back,
            muscle=self.back,
            role=ExerciseMuscleTarget.Role.PRIMARY,
        )

        plan = prepare_import(
            self.coach,
            _catalog(),
            replace_primary_muscle_key="chest",
        )
        self.assertEqual(plan.report["deleted"], 1)
        apply_import(plan)
        self.assertFalse(Exercise.objects.filter(pk=old_chest.pk).exists())
        self.assertTrue(Exercise.objects.filter(pk=old_back.pk).exists())
        self.assertTrue(
            Exercise.objects.filter(coach=self.coach, external_key="qa.chest.press").exists()
        )

    def test_confirmed_arman_chest_catalog_resolves_all_26_rows(self):
        catalog = load_catalog(
            Path(settings.BASE_DIR) / "data" / "catalogs" / "arman-chest-catalog-v1.json"
        )

        plan = prepare_import(
            self.coach,
            catalog,
            replace_primary_muscle_key="chest",
        )

        self.assertEqual(plan.report["created"], 26)
        self.assertEqual(plan.report["deleted"], 0)
        self.assertEqual(plan.report["errors"], [])
        self.assertEqual(
            {
                item["primary_target"]["region_key"]
                for item in plan.report["exercises"]
            },
            {
                "whole_chest",
                "upper_chest",
                "lower_chest",
                "inner_chest",
                "inner_upper_chest",
                "inner_lower_chest",
            },
        )
