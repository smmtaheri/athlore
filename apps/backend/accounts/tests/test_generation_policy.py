from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import ValidationError

from accounts.generation_policy import coach_policy, validate_policy
from accounts.models import CoachProfile, ProgramTemplate
from accounts.rules_services import replace_coach_rules
from programming.services.training_selection import _candidate_names, _full_body_muscles, _prescribe


class GenerationPolicyTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username="policy-coach")
        self.coach = CoachProfile.objects.create(user=user, display_name="Policy QA")

    def test_stable_template_and_rule_identity_after_save(self):
        body = {
            "templates": [
                {"name": "QA", "days_per_week": 2, "level": "intermediate", "split": ["سینه", "پا"]}
            ],
            "levels": [{"level_key": "intermediate"}],
            "injuries": [{"name": "knee", "forbidden_exercises": ["unsafe"]}],
        }
        first = replace_coach_rules(self.coach, body, partial=True)
        again = replace_coach_rules(self.coach, {key: first[key] for key in body}, partial=True)
        for key in body:
            self.assertEqual(first[key][0]["id"], again[key][0]["id"])
        replace_coach_rules(self.coach, {"generation_rules": {"sets": 4}}, partial=True)
        self.assertEqual(coach_policy(self.coach)["sets"], 4)
        self.assertTrue(ProgramTemplate.objects.filter(pk=first["templates"][0]["id"]).exists())

    def test_unknown_or_foreign_id_is_rejected(self):
        import uuid

        with self.assertRaises(ValidationError):
            replace_coach_rules(
                self.coach, {"injuries": [{"id": str(uuid.uuid4()), "name": "x"}]}, partial=True
            )

    def test_numeric_rules_are_validated(self):
        for payload in (
            {"sets": 100},
            {"reps_min": 20, "reps_max": 8},
            {"sets": True},
            {"unknown": 1},
        ):
            with self.assertRaises(ValidationError):
                validate_policy(payload)

    def test_new_prescriptions_do_not_copy_historical_methods(self):
        row = _prescribe(
            name="جلو پا دستگاه",
            muscle="پا",
            level="intermediate",
            sets=3,
            template=ProgramTemplate(),
            exercise_index=0,
            historical_raw="4×12+12",
            coach=self.coach,
        )
        self.assertEqual(row["sets"], 3)
        self.assertEqual(row["reps"], "8-12")
        self.assertEqual(row["raw_prescription"], "3×8-12")
        self.assertEqual(row["rpe"], "RIR 2")

    def test_auto_splits_use_common_patterns_for_three_to_six_days(self):
        self.assertTrue(
            all(
                {"سینه", "زیربغل", "پا", "سرشانه"}.issubset(day)
                for day in _full_body_muscles(3, [])
            )
        )
        four = _full_body_muscles(4, [])
        self.assertEqual(len(four), 4)
        self.assertTrue("سینه" in four[0] and "چهارسر ران" not in four[0])
        self.assertTrue("چهارسر ران" in four[1] and "سینه" not in four[1])
        six = _full_body_muscles(6, [])
        self.assertEqual(len(six), 6)
        self.assertEqual(six[0], six[3])
        self.assertEqual(six[1], six[4])
        self.assertEqual(six[2], six[5])

    def test_empty_catalog_never_invents_fallback_movements(self):
        names, sources = _candidate_names(
            muscle="سینه",
            catalog={},
            structured_catalog_by_name={},
            preferred_names=set(),
            level="intermediate",
            apply_catalog=True,
        )
        self.assertEqual(names, [])
        self.assertEqual(sources, set())
