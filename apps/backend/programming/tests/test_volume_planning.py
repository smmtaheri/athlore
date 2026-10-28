"""Canonical catalog -> visit -> generation -> review, with no paid SMS."""

from copy import deepcopy
from datetime import date
from importlib import import_module
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.exceptions import ValidationError

from accounts.exercise_metadata import (
    infer_legacy_metadata,
    metadata_issues,
    movement_role,
    validate_metadata,
)
from accounts.generation_policy import validate_policy
from accounts.models import (
    CoachProfile,
    CoachRuleSet,
    Exercise,
)
from accounts.rules_services import create_exercise, update_exercise
from programming.services import program_requests
from programming.services.preparation import prepare_from_visit
from programming.services.programs import (
    finalize_version,
    serialize_student_program_detail,
    update_draft_version,
)
from programming.services.training_selection import (
    _full_body_muscles,
    _pick_for_roles,
    _session_covers_muscle,
)
from programming.services.volume_planning import (
    allocate_volume,
    audit_volume,
    build_volume_plan,
    plan_session_exercise_counts,
    primary_key,
)
from students.models import Student
from students.services import create_visit


def item(key, sets=3, **extra):
    return {
        "id": key,
        "name": "نام نمایشی دلخواه",
        "targetMuscle": "پا",
        "sets": sets,
        "reps": "8-12",
        "rest": "90 ثانیه",
        "exercise_snapshot": {
            "targets": [
                {"muscle_key": key, "role": "primary"},
                {"muscle_key": "core", "role": "secondary"},
            ],
            "prescription_unit": "reps",
            "mechanics": "single_joint",
        },
        **extra,
    }


