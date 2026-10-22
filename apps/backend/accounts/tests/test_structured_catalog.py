from __future__ import annotations

import copy
from decimal import Decimal

from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import ProgramTemplate
from accounts.rules_services import ensure_rule_set
from common.testing import auth_header, register
from programming.services.generator import generate_document
from programming.services.techniques import apply_structured_techniques
from students.models import Student


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class StructuredCatalogApiTests(APITestCase):
    def setUp(self):
        coach_a = register(self.client, "structured-a@example.com", full_name="Coach A")
        coach_b = register(self.client, "structured-b@example.com", full_name="Coach B")
        self.tokens_a = coach_a.data["tokens"]
        self.tokens_b = coach_b.data["tokens"]

    def _exercise_payload(self, name: str) -> dict:
        return {
            "name": name,
            "name_en": "Upper Chest Press",
            "aliases": [f"{name} جایگزین"],
            "targets": [
                {"muscle_key": "chest", "region_key": "upper_chest", "role": "primary"},
                {"muscle_key": "triceps", "region_key": "long_head", "role": "secondary"},
            ],
            "levels": ["intermediate", "advanced"],
            "equipment_keys": ["dumbbell"],
            "movement_pattern": "horizontal_press",
            "source_document": "Coach manual entry",
            "coach_notes": "Review before use.",
            "priority": 2,
            "is_preferred": True,
        }

    def test_structured_crud_filters_and_cross_coach_404(self):
        created = self.client.post(
            "/api/v1/exercises/",
            self._exercise_payload("پرس بالاسینه دمبل A"),
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["targets"][0]["region_key"], "upper_chest")
        self.assertEqual(set(created.data["levels"]), {"intermediate", "advanced"})
        exercise_id = created.data["id"]

        filtered = self.client.get(
            "/api/v1/exercises/?region=upper_chest&level=intermediate&equipment=dumbbell",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual([row["id"] for row in filtered.data["results"]], [exercise_id])

        qualified_region_filter = self.client.get(
            "/api/v1/exercises/?region=triceps:long_head",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(
            [row["id"] for row in qualified_region_filter.data["results"]], [exercise_id]
        )

        other_coach = self.client.get(
            f"/api/v1/exercises/{exercise_id}/", **auth_header(self.tokens_b)
        )
        self.assertEqual(other_coach.status_code, 404)

        patched = self.client.patch(
            f"/api/v1/exercises/{exercise_id}/",
            {"is_active": False, "priority": 0},
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(patched.status_code, 200)
        self.assertFalse(patched.data["is_active"])

        archived = self.client.delete(
            f"/api/v1/exercises/{exercise_id}/", **auth_header(self.tokens_a)
        )
        self.assertEqual(archived.status_code, 204)

    def test_exercise_taxonomy_uses_coach_facing_level_labels(self):
        response = self.client.get("/api/v1/exercise-taxonomy/", **auth_header(self.tokens_a))
        self.assertEqual(response.status_code, 200)
        labels = {item["key"]: item["name"] for item in response.data["levels"]}
        self.assertEqual(labels["beginner"], "مبتدی")
        self.assertEqual(labels["intermediate"], "نیمه‌حرفه‌ای")
        self.assertEqual(labels["advanced"], "حرفه‌ای")

    def test_shared_muscle_and_region_taxonomy_can_be_managed_and_is_visible_to_all_coaches(self):
        created_muscle = self.client.post(
            "/api/v1/exercise-taxonomy/muscles/",
            {"name": "عضله آزمون سراسری", "name_en": "Shared QA Muscle", "sort_order": 91},
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(created_muscle.status_code, 201)
        muscle_id = created_muscle.data["id"]
        muscle_key = created_muscle.data["key"]

        visible_to_other_coach = self.client.get(
            "/api/v1/exercise-taxonomy/", **auth_header(self.tokens_b)
        )
        self.assertIn(muscle_key, {row["key"] for row in visible_to_other_coach.data["muscles"]})

        updated_muscle = self.client.patch(
            f"/api/v1/exercise-taxonomy/muscles/{muscle_id}/",
            {"name": "عضله‌ی مشترک ویرایش‌شده"},
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(updated_muscle.status_code, 200)
        self.assertEqual(updated_muscle.data["name"], "عضله‌ی مشترک ویرایش‌شده")

        created_region = self.client.post(
            f"/api/v1/exercise-taxonomy/muscles/{muscle_id}/regions/",
            {"name": "ناحیه آزمون", "name_en": "QA Region", "sort_order": 2},
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(created_region.status_code, 201)
        region_id = created_region.data["id"]
        region_key = created_region.data["key"]
        self.assertEqual(created_region.data["muscle_key"], muscle_key)

        region_for_other_coach = self.client.get(
            "/api/v1/exercise-taxonomy/", **auth_header(self.tokens_b)
        )
        shared_muscle = next(
            row for row in region_for_other_coach.data["muscles"] if row["key"] == muscle_key
        )
        self.assertEqual(shared_muscle["regions"][0]["key"], region_key)

        duplicate_region = self.client.post(
            f"/api/v1/exercise-taxonomy/muscles/{muscle_id}/regions/",
            {"name": "ناحیه آزمون"},
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(duplicate_region.status_code, 400)

        updated = self.client.patch(
            f"/api/v1/exercise-taxonomy/regions/{region_id}/",
            {"name": "ناحیه ویرایش‌شده"},
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["name"], "ناحیه ویرایش‌شده")

        archived_region = self.client.delete(
            f"/api/v1/exercise-taxonomy/regions/{region_id}/", **auth_header(self.tokens_a)
        )
        self.assertEqual(archived_region.status_code, 200)
        self.assertFalse(archived_region.data["is_active"])
        active_taxonomy = self.client.get(
            "/api/v1/exercise-taxonomy/", **auth_header(self.tokens_b)
        )
        active_muscle = next(
            row for row in active_taxonomy.data["muscles"] if row["key"] == muscle_key
        )
        self.assertEqual(active_muscle["regions"], [])
        complete_taxonomy = self.client.get(
            "/api/v1/exercise-taxonomy/?include_inactive=true",
            **auth_header(self.tokens_b),
        )
        archived_muscle = next(
            row for row in complete_taxonomy.data["muscles"] if row["key"] == muscle_key
        )
        self.assertFalse(archived_muscle["regions"][0]["is_active"])

        archived_muscle_response = self.client.delete(
            f"/api/v1/exercise-taxonomy/muscles/{muscle_id}/", **auth_header(self.tokens_a)
        )
        self.assertEqual(archived_muscle_response.status_code, 200)
        self.assertFalse(archived_muscle_response.data["is_active"])

        cannot_reactivate_child = self.client.patch(
            f"/api/v1/exercise-taxonomy/regions/{region_id}/",
            {"is_active": True},
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(cannot_reactivate_child.status_code, 400)

    def test_deactivated_taxonomy_target_is_preserved_on_edit_but_cannot_be_reused(self):
        created = self.client.post(
            "/api/v1/exercises/",
            self._exercise_payload("پرس بالاسینه با ناحیه غیرفعال"),
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(created.status_code, 201)

        from accounts.models import MuscleRegion

        region = MuscleRegion.objects.get(muscle__key="chest", key="upper_chest")
        region.is_active = False
        region.save(update_fields=["is_active"])

        retained = self.client.patch(
            f"/api/v1/exercises/{created.data['id']}/",
            {"targets": created.data["targets"], "coach_notes": "ویرایش بدون تغییر اتصال"},
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(retained.status_code, 200)
        self.assertEqual(retained.data["targets"][0]["region_key"], "upper_chest")

        cannot_assign_archived = self.client.post(
            "/api/v1/exercises/",
            self._exercise_payload("حرکت جدید با ناحیه غیرفعال"),
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(cannot_assign_archived.status_code, 400)

    def test_technique_override_private_isolation_and_handler_status(self):
        public = self.client.get("/api/v1/training-techniques/", **auth_header(self.tokens_a))
        self.assertEqual(public.status_code, 200)
        self.assertIn("superset", {row["key"] for row in public.data})
        self.assertIn("drop_set", {row["key"] for row in public.data})
        self.assertTrue(
            {
                "superset",
                "drop_set",
                "rest_pause",
                "tri_set",
                "partial_reps",
                "21s",
                "5_10_20",
                "giant_set",
                "mammoth_set",
                "post_exhaustion",
                "fst_7",
                "pyramid_sets",
                "reverse_pyramid",
                "top_backoff",
                "cluster_sets",
                "pre_exhaustion",
                "myo_reps",
                "tempo_isometric",
                "mechanical_drop_set",
            }.issubset({row["key"] for row in public.data})
        )
        self.assertTrue(all(row["recipe"].get("version") == 1 for row in public.data))
        superset_public = next(row for row in public.data if row["key"] == "superset")
        self.assertIn("pairing_mode", superset_public["parameter_schema"])
        self.assertIn("rest_after_pair_seconds", superset_public["parameter_schema"])

        override = self.client.post(
            "/api/v1/training-techniques/",
            {
                "key": "superset",
                "name": "سوپرست شخصی",
                "base_technique_key": "superset",
                "allowed_levels": ["intermediate"],
                "max_per_session": 2,
                "parameters": {"max_pairs": 2, "pairing": "same_muscle_isolation"},
            },
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(override.status_code, 201)
        self.assertEqual(override.data["handler_status"], "implemented")

        private = self.client.post(
            "/api/v1/training-techniques/",
            {
                "key": "coach_a_custom",
                "name": "تکنیک خصوصی مربی A",
                "description": "Saved for manual use.",
                "allowed_levels": ["advanced"],
            },
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(private.status_code, 201)
        self.assertEqual(private.data["handler_status"], "manual_only")

        coach_b_rows = self.client.get("/api/v1/training-techniques/", **auth_header(self.tokens_b))
        self.assertNotIn("coach_a_custom", {row["key"] for row in coach_b_rows.data})
        forbidden_patch = self.client.patch(
            f"/api/v1/training-techniques/{private.data['id']}/",
            {"enabled": False},
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(forbidden_patch.status_code, 404)

    def test_custom_recipe_is_saved_and_reported_as_executable(self):
        recipe = {
            "version": 1,
            "target": "last_isolation",
            "steps": [
                {"op": "prescribe", "sets": 4, "reps": "۱۰ تا ۱۲", "rest_seconds": 75},
                {"op": "tempo", "pattern": "3-1-2"},
            ],
        }
        response = self.client.post(
            "/api/v1/training-techniques/",
            {
                "key": "coach-system-custom-recipe",
                "name": "روش سفارشی مربی",
                "recipe": recipe,
            },
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["handler_status"], "implemented")
        self.assertEqual(response.data["recipe"], recipe)


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class StructuredCatalogGeneratorTests(APITestCase):
    def _create_exercise(self, name: str, **flags):
        payload = {
            "name": name,
            "targets": [{"muscle_key": "chest", "region_key": "upper_chest", "role": "primary"}],
            "levels": ["intermediate"],
            "equipment_keys": ["dumbbell"],
            **flags,
        }
        response = self.client.post(
            "/api/v1/exercises/", payload, format="json", **auth_header(self.tokens)
        )
        self.assertEqual(response.status_code, 201)
        return response.data

    def setUp(self):
        response = register(self.client, "generator-structured@example.com")
        self.tokens = response.data["tokens"]
        from accounts.models import CoachProfile

        self.coach = CoachProfile.objects.get(user__email="generator-structured@example.com")

    def test_generator_uses_two_allowed_upper_chest_rows_and_writes_evidence(self):
        self._create_exercise("پرس بالاسینه دمبل A")
        self._create_exercise("پرس بالاسینه دمبل B")
        prohibited = self._create_exercise("پرس بالاسینه دمبل ممنوع", is_prohibited=True)
        self._create_exercise("پرس بالاسینه دمبل غیرفعال", is_active=False)

        rule_set = ensure_rule_set(self.coach)
        template = ProgramTemplate.objects.create(
            rule_set=rule_set,
            coach=self.coach,
            name="Upper chest structured",
            level="intermediate",
            days_per_week=1,
            split=["سینه"],
        )
        student = Student.objects.create(
            coach=self.coach,
            full_name="Structured Student",
            age=28,
            gender="male",
            height_cm=Decimal("180.0"),
            weight_kg=Decimal("80.0"),
            equipment={"has_dumbbell": True},
            training_background={"level": "intermediate"},
        )
        document, _warnings = generate_document(
            coach=self.coach,
            student=student,
            visit=None,
            template=template,
            request={
                "program_type": "workout",
                "level": "intermediate",
                "target_muscle": "سینه",
                "target_region": "upper_chest",
                "exercise_count": 2,
            },
        )
        chest = next(day for day in document["training"]["days"] if "سینه" in day["targetMuscles"])
        names = {
            exercise["name"]
            for exercise in chest["exercises"]
            if exercise["targetMuscle"] == "سینه"
        }
        self.assertEqual(len(names), 2)
        self.assertTrue(names.intersection({"پرس بالاسینه دمبل A", "پرس بالاسینه دمبل B"}))
        self.assertNotIn(prohibited["name"], names)
        evidence = document["generator"]["evidence"]
        self.assertTrue(evidence["structured_catalog_selected"])
        self.assertTrue(
            any(
                item["reason"] == "coach_prohibited"
                for item in evidence["structured_catalog_excluded"]
            )
        )

    def test_structured_drop_set_handler_uses_coach_parameters(self):
        response = self.client.post(
            "/api/v1/training-techniques/",
            {
                "key": "drop_set",
                "name": "دراپ‌ست تنظیم‌شده",
                "base_technique_key": "drop_set",
                "allowed_levels": ["intermediate"],
                "max_per_session": 1,
                "parameters": {"drops": 2, "reduction_percent": 25},
            },
            format="json",
            **auth_header(self.tokens),
        )
        self.assertEqual(response.status_code, 201)

        days, evidence, _handled = apply_structured_techniques(
            [
                {
                    "exercises": [
                        {
                            "name": "جلو بازو دمبل",
                            "targetMuscle": "جلو بازو",
                            "sets": 3,
                            "supersetGroupId": None,
                            "techniques": [],
                            "raw_prescription": "۳×۱۰",
                            "notes": "",
                        }
                    ]
                }
            ],
            self.coach,
            "intermediate",
            allowed_names={"drop_set"},
        )
        self.assertEqual(days[0]["exercises"][0]["dropSet"], {"drops": 2, "reduction_percent": 25})
        self.assertTrue(any(item["handler"] == "drop_set" for item in evidence))

    def test_structured_superset_handler_uses_coach_pairing_definition(self):
        response = self.client.post(
            "/api/v1/training-techniques/",
            {
                "key": "superset",
                "name": "سوپرست عضلات مخالف",
                "base_technique_key": "superset",
                "allowed_levels": ["intermediate"],
                "max_per_session": 2,
                "parameters": {
                    "pairing_mode": "antagonist",
                    "max_pairs": 2,
                    "allow_compound": True,
                    "rest_between_exercises_seconds": 0,
                    "rest_after_pair_seconds": 90,
                },
            },
            format="json",
            **auth_header(self.tokens),
        )
        self.assertEqual(response.status_code, 201)

        days, evidence, _handled = apply_structured_techniques(
            [
                {
                    "exercises": [
                        {
                            "name": "پرس سینه هالتر",
                            "targetMuscle": "سینه",
                            "sets": 3,
                            "supersetGroupId": None,
                            "techniques": [],
                            "notes": "",
                        },
                        {
                            "name": "زیربغل دستگاه",
                            "targetMuscle": "زیربغل",
                            "sets": 3,
                            "supersetGroupId": None,
                            "techniques": [],
                            "notes": "",
                        },
                    ]
                }
            ],
            self.coach,
            "intermediate",
        )
        first, second = days[0]["exercises"]
        self.assertEqual(first["supersetGroupId"], second["supersetGroupId"])
        self.assertEqual(first["supersetRestBetweenSeconds"], 0)
        self.assertEqual(first["supersetRestAfterSeconds"], 90)
        self.assertEqual(first["techniques"][0]["parameters"]["pairing_mode"], "antagonist")
        self.assertEqual(evidence[0]["status"], "applied")
        self.assertEqual(evidence[0]["parameters"]["max_pairs"], 2)

    def test_coach_recipe_changes_prescription_and_surfaces_instructions(self):
        recipe = {
            "version": 1,
            "target": "last_isolation",
            "steps": [
                {"op": "prescribe", "sets": 4, "reps": "۱۰ تا ۱۲", "rest_seconds": 75},
                {"op": "tempo", "pattern": "3-1-2"},
            ],
        }
        created = self.client.post(
            "/api/v1/training-techniques/",
            {"key": "custom-tempo-system", "name": "تمپوی شخصی", "recipe": recipe},
            format="json",
            **auth_header(self.tokens),
        )
        self.assertEqual(created.status_code, 201, created.content)

        days, evidence, _ = apply_structured_techniques(
            [
                {
                    "id": "day-1",
                    "exercises": [
                        {
                            "id": "press",
                            "name": "پرس سینه هالتر",
                            "targetMuscle": "سینه",
                            "sets": 3,
                            "reps": "۸ تا ۱۰",
                            "rest": "۹۰ ثانیه",
                            "notes": "",
                            "supersetGroupId": None,
                            "techniques": [],
                        },
                        {
                            "id": "curl",
                            "name": "جلو بازو دمبل",
                            "targetMuscle": "جلو بازو",
                            "sets": 3,
                            "reps": "۸ تا ۱۰",
                            "rest": "۹۰ ثانیه",
                            "notes": "",
                            "supersetGroupId": None,
                            "techniques": [],
                        },
                    ],
                }
            ],
            self.coach,
            "intermediate",
            selected_systems=[{"key": "custom-tempo-system"}],
        )
        press, curl = days[0]["exercises"]
        self.assertEqual(press["sets"], 3)
        self.assertEqual(curl["sets"], 4)
        self.assertEqual(curl["reps"], "۱۰ تا ۱۲")
        self.assertIn("تمپو 3-1-2", curl["notes"])
        self.assertEqual(evidence[0]["status"], "applied")
        self.assertEqual(evidence[0]["applications"][0]["exercise_name"], "جلو بازو دمبل")

    def test_generic_recipe_builds_three_exercise_group_with_individual_reps(self):
        recipe = {
            "version": 1,
            "target": "all",
            "grouping": {
                "size": 3,
                "mode": "same_muscle",
                "allow_compound": True,
                "max_groups_per_session": 2,
                "rest_between_seconds": 0,
                "rest_after_seconds": 120,
                "exercise_prescriptions": [
                    {"sets": 1, "reps": "۵"},
                    {"sets": 1, "reps": "۱۰"},
                    {"sets": 1, "reps": "۲۰"},
                ],
            },
            "steps": [
                {"op": "instruction", "title": "توالی", "text": "سه حرکت را به‌ترتیب اجرا کن."}
            ],
        }
        self.client.post(
            "/api/v1/training-techniques/",
            {"key": "custom-tri-set", "name": "تری‌ست شخصی", "recipe": recipe},
            format="json",
            **auth_header(self.tokens),
        )
        source = [
            {
                "id": f"exercise-{index}",
                "name": f"حرکت سینه {index}",
                "targetMuscle": "سینه",
                "sets": 3,
                "reps": "۸ تا ۱۲",
                "notes": "",
                "supersetGroupId": None,
                "techniques": [],
            }
            for index in range(1, 7)
        ]
        days, evidence, _ = apply_structured_techniques(
            [{"id": "day-1", "exercises": source}],
            self.coach,
            "intermediate",
            selected_systems=[{"key": "custom-tri-set"}],
        )
        exercises = days[0]["exercises"]
        self.assertEqual(
            [exercise["reps"] for exercise in exercises], ["۵", "۱۰", "۲۰", "۵", "۱۰", "۲۰"]
        )
        self.assertEqual(len({exercise["trainingGroupId"] for exercise in exercises}), 2)
        self.assertTrue(all(exercise["trainingGroupSize"] == 3 for exercise in exercises))
        self.assertEqual(evidence[0]["applied_count"], 2)

    def test_grouped_last_set_recipe_does_not_overwrite_full_exercise_prescription(self):
        recipe = {
            "version": 1,
            "target": "last_set",
            "grouping": {
                "size": 2,
                "mode": "same_muscle",
                "allow_compound": True,
                "max_groups_per_session": 1,
                "rest_between_seconds": 0,
                "rest_after_seconds": 90,
                "exercise_prescriptions": [
                    {"sets": 1, "reps": "۵"},
                    {"sets": 1, "reps": "۱۰"},
                ],
            },
            "steps": [{"op": "partial_range", "mode": "after_failure", "count": 2}],
        }
        self.client.post(
            "/api/v1/training-techniques/",
            {"key": "last-set-group", "name": "ست پایانی گروه", "recipe": recipe},
            format="json",
            **auth_header(self.tokens),
        )
        source = [
            {
                "id": f"exercise-{index}",
                "name": f"حرکت سینه {index}",
                "targetMuscle": "سینه",
                "sets": 3,
                "reps": "۸ تا ۱۲",
                "notes": "",
                "supersetGroupId": None,
                "techniques": [],
            }
            for index in range(1, 3)
        ]
        days, evidence, _ = apply_structured_techniques(
            [{"id": "day-1", "exercises": source}],
            self.coach,
            "intermediate",
            selected_systems=[{"key": "last-set-group"}],
        )
        for exercise in days[0]["exercises"]:
            self.assertEqual(exercise["sets"], 3)
            self.assertEqual(exercise["reps"], "۸ تا ۱۲")
            self.assertIn("فقط در ست پایانی", exercise["notes"])
        self.assertEqual(evidence[0]["applied_count"], 1)

    def test_partial_rep_modes_are_opt_in_and_preserve_normal_exercise_selection(self):
        from accounts.models import TrainingTechnique

        self.assertTrue(
            TrainingTechnique.objects.filter(key="partial_reps", is_active=True).exists()
        )
        baseline = [
            {
                "id": "day-1",
                "notes": "فرم صحیح اولویت دارد.",
                "exercises": [
                    {
                        "id": f"exercise-{index}",
                        "name": f"حرکت {index}",
                        "targetMuscle": "سینه",
                        "sets": 3,
                        "reps": "۸ تا ۱۲",
                        "raw_prescription": "۳×۱۰",
                        "notes": "",
                        "supersetGroupId": None,
                        "techniques": [],
                    }
                    for index in range(1, 5)
                ],
            }
        ]

        normal_days, normal_evidence, _ = apply_structured_techniques(
            copy.deepcopy(baseline), self.coach, "intermediate", selected_systems=[]
        )
        self.assertEqual(normal_days, baseline)
        self.assertEqual(normal_evidence, [])

        for variant in ("one_and_half", "after_failure", "partial_only"):
            days, evidence, _ = apply_structured_techniques(
                copy.deepcopy(baseline),
                self.coach,
                "intermediate",
                selected_systems=[{"key": "partial_reps", "variants": [variant]}],
            )
            exercises = days[0]["exercises"]
            self.assertEqual(
                [item["name"] for item in exercises],
                [item["name"] for item in baseline[0]["exercises"]],
            )
            selected = [item for item in exercises if item.get("partialReps")]
            self.assertEqual(len(selected), 2)
            self.assertEqual({item["partialReps"]["variant"] for item in selected}, {variant})
            self.assertTrue(all("تکرار نیمه" in item["notes"] for item in selected))
            self.assertEqual(evidence[0]["status"], "applied")
            self.assertEqual(evidence[0]["applications"][0]["variant"], variant)

    def test_selected_manual_system_is_added_as_a_coach_review_note(self):
        custom = self.client.post(
            "/api/v1/training-techniques/",
            {
                "key": "coach-system-rest-pause",
                "name": "استراحت-مکث مربی",
                "description": "استراحت کوتاه میان تکرارها.",
                "execution_method": "پس از هر بخش، ۱۵ ثانیه استراحت و ادامه تا فرم صحیح.",
                "enabled": True,
            },
            format="json",
            **auth_header(self.tokens),
        )
        self.assertEqual(custom.status_code, 201, custom.content)

        days, evidence, _ = apply_structured_techniques(
            [{"id": "day-1", "notes": "فرم صحیح اولویت دارد.", "exercises": []}],
            self.coach,
            "intermediate",
            selected_systems=[{"key": "coach-system-rest-pause"}],
        )
        self.assertIn("استراحت-مکث مربی", days[0]["notes"])
        self.assertIn("بازبینی مربی", days[0]["notes"])
        self.assertEqual(evidence[0]["status"], "coach_review_required")
