"""Frozen 3/4-day, 75-minute contracts against the sanitized Stage catalog.

No athlete identities, credentials, media URLs or live writes are used here.
The rubric is an engineering acceptance gate, not a clinical quality score.
"""

import json
import tempfile
from collections import Counter
from copy import deepcopy
from datetime import date
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.exercise_metadata import MUSCLE_NAMES, movement_role
from accounts.generation_policy import validate_policy
from accounts.models import (
    CoachProfile,
    CoachRuleSet,
    CoachTechnique,
    EquipmentTaxonomy,
    Exercise,
    ExerciseEquipment,
    ExerciseMuscleTarget,
    ExerciseSuitableLevel,
    MuscleRegion,
    MuscleTaxonomy,
    ProgramTemplate,
    TrainingTechnique,
)
from delivery.services.artifacts import create_and_render
from programming.services.execution import compile_execution
from programming.services.generator import _build_training
from programming.services.preparation import prepare_from_visit
from programming.services.program_requests import create_request, start_request
from programming.services.programs import activate_version, finalize_version
from programming.services.techniques import _apply_recipe
from programming.services.training_selection import _pick_for_roles, _prescribe
from programming.services.volume_planning import (
    allocate_volume,
    audit_volume,
    build_volume_plan,
    refresh_volume_audit,
    session_seconds,
)
from students.models import Student, StudentProfile
from students.services import create_visit
from students.visit_form_models import CoachVisitFormTemplate
from students.visit_form_services import finalize_visit

UPPER = ["سینه", "زیربغل", "سرشانه", "جلو بازو", "پشت بازو"]
LOWER = ["پا", "شکم"]
SCENARIOS = [
    {
        "key": "chest",
        "days": 3,
        "level": "intermediate",
        "goal": "hypertrophy",
        "decisions": {"chest": "focus", "glutes": "balanced"},
        "weak": ["glutes"],
    },
    {
        "key": "lower",
        "days": 4,
        "level": "advanced",
        "goal": "hypertrophy",
        "decisions": {"glutes": "focus", "hamstrings": "focus", "chest": "maintenance"},
        "weak": ["chest"],
        "split": [UPPER, LOWER, UPPER, LOWER],
    },
    {
        "key": "home",
        "days": 3,
        "level": "beginner",
        "goal": "fat_loss",
        "equipment": ["dumbbell"],
        "policy": {"rest_seconds": 75, "rir": 3},
        "variety": "stable",
    },
    {
        "key": "strength",
        "days": 4,
        "level": "advanced",
        "goal": "strength",
        "split": [UPPER, LOWER, UPPER, LOWER],
        "variety": "stable",
    },
    {
        "key": "knee",
        "days": 3,
        "level": "intermediate",
        "goal": "hypertrophy",
        "injuries": ["knee"],
        "decisions": {"quadriceps": "maintenance", "chest": "focus"},
        "policy": {
            "movement_restrictions": [
                {
                    "injury_key": "knee",
                    "joint_keys": ["knee"],
                    "movement_patterns": ["knee_dominant"],
                }
            ]
        },
    },
    {
        "key": "systems",
        "days": 4,
        "level": "advanced",
        "goal": "hypertrophy",
        "decisions": {"shoulders": "focus", "glutes": "maintenance"},
        "split": [UPPER, LOWER, UPPER, LOWER],
        "policy": {"rest_seconds": 60, "rir": 1},
        "systems": [
            {"key": "superset", "muscles": ["جلو بازو", "پشت بازو"]},
            {"key": "drop_set", "muscles": ["سرشانه"]},
        ],
    },
]


def exercise(key, sets=3, **extra):
    return {
        "id": key,
        "exercise_id": key,
        "name": key,
        "sets": sets,
        "reps": "8-12",
        "rest": "90 ثانیه",
        "exercise_snapshot": {"primary_muscle_key": key},
        **extra,
    }


