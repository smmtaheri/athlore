from copy import deepcopy
from types import SimpleNamespace

from django.test import override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from accounts.models import CoachProfile, Exercise, ProgramTemplate
from accounts.rules_services import ensure_rule_set
from common.testing import auth_header, register
from delivery.services.render import build_pdf_context
from programming.services.generator import generate_document
from students.models import Student


@override_settings(PUBLIC_REGISTRATION_ENABLED=True, SMS_BACKEND="mock")
class TemplateExecutionTests(APITestCase):
    def setUp(self):
        response = register(self.client, "template-plans@example.com")
        self.headers = auth_header(response.data["tokens"])
        self.coach = CoachProfile.objects.get(user_id=response.data["user"]["id"])
        self.student = Student.objects.create(
            coach=self.coach,
            full_name="Test athlete",
            age=25,
            gender="male",
            height_cm=180,
            weight_kg=80,
            equipment={"has_full_gym": True},
        )
        self.ids = []
        for name in ("پرس سینه دستگاه", "فلای دستگاه"):
            created = self.client.post(
                "/api/v1/exercises/",
                {
                    "name": name,
                    "targets": [{"muscle_key": "chest", "role": "primary"}],
                    "levels": ["intermediate"],
                    "equipment_keys": ["machine"],
                    "movement_pattern": "push_horizontal"
                    if name.startswith("پرس")
                    else "shoulder_adduction",
                    "mechanics": "multi_joint" if name.startswith("پرس") else "single_joint",
                    "joint_keys": ["shoulder", "elbow"] if name.startswith("پرس") else ["shoulder"],
                    "prescription_unit": "reps",
                },
                format="json",
                **self.headers,
            )
            self.assertEqual(created.status_code, 201, created.data)
            self.ids.append(created.data["id"])
        self.plan = {
            "version": 1,
            "description": "Notes only",
            "defaults": {"sets": 3, "minimum": 8, "maximum": 12, "rest_seconds": 90, "rir": 2},
            "days": [{"muscles": ["chest"], "blocks": [self.block()]}],
        }

    def slot(self, index=None, **changes):
        return {
            "muscle_key": "chest",
            "exercise_id": self.ids[index] if index is not None else None,
            "unit": "reps",
            "minimum": 10,
            "maximum": 10,
            "reps_source": "custom",
            **changes,
        }

    def block(self, system=None, **changes):
        return {
            "system_key": system,
            "sets": None,
            "rest_seconds": None,
            "between_seconds": None,
            "slots": [self.slot(0)],
            **changes,
        }

    def template(self, plan=None):
        return ProgramTemplate.objects.create(
            coach=self.coach,
            rule_set=ensure_rule_set(self.coach),
            name="Executable template",
            level="intermediate",
            days_per_week=1,
            split=["سینه"],
            execution_plan=plan or self.plan,
        )

    def generate(self, plan=None):
        return generate_document(
            coach=self.coach,
            student=self.student,
            visit=None,
            template=self.template(plan),
            request={"program_type": "workout", "level": "intermediate"},
        )[0]

    def save_plan(self, plan):
        return self.client.post(
            "/api/v1/program-templates/",
            {
                "name": "Typed plan",
                "level": "intermediate",
                "days_per_week": 1,
                "execution_plan": plan,
            },
            format="json",
            **self.headers,
        )

    def test_save_round_trip_and_real_numeric_execution(self):
        self.plan["days"][0]["blocks"][0].update(sets=5, rest_seconds=135)
        saved = self.save_plan(self.plan)
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data["execution_plan"], self.plan)
        self.assertEqual(saved.data["split"], ["سینه"])
        exercise = self.generate()["training"]["days"][0]["exercises"][0]
        self.assertEqual(
            (exercise["sets"], exercise["reps"], exercise["rest"]), (5, "10", "135 ثانیه")
        )
        self.assertEqual(exercise["prescription"]["raw_prescription"], "5×10")
        self.assertEqual(exercise["rpe"], "RIR 2")

    def test_default_reps_and_timed_sets_are_executable(self):
        blocks = self.plan["days"][0]["blocks"]
        blocks[0]["slots"][0]["reps_source"] = "default"
        blocks.append(self.block(slots=[self.slot(1, unit="seconds", minimum=45, maximum=45)]))
        first, timed = self.generate()["training"]["days"][0]["exercises"]
        self.assertEqual(first["reps"], "8–12")
        self.assertEqual(timed["reps"], "45 ثانیه")

    def test_system_and_block_override_preserve_canonical_values_and_pdf_groups(self):
        block = self.block(
            "superset",
            sets=4,
            rest_seconds=120,
            between_seconds=15,
            slots=[self.slot(0), self.slot(1, minimum=12, maximum=15)],
        )
        # Public superset defaults to isolation-only; use the public same-muscle recipe.
        from accounts.models import CoachTechnique, TrainingTechnique

        base = TrainingTechnique.objects.get(key="superset")
        recipe = deepcopy(base.recipe)
        recipe["steps"].insert(0, {"op": "prescribe", "sets": 3, "reps": "8"})
        CoachTechnique.objects.create(
            coach=self.coach,
            base_technique=base,
            key="superset",
            name="Pair",
            enabled=True,
            parameters={"pairing_mode": "same_muscle", "allow_compound": True},
            recipe=recipe,
        )
        self.plan["days"][0]["blocks"] = [block, deepcopy(block)]
        document = self.generate()
        exercises = document["training"]["days"][0]["exercises"]
        self.assertEqual(len(exercises), 4)
        self.assertEqual(exercises[0]["sets"], 4)
        self.assertEqual(exercises[1]["reps"], "12–15")
        self.assertNotEqual(exercises[0]["supersetGroupId"], exercises[2]["supersetGroupId"])
        for exercise in exercises:
            self.assertEqual(exercise["sets"], exercise["prescription"]["sets"])
            self.assertEqual(exercise["reps"], exercise["prescription"]["reps_text"])
            self.assertEqual(exercise["supersetRestBetweenSeconds"], 15)
        context = build_pdf_context(
            artifact=SimpleNamespace(),
            program=SimpleNamespace(title="Test", program_type="workout", date_range_label=""),
            version=SimpleNamespace(
                training=document["training"],
                nutrition=None,
                supplements=None,
                pdf_settings={},
                version_number=1,
            ),
            student=self.student,
            coach=self.coach,
        )
        self.assertTrue(context["days"][0]["exercises"][1]["supersetWithPrevious"])
        self.assertEqual(context["days"][0]["exercises"][0]["tempo"], "RIR 2")

    def test_ordered_group_keeps_role_defaults_and_slot_specific_reps(self):
        self.plan["days"][0]["blocks"] = [
            self.block("pre_exhaustion", slots=[self.slot(0), self.slot(1, minimum=15, maximum=15)])
        ]
        exercises = self.generate()["training"]["days"][0]["exercises"]
        self.assertEqual([item["exercise_id"] for item in exercises], [self.ids[1], self.ids[0]])
        self.assertEqual([item["reps"] for item in exercises], ["15", "10"])
        self.assertEqual(exercises[0]["supersetPartnerName"], exercises[1]["name"])
        self.assertEqual(exercises[1]["supersetPartnerName"], exercises[0]["name"])

    def test_isolation_finisher_uses_system_numeric_prescription(self):
        from accounts.models import TrainingTechnique

        systems = list(TrainingTechnique.objects.filter(key__in=["fst_7", "100_reps"]))
        self.assertEqual(len(systems), 2)
        for system in systems:
            self.plan["days"][0]["blocks"] = [
                self.block(system.key, slots=[self.slot(1, reps_source="system")])
            ]
            exercise = self.generate()["training"]["days"][0]["exercises"][0]
            prescribed = next(step for step in system.recipe["steps"] if step["op"] == "prescribe")
            self.assertEqual(exercise["sets"], prescribed["sets"])
            self.assertEqual(exercise["reps"], prescribed["reps"])

    def test_fixed_disallowed_equipment_and_empty_catalog_fail_without_fallback(self):
        self.student.equipment = {
            "has_machines": False,
            "has_dumbbell": False,
            "has_barbell": False,
            "has_cable": False,
        }
        with self.assertRaises(ValidationError):
            self.generate()
        self.student.equipment = {}
        Exercise.objects.filter(coach=self.coach).update(is_active=False)
        with self.assertRaises(ValidationError):
            self.generate()

    def test_auto_selection_repeats_across_days_but_respects_day_slots(self):
        self.plan["days"][0]["blocks"] = [
            self.block(slots=[self.slot()]),
            self.block(slots=[self.slot()]),
        ]
        exercises = self.generate()["training"]["days"][0]["exercises"]
        self.assertEqual(len({ex["exercise_id"] for ex in exercises}), 2)

    def test_fixed_movement_cannot_bypass_student_restriction(self):
        self.student.injuries = {"disallowed_exercises": ["پرس سینه دستگاه"]}
        with self.assertRaises(ValidationError):
            self.generate()
        self.plan["days"][0]["blocks"] = [self.block(slots=[self.slot()])]
        exercises = self.generate()["training"]["days"][0]["exercises"]
        self.assertEqual(exercises[0]["exercise_id"], self.ids[1])

    def test_invalid_text_ranges_references_and_cross_coach_are_rejected(self):
        for mutation in ("text", "negative", "muscle", "system", "owner", "unknown"):
            plan = deepcopy(self.plan)
            block = plan["days"][0]["blocks"][0]
            if mutation == "text":
                plan["defaults"]["sets"] = "زیاد"
            elif mutation == "negative":
                block["rest_seconds"] = -1
            elif mutation == "muscle":
                block["slots"][0]["muscle_key"] = "back"
            elif mutation == "system":
                block["system_key"] = "not-real"
            elif mutation == "owner":
                block["slots"][0]["exercise_id"] = "00000000-0000-0000-0000-000000000001"
            else:
                block["arbitrary_logic"] = "do something"
            with self.subTest(mutation=mutation):
                self.assertEqual(self.save_plan(plan).status_code, 400)

    def test_legacy_template_remains_unchanged_without_execution_plan(self):
        legacy = self.template()
        legacy.execution_plan = {}
        legacy.save()
        response = self.client.patch(
            f"/api/v1/program-templates/{legacy.id}/",
            {"name": "Renamed"},
            format="json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["execution_plan"], {})
