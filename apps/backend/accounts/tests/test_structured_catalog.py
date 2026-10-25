from __future__ import annotations

import copy
from decimal import Decimal
from unittest.mock import patch

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

    def test_editor_rules_omit_unrelated_catalogs(self):
        with (
            patch(
                "accounts.rules_services.get_coach_techniques",
                side_effect=AssertionError("Unrelated system catalog loaded"),
            ),
            patch(
                "accounts.rules_services.serialize_exercise",
                side_effect=AssertionError("Unrelated exercise loaded"),
            ),
            patch(
                "accounts.rules_services.serialize_taxonomy",
                side_effect=AssertionError("Unrelated taxonomy loaded"),
            ),
        ):
            response = self.client.get(
                "/api/v1/coach-rules/?scope=editor", **auth_header(self.tokens_a)
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["exercise_catalog"], [])
            self.assertEqual(response.data["training_techniques"], [])
            saved = self.client.patch(
                "/api/v1/coach-rules/?scope=editor",
                {"general_rules": {"extra_notes": "", "items": []}},
                format="json",
                **auth_header(self.tokens_a),
            )
            self.assertEqual(saved.status_code, 200)

    def test_catalog_server_pagination_and_normalized_search(self):
        ids = []
        for name in ("حرکت اول", "اسکوات تکی"):
            response = self.client.post(
                "/api/v1/exercises/",
                self._exercise_payload(name),
                format="json",
                **auth_header(self.tokens_a),
            )
            self.assertEqual(response.status_code, 201)
            ids.append(response.data["id"])
        first = self.client.get("/api/v1/exercises/?limit=1", **auth_header(self.tokens_a))
        self.assertEqual(first.data["count"], 2)
        self.assertEqual(len(first.data["results"]), 1)
        self.assertIsNotNone(first.data["next"])
        for search in ("اسكوات تكي", "اسکوات‌تکی", "بالا سینه"):
            result = self.client.get(
                "/api/v1/exercises/", {"limit": 1, "search": search}, **auth_header(self.tokens_a)
            )
            self.assertEqual(result.status_code, 200)
            self.assertGreater(result.data["count"], 0)
        other = self.client.get(
            "/api/v1/exercises/?limit=1&search=اسکوات", **auth_header(self.tokens_b)
        )
        self.assertEqual(other.data["count"], 0)

    def test_system_catalog_pagination(self):
        with patch(
            "accounts.rules_services.get_coach_techniques",
            return_value=[{"name": f"System {i}", "key": str(i)} for i in range(25)],
        ):
            response = self.client.get(
                "/api/v1/training-techniques/?limit=20", **auth_header(self.tokens_a)
            )
            self.assertEqual(len(response.data["results"]), 20)
            self.assertEqual(response.data["count"], 25)
            response = self.client.get(
                "/api/v1/training-techniques/?limit=20&search=System%2024",
                **auth_header(self.tokens_a),
            )
            self.assertEqual(response.data["count"], 1)

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

    def test_exercise_catalog_preserves_https_tutorial_source_link(self):
        source_url = "https://example.test/exercises/dumbbell-press"
        created = self.client.post(
            "/api/v1/exercises/",
            {
                **self._exercise_payload("پرس دمبل با منبع"),
                "tutorial_source_url": source_url,
            },
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["tutorial_source_url"], source_url)

        patched = self.client.patch(
            f"/api/v1/exercises/{created.data['id']}/",
            {"tutorial_source_url": "https://example.test/exercises/updated"},
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(
            patched.data["tutorial_source_url"], "https://example.test/exercises/updated"
        )

        invalid = self.client.patch(
            f"/api/v1/exercises/{created.data['id']}/",
            {"tutorial_source_url": "http://example.test/video"},
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(invalid.status_code, 400)

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
                "100_reps",
                "gvt_10x10",
                "antagonist_superset",
            }.issubset({row["key"] for row in public.data})
        )
        self.assertTrue(all(row["recipe"].get("version") == 1 for row in public.data))
        fst = next(row for row in public.data if row["key"] == "fst_7")
        self.assertEqual(fst["name"], "FST-7")
        self.assertNotIn("گاهی", fst["name"])
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

    def test_platform_training_system_edits_are_shared_and_sync_unmodified_override_fields(self):
        coach_a_headers = auth_header(self.tokens_a)
        coach_b_headers = auth_header(self.tokens_b)
        coach_a_catalog = self.client.get("/api/v1/training-techniques/", **coach_a_headers)
        self.assertEqual(coach_a_catalog.status_code, 200)
        base = next(row for row in coach_a_catalog.data if row["key"] == "superset")

        coach_b_override = self.client.post(
            "/api/v1/training-techniques/",
            {
                "key": "superset",
                "name": base["name"],
                "description": base["description"],
                "execution_method": base["execution_method"],
                "base_technique_key": "superset",
                "recipe": base["recipe"],
            },
            format="json",
            **coach_b_headers,
        )
        self.assertEqual(coach_b_override.status_code, 201, coach_b_override.content)

        updated_recipe = {
            **base["recipe"],
            "grouping": {**base["recipe"]["grouping"], "rest_after_seconds": 105},
        }
        shared_edit = self.client.patch(
            "/api/v1/training-techniques/platform/superset/",
            {
                "name": "سوپرست مشترک ویرایش‌شده",
                "description": "تعریف مشترک جدید",
                "execution_method": "روش اجرای مشترک جدید",
                "recipe": updated_recipe,
            },
            format="json",
            **coach_a_headers,
        )
        self.assertEqual(shared_edit.status_code, 200, shared_edit.content)
        self.assertEqual(shared_edit.data["source"], "platform")

        coach_b_catalog = self.client.get("/api/v1/training-techniques/", **coach_b_headers)
        coach_b_system = next(row for row in coach_b_catalog.data if row["key"] == "superset")
        self.assertEqual(coach_b_system["name"], "سوپرست مشترک ویرایش‌شده")
        self.assertEqual(coach_b_system["description"], "تعریف مشترک جدید")
        self.assertEqual(coach_b_system["recipe"]["grouping"]["rest_after_seconds"], 105)

        custom_name = self.client.patch(
            f"/api/v1/training-techniques/{coach_b_system['id']}/",
            {"name": "سوپرست با نام شخصی مربی B"},
            format="json",
            **coach_b_headers,
        )
        self.assertEqual(custom_name.status_code, 200)

        next_recipe = {
            **updated_recipe,
            "grouping": {**updated_recipe["grouping"], "rest_after_seconds": 120},
        }
        second_shared_edit = self.client.patch(
            "/api/v1/training-techniques/platform/superset/",
            {
                "name": "سوپرست نسخهٔ سراسری دوم",
                "description": "تعریف مشترک دوم",
                "recipe": next_recipe,
            },
            format="json",
            **coach_a_headers,
        )
        self.assertEqual(second_shared_edit.status_code, 200, second_shared_edit.content)

        coach_b_catalog = self.client.get("/api/v1/training-techniques/", **coach_b_headers)
        coach_b_system = next(row for row in coach_b_catalog.data if row["key"] == "superset")
        self.assertEqual(coach_b_system["name"], "سوپرست با نام شخصی مربی B")
        self.assertEqual(coach_b_system["description"], "تعریف مشترک دوم")
        self.assertEqual(coach_b_system["recipe"]["grouping"]["rest_after_seconds"], 120)

    def test_platform_training_system_edit_rejects_runtime_handler_changes(self):
        response = self.client.patch(
            "/api/v1/training-techniques/platform/superset/",
            {"handler_key": "recipe"},
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(response.status_code, 400)

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
    def test_system_scopes_limit_recipe_candidates_and_preserve_other_exercises(self):
        from accounts.models import TrainingTechnique

        for key in ("drop_set", "superset", "partial_reps"):
            with self.subTest(key=key):
                days = [
                    {
                        "id": "day-1",
                        "exercises": [
                            {
                                "id": "chest-1",
                                "name": "قفسه سینه دستگاه",
                                "targetMuscle": "سینه",
                                "sets": 3,
                            },
                            {
                                "id": "legs",
                                "name": "جلو پا دستگاه",
                                "targetMuscle": "پا",
                                "sets": 3,
                            },
                            {
                                "id": "chest-2",
                                "name": "کراس اور کابل",
                                "targetMuscle": "سینه",
                                "sets": 3,
                            },
                            {
                                "id": "shoulders",
                                "name": "نشر جانب دمبل",
                                "targetMuscle": "سرشانه",
                                "sets": 3,
                            },
                        ],
                    }
                ]
                self.assertTrue(TrainingTechnique.objects.filter(key=key).exists())
                result, evidence, _ = apply_structured_techniques(
                    days,
                    self.coach,
                    "advanced",
                    selected_systems=[{"key": key, "muscles": ["chest"]}],
                )
                self.assertEqual(evidence[0]["muscles"], ["سینه"])
                self.assertGreater(evidence[0]["applied_count"], 0)
                self.assertEqual(
                    {item["id"] for item in result[0]["exercises"]},
                    {"chest-1", "chest-2", "legs", "shoulders"},
                )
                for exercise in result[0]["exercises"]:
                    if exercise["targetMuscle"] != "سینه":
                        self.assertFalse(exercise.get("techniques"))
                        self.assertFalse(exercise.get("supersetGroupId"))
                if key == "superset":
                    positions = [
                        i
                        for i, item in enumerate(result[0]["exercises"])
                        if item.get("supersetGroupId")
                    ]
                    self.assertEqual(positions[1], positions[0] + 1)

    def test_scoped_system_does_not_fall_back_to_another_muscle(self):
        days, evidence, _ = apply_structured_techniques(
            [{"exercises": [{"name": "جلو پا دستگاه", "targetMuscle": "پا", "sets": 3}]}],
            self.coach,
            "advanced",
            selected_systems=[{"key": "drop_set", "muscles": ["سینه"]}],
        )
        self.assertEqual(evidence[0]["applied_count"], 0)
        self.assertEqual(evidence[0]["status"], "no_eligible_exercise")
        self.assertFalse(days[0]["exercises"][0].get("techniques"))

    def test_legacy_superset_handler_preserves_scope_and_adjacency(self):
        from accounts.models import TrainingTechnique

        TrainingTechnique.objects.filter(key="superset").update(recipe={})
        days, evidence, _ = apply_structured_techniques(
            [
                {
                    "exercises": [
                        {"name": "قفسه سینه دستگاه", "targetMuscle": "سینه", "sets": 3},
                        {"name": "جلو پا دستگاه", "targetMuscle": "پا", "sets": 3},
                        {"name": "کراس اور کابل", "targetMuscle": "سینه", "sets": 3},
                    ]
                }
            ],
            self.coach,
            "advanced",
            selected_systems=[{"key": "superset", "muscles": ["سینه"]}],
        )
        self.assertEqual(evidence[0]["applied_count"], 1)
        self.assertEqual(
            [item["targetMuscle"] for item in days[0]["exercises"]], ["سینه", "سینه", "پا"]
        )
        self.assertFalse(days[0]["exercises"][-1].get("techniques"))

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
            {
                "key": "custom-tempo-system",
                "name": "تمپوی شخصی",
                "execution_method": "در بخش منفی حرکت سه ثانیه کنترل کن.",
                "recipe": recipe,
            },
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
        self.assertIn("در بخش منفی حرکت سه ثانیه کنترل کن.", curl["notes"])
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

    def test_100_reps_system_targets_one_isolation_exercise(self):
        exercise = {
            "id": "biceps-curl",
            "name": "جلو بازو دمبل",
            "targetMuscle": "جلو بازو",
            "sets": 3,
            "reps": "۱۰ تا ۱۲",
            "rest": "۹۰ ثانیه",
            "notes": "",
            "supersetGroupId": None,
            "techniques": [],
        }
        days, evidence, _ = apply_structured_techniques(
            [{"id": "day-1", "exercises": [exercise]}],
            self.coach,
            "intermediate",
            selected_systems=[{"key": "100_reps"}],
        )
        result = days[0]["exercises"][0]
        self.assertEqual(result["sets"], 1)
        self.assertIn("۱۰۰ تکرار تجمیعی", result["reps"])
        self.assertIn("ست‌های کوتاه", result["notes"])
        self.assertEqual(evidence[0]["status"], "applied")

    def test_gvt_10x10_system_prescribes_one_primary_exercise(self):
        exercises = [
            {
                "id": "press",
                "name": "پرس سینه هالتر",
                "targetMuscle": "سینه",
                "sets": 3,
                "reps": "۸ تا ۱۰",
                "notes": "",
                "supersetGroupId": None,
                "techniques": [],
            },
            {
                "id": "fly",
                "name": "قفسه دستگاه",
                "targetMuscle": "سینه",
                "sets": 3,
                "reps": "۱۰ تا ۱۲",
                "notes": "",
                "supersetGroupId": None,
                "techniques": [],
            },
        ]
        days, evidence, _ = apply_structured_techniques(
            [{"id": "day-1", "exercises": exercises}],
            self.coach,
            "intermediate",
            selected_systems=[{"key": "gvt_10x10"}],
        )
        self.assertEqual(days[0]["exercises"][0]["sets"], 3)
        self.assertEqual(days[0]["exercises"][1]["sets"], 10)
        self.assertEqual(days[0]["exercises"][1]["reps"], "۱۰")
        self.assertIn("حجم آلمانی", days[0]["exercises"][1]["notes"])
        self.assertEqual(evidence[0]["status"], "applied")

    def test_antagonist_superset_system_groups_opposing_muscles(self):
        exercises = [
            {
                "id": "press",
                "name": "پرس سینه هالتر",
                "targetMuscle": "سینه",
                "sets": 3,
                "reps": "۸ تا ۱۰",
                "notes": "",
                "supersetGroupId": None,
                "techniques": [],
            },
            {
                "id": "row",
                "name": "قایقی دستگاه",
                "targetMuscle": "زیربغل",
                "sets": 3,
                "reps": "۸ تا ۱۰",
                "notes": "",
                "supersetGroupId": None,
                "techniques": [],
            },
        ]
        days, evidence, _ = apply_structured_techniques(
            [{"id": "day-1", "exercises": exercises}],
            self.coach,
            "intermediate",
            selected_systems=[{"key": "antagonist_superset"}],
        )
        first, second = days[0]["exercises"]
        self.assertEqual(first["supersetGroupId"], second["supersetGroupId"])
        self.assertNotEqual(first["supersetGroupId"], None)
        self.assertIn("عضلات مخالف", first["notes"])
        self.assertEqual(evidence[0]["status"], "applied")

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