class VolumePlannerTests(SimpleTestCase):
    def setUp(self):
        self.policy = validate_policy({})
        self.plan = build_volume_plan(
            self.policy, "intermediate", "hypertrophy", {"glutes": "focus"}
        )

    def test_precise_muscles_survive_shared_leg_label_and_secondary_is_separate(self):
        days = [
            {
                "id": "one",
                "exercises": [item("glutes"), item("quadriceps", 4), item("hamstrings", 2)],
            }
        ]
        audit, _ = audit_volume(
            days, self.plan, self.policy, SimpleNamespace(training_conditions={})
        )
        self.assertEqual(audit["direct_sets"], {"glutes": 3, "quadriceps": 4, "hamstrings": 2})
        self.assertEqual(audit["secondary_exposure_sets"], {"core": 9})
        self.assertEqual(primary_key(days[0]["exercises"][0]), "glutes")
        self.assertNotIn("پا", audit["direct_sets"])

    def test_coach_focus_applies_only_to_the_selected_muscle(self):
        rows = self.plan["muscles"]
        self.assertEqual(rows["glutes"]["target"], rows["glutes"]["target_max"])
        self.assertEqual(rows["hamstrings"]["target"], rows["hamstrings"]["target_min"])
        self.assertFalse(rows["quadriceps"]["priority"])

    def test_coach_maintenance_overrides_the_course_goal_per_muscle(self):
        plan = build_volume_plan(
            self.policy,
            "intermediate",
            "hypertrophy",
            {"glutes": "maintenance", "chest": "focus"},
        )
        self.assertEqual(plan["muscles"]["glutes"]["decision"], "maintenance")
        self.assertEqual(
            plan["muscles"]["glutes"]["target"], plan["muscles"]["glutes"]["maintenance"]
        )
        self.assertEqual(plan["muscles"]["chest"]["target"], plan["muscles"]["chest"]["target_max"])

    def test_three_day_auto_split_is_full_body_and_priority_repeats(self):
        plan = build_volume_plan(self.policy, "intermediate", "hypertrophy", {"glutes": "focus"})
        sessions = _full_body_muscles(3, [], plan)
        self.assertEqual(len(sessions), 3)
        for session in sessions:
            self.assertTrue({"سینه", "زیربغل", "پا", "سرشانه"}.issubset(session))
        self.assertEqual(
            sum(
                any(_session_covers_muscle(label, "glutes") for label in session)
                for session in sessions
            ),
            3,
        )

    def test_auto_split_repeats_focus_across_session_cap_for_five_days(self):
        plan = build_volume_plan(self.policy, "intermediate", "hypertrophy", {"glutes": "focus"})
        sessions = _full_body_muscles(5, [], plan)
        self.assertEqual(len(sessions), 5)
        self.assertGreaterEqual(
            sum("باسن" in session or "پا" in session for session in sessions), 2
        )

    def test_time_budget_is_enforced_and_shortfall_is_visible(self):
        student = SimpleNamespace(training_conditions={"session_duration_minutes": 30})
        days = [
            {
                "id": "one",
                "exercises": [
                    item(key, 5)
                    for key in ("glutes", "quadriceps", "hamstrings", "chest", "back", "shoulders")
                ],
            }
        ]
        warnings = []
        allocate_volume(days, self.plan, self.policy, student, warnings)
        audit, warnings = audit_volume(days, self.plan, self.policy, student)
        self.assertLessEqual(audit["sessions"][0]["estimated_minutes"], 30)
        self.assertTrue(any(w.startswith("volume_target_shortfall:") for w in warnings))

    def test_counts_real_superset_members_and_separate_drop_efforts(self):
        first = item("glutes", dropSet={"drops": 2})
        second = item("hamstrings")
        for row in (first, second):
            row.update(
                supersetGroupId="pair", supersetRestBetweenSeconds=0, supersetRestAfterSeconds=90
            )
        audit, _ = audit_volume(
            [{"id": "one", "exercises": [first, second]}],
            self.plan,
            self.policy,
            SimpleNamespace(training_conditions={}),
        )
        self.assertEqual(audit["direct_sets"], {"glutes": 3, "hamstrings": 3})
        self.assertEqual(audit["additional_efforts"]["glutes"], 2)

    def test_maintenance_uses_maintenance_and_impossible_bounds_are_rejected(self):
        plan = build_volume_plan(self.policy, "beginner", "maintain", [])
        self.assertEqual(
            plan["muscles"]["chest"]["target"], plan["muscles"]["chest"]["maintenance"]
        )
        bad = deepcopy(self.policy)
        bad["volume_profiles"]["intermediate"]["chest"]["weekly_cap"] = 1
        with self.assertRaises(ValidationError):
            validate_policy(bad)

    def test_metadata_is_executable_without_name_heuristics(self):
        self.assertEqual(
            movement_role({"name": "نام دلخواه", "movement_pattern": "pull_horizontal"}),
            "horizontal_pull",
        )
        for payload in (
            {"movement_pattern": "whatever"},
            {"mechanics": []},
            {"joint_keys": ["unknown"]},
        ):
            with self.assertRaises(ValidationError):
                validate_metadata(payload)

    def test_metadata_audit_detects_populated_but_incompatible_fields(self):
        exercise = {
            "movement_pattern": "elbow_flexion",
            "mechanics": "single_joint",
            "joint_keys": ["elbow"],
            "prescription_unit": "reps",
            "targets": [{"muscle_key": "shoulders", "role": "primary"}],
        }
        self.assertEqual(metadata_issues(exercise), ["pattern_primary_mismatch"])
        with self.assertRaises(ValidationError):
            validate_metadata(exercise)

    def test_front_raise_grip_word_does_not_infer_an_elbow_curl(self):
        inferred = infer_legacy_metadata("نشر روبرو دمبل چکشی جفت دست ایستاده")
        self.assertEqual(inferred["movement_pattern"], "shoulder_flexion")
        self.assertEqual(inferred["joint_keys"], ["shoulder"])

    def test_session_capacity_covers_primary_muscles_before_extra_variety(self):
        demands = [
            {
                "muscle_key": key,
                "available": 3,
                "desired": 2,
                "per_session_sets": 12,
                "priority": key == "chest",
                "order": index,
            }
            for index, key in enumerate(("chest", "back", "quadriceps", "hamstrings"))
        ]
        result = plan_session_exercise_counts(demands, 60, 3, self.policy)
        self.assertEqual(result["slot_budget"], 7)
        self.assertEqual(result["selected_count"], 7)
        self.assertEqual(result["uncovered_muscles"], [])
        self.assertEqual(result["selected_counts"]["chest"], 2)

    def test_short_session_reports_muscles_that_cannot_fit(self):
        demands = [
            {
                "muscle_key": key,
                "available": 2,
                "desired": 2,
                "per_session_sets": 10,
                "priority": key == "hamstrings",
                "order": index,
            }
            for index, key in enumerate(("chest", "back", "quadriceps", "hamstrings"))
        ]
        result = plan_session_exercise_counts(demands, 30, 3, self.policy)
        self.assertEqual(result["selected_count"], 3)
        self.assertNotIn("hamstrings", result["uncovered_muscles"])
        self.assertEqual(len(result["uncovered_muscles"]), 1)
        self.assertLessEqual(result["selected_count"], result["slot_budget"])

    def test_session_slots_rotate_to_cover_weekly_unserved_muscles(self):
        keys = (
            "chest",
            "back",
            "quadriceps",
            "hamstrings",
            "glutes",
            "calves",
            "shoulders",
            "core",
        )
        demands = [
            {
                "muscle_key": key,
                "available": 2,
                "desired": 1,
                "per_session_sets": 6,
                "weekly_minimum": 2,
                "weekly_sets_assigned": 0,
                "sessions_remaining": 3,
                "priority": False,
                "order": index,
            }
            for index, key in enumerate(keys)
        ]
        first = plan_session_exercise_counts(demands, 50, 3, self.policy)
        self.assertEqual(first["slot_budget"], 6)
        assigned = {key: 3 for key, count in first["selected_counts"].items() if count}
        second_demands = [
            {**row, "weekly_sets_assigned": assigned.get(row["muscle_key"], 0)} for row in demands
        ]

        second = plan_session_exercise_counts(second_demands, 50, 3, self.policy)

        self.assertEqual(second["selected_count"], 6)
        self.assertTrue({"shoulders", "core"}.issubset(second["selected_counts"]))
        self.assertIn("shoulders", first["uncovered_muscles"])
        self.assertIn("core", first["uncovered_muscles"])

    def test_catalog_priority_selects_a_coach_ranked_candidate(self):
        selected = _pick_for_roles(
            ["ordinary", "coach-ranked"],
            ["muscle:chest"],
            "سینه",
            preferred_names=set(),
            historical_map={},
            metadata_by_name={
                "ordinary": {"primary_muscle_key": "chest", "priority": 0},
                "coach-ranked": {"primary_muscle_key": "chest", "priority": 8},
            },
        )
        self.assertEqual(selected, ["coach-ranked"])

    def test_strength_prefers_loadable_option_before_numeric_preference(self):
        selected = _pick_for_roles(
            ["bodyweight", "weighted"],
            ["muscle:chest"],
            "سینه",
            preferred_names=set(),
            historical_map={},
            goal="strength",
            metadata_by_name={
                "bodyweight": {
                    "primary_muscle_key": "chest",
                    "movement_pattern": "push_horizontal",
                    "equipment_keys": ["bodyweight"],
                    "priority": 100,
                },
                "weighted": {
                    "primary_muscle_key": "chest",
                    "movement_pattern": "push_horizontal",
                    "equipment_keys": ["dumbbell"],
                    "priority": 0,
                },
            },
        )
        self.assertEqual(selected, ["weighted"])

    def test_every_required_equipment_item_must_be_available(self):
        from programming.services.training_selection import _passes_equipment_hard

        exercise = SimpleNamespace(equipment="هالتر، نیمکت")
        metadata = {"نام دلخواه": {"equipment_names": ["هالتر", "نیمکت"]}}
        catalog = {"نام دلخواه": exercise}
        self.assertFalse(_passes_equipment_hard("نام دلخواه", {"هالتر"}, catalog, metadata))
        self.assertTrue(_passes_equipment_hard("نام دلخواه", {"هالتر", "نیمکت"}, catalog, metadata))


