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
        self.assertEqual(created.data["levels"], ["intermediate", "advanced"])
        exercise_id = created.data["id"]

        filtered = self.client.get(
            "/api/v1/exercises/?region=upper_chest&level=intermediate&equipment=dumbbell",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual([row["id"] for row in filtered.data["results"]], [exercise_id])

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

    def test_technique_override_private_isolation_and_handler_status(self):
        public = self.client.get("/api/v1/training-techniques/", **auth_header(self.tokens_a))
        self.assertEqual(public.status_code, 200)
        self.assertIn("superset", {row["key"] for row in public.data})
        self.assertIn("drop_set", {row["key"] for row in public.data})

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

        coach_b_rows = self.client.get(
            "/api/v1/training-techniques/", **auth_header(self.tokens_b)
        )
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
            "targets": [
                {"muscle_key": "chest", "region_key": "upper_chest", "role": "primary"}
            ],
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
        names = {exercise["name"] for exercise in chest["exercises"] if exercise["targetMuscle"] == "سینه"}
        self.assertEqual(len(names), 2)
        self.assertTrue(names.intersection({"پرس بالاسینه دمبل A", "پرس بالاسینه دمبل B"}))
        self.assertNotIn(prohibited["name"], names)
        evidence = document["generator"]["evidence"]
        self.assertTrue(evidence["structured_catalog_selected"])
        self.assertTrue(any(item["reason"] == "coach_prohibited" for item in evidence["structured_catalog_excluded"]))

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