class ExecutionContractTests(SimpleTestCase):
    def test_full_session_rebalances_extras_to_meet_all_minimums(self):
        policy = validate_policy({})
        plan = build_volume_plan(policy, "intermediate", "hypertrophy")
        keys = ["quadriceps", "hamstrings", "shoulders"]
        plan["required_muscles"] = keys
        day = {
            "id": "lower",
            "exercises": [
                exercise(key, id=f"{key}-{index}")
                for key in keys
                for index in range(2 if key != "shoulders" else 3)
            ],
        }
        student = SimpleNamespace(training_conditions={"session_duration_minutes": 60})
        allocate_volume([day], plan, policy, student, [])
        audit, _ = audit_volume([day], plan, policy, student)
        for key in keys:
            self.assertGreaterEqual(audit["direct_sets"][key], plan["muscles"][key]["minimum"])
        self.assertLessEqual(day["estimatedMinutes"], 60)

    def test_precise_split_muscles_do_not_expand_to_all_legs(self):
        from programming.services.split_parser import parse_split_day

        self.assertEqual(
            parse_split_day("چهارسر ران و پشت پا و سرشانه"), ["چهارسر ران", "پشت پا", "سرشانه"]
        )
        self.assertEqual(parse_split_day("باسن و پشت پا"), ["باسن", "پشت پا"])
        self.assertEqual(parse_split_day("پا و سرشانه"), ["پا", "سرشانه"])

    def test_unequal_group_has_explicit_solo_remainder_and_exact_duration(self):
        a, b = exercise("biceps", 2), exercise("triceps", 4)
        for item in (a, b):
            item.update(
                supersetGroupId="pair", supersetRestBetweenSeconds=0, supersetRestAfterSeconds=60
            )
        days = [{"id": "one", "exercises": [a, b]}]
        compile_execution(days)
        self.assertEqual(a["executionPlan"]["pairedRounds"], 2)
        self.assertEqual(b["executionPlan"]["soloSets"], 2)
        self.assertEqual([row["restSeconds"] for row in a["executionPlan"]["sets"]], [0, 0])
        self.assertEqual(
            [row["restSeconds"] for row in b["executionPlan"]["sets"]], [60, 60, 90, 90]
        )
        self.assertEqual(
            session_seconds(days[0], validate_policy({})), 300 + 6 * 36 + 90 + 120 + 180
        )

    def test_missing_required_muscle_cannot_disappear_from_audit(self):
        policy = validate_policy({})
        plan = build_volume_plan(policy, "intermediate", "hypertrophy")
        plan["required_muscles"] = ["hamstrings"]
        audit, warnings = audit_volume([], plan, policy, SimpleNamespace(training_conditions={}))
        self.assertEqual(audit["muscles"]["hamstrings"]["actual"], 0)
        self.assertTrue(
            any(row.startswith("volume_required_shortfall:hamstrings") for row in warnings)
        )

    def test_maintenance_is_not_a_growth_failure(self):
        policy = validate_policy({})
        plan = build_volume_plan(policy, "advanced", "hypertrophy", {"chest": "maintenance"})
        _, warnings = audit_volume(
            [{"id": "one", "exercises": [exercise("chest", 4)]}],
            plan,
            policy,
            SimpleNamespace(training_conditions={}),
        )
        self.assertNotIn("volume_below_growth_start:chest", warnings)

    def test_strength_main_accessory_and_timed_prescriptions_are_distinct(self):
        common = dict(
            name="display",
            muscle="",
            level="advanced",
            sets=3,
            template=None,
            exercise_index=0,
            historical_raw=None,
            policy=validate_policy({}),
            goal="strength",
        )
        main = _prescribe(
            **common,
            metadata={
                "movement_pattern": "hip_hinge",
                "mechanics": "multi_joint",
                "equipment_keys": ["dumbbell"],
            },
        )
        accessory = _prescribe(
            **common,
            metadata={"movement_pattern": "shoulder_abduction", "mechanics": "single_joint"},
        )
        timed = _prescribe(
            **common,
            metadata={"movement_pattern": "trunk_stability", "prescription_unit": "seconds"},
        )
        self.assertEqual((main["reps"], main["rest"]), ("3-6", "180 ثانیه"))
        self.assertEqual((accessory["reps"], accessory["rest"]), ("8-12", "90 ثانیه"))
        self.assertEqual(timed["reps"], "30 ثانیه")
        self.assertIn("زمان نگه‌داری", timed["progression_hint"])
        band = _prescribe(
            **{**common, "goal": "hypertrophy"},
            metadata={"movement_pattern": "elbow_flexion", "equipment_keys": ["resistance_band"]},
        )
        self.assertIn("کش", band["progression_hint"])

    def test_strength_prescription_uses_movement_role_not_equipment_for_rep_range(self):
        common = dict(
            name="display",
            muscle="",
            level="beginner",
            sets=3,
            template=None,
            exercise_index=0,
            historical_raw=None,
            policy=validate_policy({}),
            goal="strength",
        )
        for equipment in ("bodyweight", "resistance_band"):
            with self.subTest(equipment=equipment):
                result = _prescribe(
                    **common,
                    metadata={
                        "movement_pattern": "knee_dominant",
                        "mechanics": "multi_joint",
                        "equipment_keys": [equipment],
                    },
                )
                self.assertEqual((result["reps"], result["rest"]), ("3-6", "180 ثانیه"))

    def test_strength_selection_covers_lateral_and_rear_delts_before_press_anchor(self):
        candidates = ["shoulder-press", "lateral-raise", "rear-fly"]
        metadata = {
            "shoulder-press": {
                "primary_muscle_key": "shoulders",
                "movement_pattern": "push_vertical",
                "mechanics": "multi_joint",
                "equipment_keys": ["dumbbell"],
            },
            "lateral-raise": {
                "primary_muscle_key": "shoulders",
                "movement_pattern": "shoulder_abduction",
                "mechanics": "single_joint",
                "equipment_keys": ["dumbbell"],
            },
            "rear-fly": {
                "primary_muscle_key": "shoulders",
                "movement_pattern": "shoulder_horizontal_abduction",
                "mechanics": "single_joint",
                "equipment_keys": ["dumbbell"],
            },
        }

        selected = _pick_for_roles(
            candidates,
            ["muscle:shoulders"] * 3,
            "سرشانه",
            preferred_names=set(),
            historical_map={},
            metadata_by_name=metadata,
            weekly_roles=Counter(),
            goal="strength",
        )

        self.assertEqual(
            [movement_role(metadata[name]) for name in selected],
            ["lateral", "rear_delt", "shoulder_press"],
        )

    def test_strength_selection_does_not_filter_compounds_by_loadability(self):
        selected = _pick_for_roles(
            ["a-bodyweight-squat", "z-barbell-squat"],
            ["knee_dominant"],
            "چهارسر ران",
            preferred_names=set(),
            historical_map={},
            metadata_by_name={
                "a-bodyweight-squat": {
                    "movement_pattern": "knee_dominant",
                    "mechanics": "multi_joint",
                    "equipment_keys": ["bodyweight"],
                },
                "z-barbell-squat": {
                    "movement_pattern": "knee_dominant",
                    "mechanics": "multi_joint",
                    "equipment_keys": ["barbell"],
                },
            },
            goal="strength",
        )

        self.assertEqual(selected, ["a-bodyweight-squat"])

    def test_strength_5x5_never_falls_back_to_bodyweight_compound(self):
        recipe = {
            "version": 1,
            "target": "first_compound",
            "steps": [
                {
                    "op": "prescribe",
                    "sets": 5,
                    "reps": "5",
                    "rest_seconds": 180,
                    "rpe": "RIR 2",
                }
            ],
        }
        config = SimpleNamespace(
            id=None,
            key="strength_5x5",
            name="قدرتی ۵×۵",
            recipe=recipe,
            base_technique=SimpleNamespace(key="strength_5x5", handler_key="recipe", recipe=recipe),
            parameters={},
            max_per_session=0,
            execution_method="",
        )
        bodyweight = {
            "id": "bodyweight-squat",
            "name": "اسکوات وزن بدن",
            "sets": 3,
            "reps": "8-12",
            "rest": "90 ثانیه",
            "rpe": "RIR 3",
            "exercise_snapshot": {
                "mechanics": "multi_joint",
                "prescription_unit": "reps",
                "equipment_keys": ["bodyweight"],
            },
            "techniques": [],
        }
        weighted = {
            **bodyweight,
            "id": "weighted-squat",
            "name": "اسکوات دمبل",
            "techniques": [],
            "exercise_snapshot": {
                **bodyweight["exercise_snapshot"],
                "equipment_keys": ["dumbbell"],
            },
        }

        count, applications = _apply_recipe(
            [{"id": "day-1", "exercises": [bodyweight, weighted]}], config
        )

        self.assertEqual(count, 1)
        self.assertEqual([item["exercise_name"] for item in applications], ["اسکوات دمبل"])
        self.assertEqual(bodyweight["techniques"], [])
        self.assertEqual(weighted["sets"], 5)

    def test_incomplete_draft_can_be_saved_but_not_published(self):
        policy = validate_policy({})
        plan = build_volume_plan(policy, "intermediate", "hypertrophy")
        plan["required_muscles"] = ["back"]
        training = {
            "planning_version": 3,
            "days": [],
            "eligible_exercise_ids": [],
            "volume_plan": plan,
            "volume_policy": policy,
        }
        refresh_volume_audit(training)
        with self.assertRaises(ValidationError):
            refresh_volume_audit(training, require_complete=True)