@override_settings(
    SMS_BACKEND="mock", VISIT_FINALIZED_SMS_ENABLED=True, PROGRAM_READY_SMS_ENABLED=True
)
class VisitVolumeWorkflowTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username="volume-coach")
        self.coach = CoachProfile.objects.create(user=user, display_name="Volume QA")
        self.student = Student.objects.create(
            coach=self.coach,
            full_name="Volume QA Athlete",
            age=28,
            gender="male",
            height_cm=180,
            weight_kg=80,
            training_background={"level": "intermediate"},
            training_conditions={"training_days_per_week": 2, "session_duration_minutes": 90},
            equipment={"has_full_gym": True},
        )
        self.refs = []
        for key, pattern in (
            ("glutes", "hip_extension"),
            ("hamstrings", "knee_flexion"),
            ("quadriceps", "knee_extension"),
            ("calves", "ankle_extension"),
        ):
            for index in range(4):
                self.refs.append(
                    create_exercise(
                        self.coach,
                        {
                            "name": f"QA {key} {index}",
                            "targets": [{"muscle_key": key, "role": "primary"}],
                            "levels": ["intermediate"],
                            "equipment_keys": ["machine"],
                            "movement_pattern": pattern,
                            "mechanics": "single_joint",
                            "joint_keys": [
                                "hip" if key == "glutes" else "ankle" if key == "calves" else "knee"
                            ],
                            "prescription_unit": "reps",
                        },
                    )
                )

    def prepare(self, decisions=None, *, operation_key="volume-qa-prepare"):
        request, _ = program_requests.create_request(
            student=self.student,
            actor=self.coach.user,
            data={"sections": ["workout"], "sessions_per_week": 2},
        )
        visit = create_visit(
            self.coach,
            self.student,
            {
                "visit_date": date(2026, 10, 27),
                "current_weight_kg": 80,
                "previous_weight_kg": 80,
                "program_settings": {
                    "sections": ["workout"],
                    "training_systems": [],
                    "muscle_decisions": decisions or {},
                    "session_muscles": [["پا"], ["پا"]],
                },
            },
            actor=self.coach.user,
        )
        request.visit = visit
        request.save(update_fields=["visit"])
        return prepare_from_visit(self.coach, self.coach.user, visit.id, operation_key)

    @patch("common.sms.http.client.HTTPSConnection")
    def test_request_visit_generation_audit_and_finalize_without_sms(self, transport):
        program, run = self.prepare({"glutes": "focus"})
        training = run.resulting_version.training
        audit = training["volume_audit"]
        self.assertEqual(
            audit["direct_sets"]["glutes"], training["volume_plan"]["muscles"]["glutes"]["target"]
        )
        self.assertLess(audit["direct_sets"]["hamstrings"], audit["direct_sets"]["glutes"])
        self.assertEqual(run.request["muscle_decisions"], {"glutes": "focus"})
        self.assertEqual(
            run.output_snapshot["generator"]["evidence"]["coach_muscle_decisions"]["glutes"],
            "focus",
        )
        finalized = finalize_version(run.resulting_version, actor=self.coach.user)
        program.active_version = finalized
        program.save(update_fields=["active_version"])
        public = serialize_student_program_detail(program)["training"]
        for key in ("volume_policy", "volume_plan", "volume_audit", "eligible_exercise_ids"):
            self.assertNotIn(key, public)
        self.assertTrue(public["days"])
        transport.assert_not_called()
        self.assertEqual(program.student_id, self.student.pk)

    def test_weak_and_strong_observations_do_not_change_weekly_muscle_decisions(self):
        self.student.goals = {
            "primary_goal": "hypertrophy",
            "secondary_goal": "fat_loss",
            "weak_muscles": ["باسن"],
            "strong_muscles": ["سینه"],
            "muscle_priorities": ["زیربغل"],
        }
        self.student.save(update_fields=["goals", "updated_at"])
        _, run = self.prepare({"glutes": "balanced"}, operation_key="observation-is-not-a-plan")
        evidence = run.output_snapshot["generator"]["evidence"]
        plan = run.resulting_version.training["volume_plan"]["muscles"]
        self.assertFalse(plan["glutes"]["priority"])
        self.assertEqual(plan["glutes"]["target"], plan["glutes"]["target_min"])
        self.assertFalse(plan["back"]["priority"])
        self.assertIn("باسن", evidence["observed_weak_muscles"])
        self.assertIn("سینه", evidence["strong_muscles"])
        self.assertEqual(evidence["coach_goal"], "hypertrophy")
        self.assertEqual(evidence["athlete_requested_goal"], "fat_loss")
        self.assertEqual(evidence["coach_muscle_decisions"], {"glutes": "balanced"})

    def test_review_cannot_bypass_saved_caps_or_eligibility(self):
        _, run = self.prepare()
        version = run.resulting_version
        bad = deepcopy(version.training)
        bad["days"][0]["exercises"][0]["sets"] = 40
        with self.assertRaises(ValidationError):
            update_draft_version(version, {"training": bad})
        version.refresh_from_db()
        self.assertNotEqual(version.training["days"][0]["exercises"][0]["sets"], 40)
        foreign = Exercise.objects.create(
            coach=self.coach, name="Not eligible", primary_muscle="باسن", level="advanced"
        )
        bad = deepcopy(version.training)
        bad["days"][0]["exercises"][0]["exercise_id"] = str(foreign.pk)
        with self.assertRaises(ValidationError):
            update_draft_version(version, {"training": bad})

    def test_canonical_injury_rule_filters_by_joint_and_pattern_together(self):
        from accounts.models import ProgramTemplate
        from programming.services.generator import _build_training

        policy = validate_policy(
            {
                "movement_restrictions": [
                    {
                        "injury_key": "knee",
                        "joint_keys": ["knee"],
                        "movement_patterns": ["knee_extension"],
                    }
                ]
            }
        )
        CoachRuleSet.objects.update_or_create(
            coach=self.coach, defaults={"style_profile": {"generation_rules": policy}}
        )
        self.student.injuries = {"has_injury": True, "injury_types": ["knee"]}
        template = ProgramTemplate(
            coach=self.coach, name="QA", level="intermediate", days_per_week=2, split=["پا", "پا"]
        )
        training, _, evidence = _build_training(
            coach=self.coach,
            student=self.student,
            template=template,
            level="intermediate",
            days_per_week=2,
            apply_level=True,
            apply_muscle=True,
            apply_catalog=True,
            apply_general=True,
            apply_injury=True,
            muscle_decisions={},
            goals_override="",
            selected_training_systems=[],
            catalog_only=True,
        )
        keys = {primary_key(row) for day in training["days"] for row in day["exercises"]}
        self.assertNotIn("quadriceps", keys)
        self.assertIn("hamstrings", keys)
        self.assertTrue(
            any(
                row["reason"] == "structured_joint_pattern_restriction"
                for row in evidence["excluded_injury"]
            )
        )

    def test_audit_command_is_read_only_by_default_and_apply_preserves_identity(self):
        legacy = Exercise.objects.create(
            coach=self.coach, name="جلوپا دستگاه", primary_muscle="چهارسر ران"
        )
        mislabeled_raise = Exercise.objects.create(
            coach=self.coach,
            name="نشر روبرو دمبل چکشی",
            primary_muscle="سرشانه",
            movement_pattern="elbow_flexion",
            mechanics="single_joint",
            joint_keys=["elbow"],
            prescription_unit="reps",
        )
        original = legacy.pk
        audit_output = StringIO()
        call_command("complete_exercise_metadata", coach_id=str(self.coach.pk), stdout=audit_output)
        legacy.refresh_from_db()
        self.assertEqual(legacy.mechanics, "")
        mislabeled_raise.refresh_from_db()
        self.assertEqual(mislabeled_raise.movement_pattern, "elbow_flexion")
        self.assertIn("pattern_primary_mismatch", audit_output.getvalue())
        call_command(
            "complete_exercise_metadata", coach_id=str(self.coach.pk), apply=True, stdout=StringIO()
        )
        legacy.refresh_from_db()
        mislabeled_raise.refresh_from_db()
        self.assertEqual(legacy.pk, original)
        self.assertEqual(legacy.movement_pattern, "knee_extension")
        self.assertEqual(legacy.mechanics, "single_joint")
        self.assertEqual(mislabeled_raise.movement_pattern, "shoulder_flexion")
        self.assertEqual(mislabeled_raise.joint_keys, ["shoulder"])

    def test_api_rejects_invalid_metadata_without_changing_existing_fields(self):
        with self.assertRaises(ValidationError):
            update_exercise(self.refs[0], {"joint_keys": ["not-a-joint"]})
        self.refs[0].refresh_from_db()
        self.assertEqual(self.refs[0].joint_keys, ["hip"])

    def test_data_conversion_preserves_ids_and_handles_same_name_legacy_aliases(self):
        old = Exercise.objects.create(
            coach=self.coach, name="جلوپا دستگاه", primary_muscle="پا", equipment="دستگاه"
        )
        other = Exercise.objects.create(
            coach=self.coach, name="جلوپا دستگاه", primary_muscle="چهارسر ران"
        )
        unknown = Exercise.objects.create(
            coach=self.coach,
            name="Unknown custom movement",
            primary_muscle="عضلهٔ سفارشی",
            movement_pattern="unreviewed",
        )
        identities = set(Exercise.objects.values_list("id", flat=True))
        migration = import_module("accounts.migrations.0025_exercise_execution_metadata")
        migration.complete_known_metadata(apps, SimpleNamespace(connection=connection))
        self.assertEqual(set(Exercise.objects.values_list("id", flat=True)), identities)
        old.refresh_from_db()
        other.refresh_from_db()
        unknown.refresh_from_db()
        self.assertEqual(old.mechanics, "single_joint")
        self.assertEqual(old.muscle_targets.get(role="primary").muscle.key, "quadriceps")
        self.assertEqual(other.name, old.name)
        self.assertEqual(unknown.movement_pattern, "unreviewed")
        self.assertTrue(old.equipment_rows.exists())
