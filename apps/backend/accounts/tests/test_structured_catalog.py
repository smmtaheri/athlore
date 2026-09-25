from __future__ import annotations

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
                            "name": "پرس بالاسینه دمبل",
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