@override_settings(
    SMS_BACKEND="mock", PROGRAM_READY_SMS_ENABLED=True, VISIT_FINALIZED_SMS_ENABLED=True
)
class PlanningMatrixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user = get_user_model().objects.create_user(username="planning-matrix-coach")
        cls.coach = CoachProfile.objects.create(
            user=user, display_name="Matrix", default_session_minutes=75
        )
        fixture = json.loads(
            (Path(__file__).parent / "fixtures/reviewed_catalog_20261028.json").read_text()
        )
        for row in fixture:
            ex = Exercise.objects.create(
                coach=cls.coach,
                name=row["name"],
                primary_muscle=MUSCLE_NAMES[row["primary_muscle_key"]],
                movement_pattern=row["movement_pattern"],
                mechanics=row["mechanics"],
                joint_keys=row["joint_keys"],
                prescription_unit=row["prescription_unit"],
                level="all",
            )
            for target in row["targets"]:
                muscle, _ = MuscleTaxonomy.objects.get_or_create(
                    key=target["muscle_key"],
                    defaults={"name": MUSCLE_NAMES.get(target["muscle_key"], target["muscle_key"])},
                )
                region = None
                if target["region_key"]:
                    region, _ = MuscleRegion.objects.get_or_create(
                        muscle=muscle,
                        key=target["region_key"],
                        defaults={"name": target["region_key"]},
                    )
                ExerciseMuscleTarget.objects.create(
                    exercise=ex, muscle=muscle, region=region, role=target["role"]
                )
            for key in row["equipment_keys"]:
                equipment, _ = EquipmentTaxonomy.objects.get_or_create(
                    key=key,
                    defaults={
                        "name": {
                            "bodyweight": "وزن بدن",
                            "dumbbell": "دمبل",
                            "barbell": "هالتر",
                            "cable": "کابل",
                            "machine": "دستگاه",
                            "smith_machine": "اسمیت",
                            "kettlebell": "کتل بل",
                            "resistance_band": "کش",
                        }.get(key, key)
                    },
                )
                ExerciseEquipment.objects.create(exercise=ex, equipment=equipment)
            for level in row["levels"]:
                ExerciseSuitableLevel.objects.create(exercise=ex, level=level)
        import_module("accounts.migrations.0027_review_catalog_dependencies").review_catalog(
            apps, SimpleNamespace(connection=connection)
        )
        base = TrainingTechnique.objects.get(key="superset")
        recipe = deepcopy(base.recipe)
        recipe["grouping"]["mode"] = "antagonist"
        CoachTechnique.objects.create(
            coach=cls.coach,
            base_technique=base,
            key="superset",
            name="Antagonist arms",
            recipe=recipe,
            allowed_levels=["advanced"],
            max_per_session=1,
        )
        options = {
            "goal": ["hypertrophy", "fat_loss", "strength"],
            "training_level": ["beginner", "intermediate", "advanced"],
            "equipment_available": ["full_gym", "dumbbell"],
            "weak_muscles": ["chest", "glutes"],
            "injuries": ["knee"],
        }
        fields = [
            {
                "key": key,
                "semantic_key": key,
                "label": key,
                "type": "multi_select"
                if key in {"equipment_available", "weak_muscles", "injuries"}
                else "single_select",
                "enabled": True,
                "required": False,
                "coach_editable": True,
                "options": [{"value": value, "label": value} for value in values],
            }
            for key, values in options.items()
        ]
        for key in ("sessions_per_week", "session_duration_minutes"):
            fields.append(
                {
                    "key": key,
                    "semantic_key": key,
                    "label": key,
                    "type": "number",
                    "enabled": True,
                    "coach_editable": True,
                }
            )
        cls.form = CoachVisitFormTemplate.objects.create(
            coach=cls.coach,
            key="matrix",
            name="Matrix",
            is_default=True,
            sections=[{"key": "assessment", "label": "Assessment", "fields": fields}],
        )

    def configure(self, case):
        CoachRuleSet.objects.update_or_create(
            coach=self.coach,
            defaults={
                "style_profile": {"generation_rules": validate_policy(case.get("policy", {}))}
            },
        )
        return Student.objects.create(
            coach=self.coach,
            full_name=case["key"],
            phone_number=f"+98999000{SCENARIOS.index(case):04d}",
            age=30,
            gender="male",
            height_cm=175,
            weight_kg=78,
            goals={"primary_goal": case["goal"], "weak_muscles": case.get("weak", [])},
            training_background={"level": case["level"]},
            training_conditions={
                "training_days_per_week": case["days"],
                "session_duration_minutes": 75,
            },
            equipment={"available_equipment": case.get("equipment", ["full_gym"])},
            injuries={
                "has_injury": bool(case.get("injuries")),
                "injury_types": case.get("injuries", []),
            },
        )

    def assert_contract(self, training, case):
        self.assertEqual(len(training["days"]), case["days"])
        self.assertTrue(all(day["estimatedMinutes"] <= 75 for day in training["days"]))
        audit = training["volume_audit"]
        self.assertTrue(
            all(row["actual"] >= row["minimum"] for row in audit["muscles"].values()),
            audit["muscles"],
        )
        roles = Counter(
            movement_role(item["exercise_snapshot"])
            for day in training["days"]
            for item in day["exercises"]
        )
        self.assertGreater(roles["lateral"], 0)
        # The frozen catalog marks its dumbbell rear-delt movements intermediate+.
        # Never bypass that coach-authored level restriction to improve a score.
        if case["key"] != "home":
            self.assertGreater(roles["rear_delt"], 0)
        self.assertGreater(roles["hinge"] + roles["knee_curl"], 0)
        self.assertIn("core", audit["direct_sets"])
        for day in training["days"]:
            for item in day["exercises"]:
                if case["key"] == "knee":
                    self.assertNotEqual(
                        item["exercise_snapshot"]["movement_pattern"], "knee_dominant"
                    )
                if case["key"] == "home":
                    self.assertTrue(
                        set(item["exercise_snapshot"]["equipment_keys"])
                        <= {"dumbbell", "bodyweight"}
                    )
                if (
                    case["key"] == "strength"
                    and item["exercise_snapshot"]["mechanics"] == "single_joint"
                ):
                    self.assertEqual(item["reps"], "8-12")
                self.assertEqual(len(item["executionPlan"]["sets"]), item["sets"])

    def test_sixty_deterministic_generations(self):
        for case in SCENARIOS:
            student = self.configure(case)
            template = ProgramTemplate(
                coach=self.coach,
                name="Matrix",
                level=case["level"],
                days_per_week=case["days"],
                split=case.get("split", ["فول بادی"] * case["days"]),
            )
            for seed in range(10):
                with self.subTest(scenario=case["key"], seed=seed):
                    training, warnings, _ = _build_training(
                        coach=self.coach,
                        student=student,
                        template=template,
                        level=case["level"],
                        days_per_week=case["days"],
                        apply_level=True,
                        apply_muscle=True,
                        apply_catalog=True,
                        apply_general=True,
                        apply_injury=True,
                        catalog_only=True,
                        muscle_decisions=case.get("decisions", {}),
                        goals_override="",
                        selected_training_systems=case.get("systems", []),
                        selection_seed=f"matrix-{seed}",
                        exercise_variety=case.get("variety", "varied"),
                    )
                    self.assert_contract(training, case)
                    if case["key"] == "home":
                        self.assertIn("movement_coverage_missing:shoulders:rear_delt", warnings)
                    refresh_volume_audit(training, require_complete=True)

    @patch(
        "common.sms.http.client.HTTPSConnection", side_effect=AssertionError("SMS forbidden in QA")
    )
    def test_six_request_visit_pdf_student_lifecycles_without_sms(self, transport):
        with (
            tempfile.TemporaryDirectory(prefix="athlore-matrix-") as media,
            override_settings(MEDIA_ROOT=media),
        ):
            for case in SCENARIOS:
                with self.subTest(scenario=case["key"]):
                    student = self.configure(case)
                    user = get_user_model().objects.create_user(username=f"matrix-{case['key']}")
                    StudentProfile.objects.create(student=student, user=user, portal_enabled=True)
                    request, _ = create_request(
                        student=student,
                        actor=user,
                        data={
                            "sections": ["workout"],
                            "sessions_per_week": case["days"],
                            "session_duration_minutes": 75,
                        },
                    )
                    with self.captureOnCommitCallbacks(execute=True):
                        visit = create_visit(
                            self.coach,
                            student,
                            {
                                "visit_date": date(2026, 10, 28),
                                "current_weight_kg": 78,
                                "previous_weight_kg": 78,
                                "form_template_id": str(self.form.pk),
                                "answers": {
                                    "goal": case["goal"],
                                    "training_level": case["level"],
                                    "sessions_per_week": case["days"],
                                    "session_duration_minutes": 75,
                                    "equipment_available": case.get("equipment", ["full_gym"]),
                                    "weak_muscles": case.get("weak", []),
                                    "injuries": case.get("injuries", []),
                                },
                                "program_settings": {
                                    "sections": ["workout"],
                                    "training_systems": case.get("systems", []),
                                    "muscle_decisions": case.get("decisions", {}),
                                    "session_muscles": case.get(
                                        "split", [[] for _ in range(case["days"])]
                                    ),
                                    "duration_weeks": 4,
                                    "exercise_variety": case.get("variety", "varied"),
                                },
                            },
                            actor=self.coach.user,
                        )
                        start_request(
                            request=request, visit_id=visit.pk, assessment_mode="in_person"
                        )
                        finalize_visit(visit, actor=self.coach.user)
                        program, run = prepare_from_visit(
                            self.coach, self.coach.user, visit.pk, f"matrix-{case['key']}"
                        )
                        self.assert_contract(run.resulting_version.training, case)
                        version = finalize_version(run.resulting_version, actor=self.coach.user)
                        artifact = create_and_render(
                            self.coach,
                            program,
                            version_id=version.pk,
                            user=self.coach.user,
                            section="workout",
                        )
                        self.assertEqual(artifact.status, "ready")
                        activate_version(program, version.pk)
                    client = APIClient()
                    client.force_authenticate(user)
                    self.assertEqual(
                        client.get(f"/api/v1/me/programs/{program.pk}/").status_code, 200
                    )
                    response = client.get(f"/api/v1/me/pdf-files/{artifact.pk}/download/")
                    self.assertEqual(response.status_code, 200)
                    content = b"".join(response.streaming_content)
                    self.assertTrue(content.startswith(b"%PDF"))
                    request.refresh_from_db()
                    self.assertEqual(request.status, "fulfilled")
        transport.assert_not_called()
