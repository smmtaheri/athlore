"""Create-only Arman fixture bootstrap tests (no --replace-rules)."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.demo_fixtures import ARMAN_RULES
from accounts.models import (
    CoachProfile,
    ExerciseBankGroup,
    GeneralRule,
    InjuryRule,
    LevelRule,
    MusclePriority,
    ProgramTemplate,
)
from accounts.rules_services import ensure_rule_set, replace_coach_rules
from students.visit_form_models import CoachVisitFormTemplate

User = get_user_model()

PARTIAL_RULES = {
    "templates": [
        {
            "name": "۴ روزه حجم متوسط",
            "goal": "edited-goal-must-survive",
            "main_goal": "hypertrophy",
            "level": "intermediate",
            "days_per_week": 4,
            "intensity": "edited-intensity",
            "volume": "متوسط",
            "rest_time": "۹۰",
            "split": ["سینه و پشت بازو", "زیربغل و جلو بازو", "پا", "سرشانه و شکم"],
            "muscle_priority_order": ["سینه"],
            "special_rules": ["coach edit"],
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "levels": [
        {
            "id": "intermediate",
            "intensity": "edited-level",
            "volume": "۳ ست",
            "allowed_techniques": ["سوپرست محدود"],
            "forbidden_exercises": [],
            "required_exercises": [],
            "coach_notes": "keep me",
        }
    ],
    "injuries": [
        {
            "name": "گردن درد",
            "forbidden_exercises": ["پرس سرشانه سنگین"],
            "alternatives": ["نشر جانب دمبل"],
            "notes": "edited injury notes",
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "muscle_priorities": [
        {
            "muscle": "سینه",
            "extra_exercises": 9,
            "extra_sets": 9,
            "order_change": "edited order",
            "notes": "edited muscle notes",
            "sort_order": 0,
        }
    ],
    "exercise_bank": [
        {
            "group": "سینه",
            "favorite_exercises": ["edited-favorite"],
            "beginner_friendly": [],
            "professional_friendly": [],
            "forbidden_exercises": [],
            "sort_order": 0,
        }
    ],
    "general_rules": {
        "extra_notes": "edited extra notes",
        "items": [
            {
                "title": "Compound اول جلسه",
                "description": "edited description",
                "category": "ترتیب تمرین",
                "importance": "high",
                "is_active": True,
                "order": 1,
            }
        ],
    },
}


class SeedMissingRuleRowsTests(TestCase):
    def test_partial_coach_gets_full_arman_fixture_without_replace_rules(self):
        user = User.objects.create_user(
            username="arman@example.com", email="arman@example.com", password="x"
        )
        coach = CoachProfile.objects.create(user=user, display_name="آرمان واعظی")
        other_user = User.objects.create_user(
            username="other@example.com", email="other@example.com", password="x"
        )
        other = CoachProfile.objects.create(user=other_user, display_name="Other Coach")
        ensure_rule_set(other)
        MusclePriority.objects.create(
            rule_set=other.rule_set,
            coach=other,
            muscle="سینه",
            notes="other-coach-only",
        )

        replace_coach_rules(coach, PARTIAL_RULES, partial=False)
        rule_set = ensure_rule_set(coach)
        rule_set.general_extra_notes = "edited extra notes"
        rule_set.save(update_fields=["general_extra_notes", "updated_at"])

        # Seed without --replace-rules (default).
        call_command("seed_demo_fixtures", skip_generate=True, force=True, verbosity=0)

        # Existing edited records survive.
        tpl = ProgramTemplate.objects.get(coach=coach, name="۴ روزه حجم متوسط")
        self.assertEqual(tpl.goal, "edited-goal-must-survive")
        self.assertEqual(tpl.intensity, "edited-intensity")
        level = LevelRule.objects.get(coach=coach, level_key="intermediate")
        self.assertEqual(level.intensity, "edited-level")
        injury = InjuryRule.objects.get(coach=coach, name="گردن درد")
        self.assertEqual(injury.notes, "edited injury notes")
        chest_mp = MusclePriority.objects.get(coach=coach, muscle="سینه")
        self.assertEqual(chest_mp.notes, "edited muscle notes")
        self.assertEqual(chest_mp.extra_exercises, 9)
        bank = ExerciseBankGroup.objects.get(coach=coach, group_name="سینه")
        self.assertEqual(bank.favorite_exercises, ["edited-favorite"])
        general = GeneralRule.objects.get(coach=coach, title="Compound اول جلسه")
        self.assertEqual(general.description, "edited description")
        rule_set.refresh_from_db()
        self.assertEqual(rule_set.general_extra_notes, "edited extra notes")

        # Missing fixture categories inserted.
        expected_templates = {t["name"] for t in ARMAN_RULES["templates"]}
        actual_templates = set(
            ProgramTemplate.objects.filter(coach=coach).values_list("name", flat=True)
        )
        self.assertTrue(expected_templates.issubset(actual_templates))

        expected_levels = {lvl["id"] for lvl in ARMAN_RULES["levels"]}
        actual_levels = set(
            LevelRule.objects.filter(coach=coach).values_list("level_key", flat=True)
        )
        self.assertEqual(actual_levels, expected_levels)

        expected_injuries = {i["name"] for i in ARMAN_RULES["injuries"]}
        actual_injuries = set(
            InjuryRule.objects.filter(coach=coach).values_list("name", flat=True)
        )
        self.assertTrue(expected_injuries.issubset(actual_injuries))

        expected_muscles = {m["muscle"] for m in ARMAN_RULES["muscle_priorities"]}
        actual_muscles = set(
            MusclePriority.objects.filter(coach=coach).values_list("muscle", flat=True)
        )
        self.assertTrue(expected_muscles.issubset(actual_muscles))
        self.assertIn("زیربغل", actual_muscles)
        self.assertIn("پا", actual_muscles)

        expected_bank = {
            g.get("group") or g.get("group_name") for g in ARMAN_RULES["exercise_bank"]
        }
        actual_bank = set(
            ExerciseBankGroup.objects.filter(coach=coach).values_list("group_name", flat=True)
        )
        self.assertTrue(expected_bank.issubset(actual_bank))

        expected_general = {i["title"] for i in ARMAN_RULES["general_rules"]["items"]}
        actual_general = set(
            GeneralRule.objects.filter(coach=coach).values_list("title", flat=True)
        )
        self.assertTrue(expected_general.issubset(actual_general))

        self.assertTrue(
            CoachVisitFormTemplate.objects.filter(coach=coach, key="arman_visit_v1").exists()
        )
        rule_set.refresh_from_db()
        self.assertTrue(rule_set.style_profile)  # was empty before? we set notes only
        # style_profile filled only if empty — PARTIAL didn't set it, so should be filled.
        self.assertEqual(
            (rule_set.style_profile or {}).get("source"), "coach_style_profile"
        )

        # Other coach untouched.
        self.assertEqual(MusclePriority.objects.filter(coach=other).count(), 1)
        self.assertEqual(
            MusclePriority.objects.get(coach=other).notes, "other-coach-only"
        )
        self.assertFalse(
            CoachVisitFormTemplate.objects.filter(coach=other, key="arman_visit_v1").exists()
        )

    def test_seed_twice_no_duplicates_and_preserves_edits(self):
        call_command("seed_demo_fixtures", skip_generate=True, force=True, verbosity=0)
        coach = CoachProfile.objects.get(user__email="arman@example.com")

        mp = MusclePriority.objects.get(coach=coach, muscle="سینه")
        mp.notes = "live muscle edit"
        mp.save(update_fields=["notes", "updated_at"])
        gr = GeneralRule.objects.filter(coach=coach).order_by("sort_order").first()
        self.assertIsNotNone(gr)
        gr.description = "live general edit"
        gr.save(update_fields=["description", "updated_at"])

        counts = {
            "templates": ProgramTemplate.objects.filter(coach=coach).count(),
            "levels": LevelRule.objects.filter(coach=coach).count(),
            "injuries": InjuryRule.objects.filter(coach=coach).count(),
            "muscles": MusclePriority.objects.filter(coach=coach).count(),
            "bank": ExerciseBankGroup.objects.filter(coach=coach).count(),
            "general": GeneralRule.objects.filter(coach=coach).count(),
            "assessment": CoachVisitFormTemplate.objects.filter(coach=coach).count(),
        }

        call_command("seed_demo_fixtures", skip_generate=True, force=True, verbosity=0)

        self.assertEqual(ProgramTemplate.objects.filter(coach=coach).count(), counts["templates"])
        self.assertEqual(LevelRule.objects.filter(coach=coach).count(), counts["levels"])
        self.assertEqual(InjuryRule.objects.filter(coach=coach).count(), counts["injuries"])
        self.assertEqual(MusclePriority.objects.filter(coach=coach).count(), counts["muscles"])
        self.assertEqual(ExerciseBankGroup.objects.filter(coach=coach).count(), counts["bank"])
        self.assertEqual(GeneralRule.objects.filter(coach=coach).count(), counts["general"])
        self.assertEqual(
            CoachVisitFormTemplate.objects.filter(coach=coach).count(), counts["assessment"]
        )
        mp.refresh_from_db()
        self.assertEqual(mp.notes, "live muscle edit")
        gr.refresh_from_db()
        self.assertEqual(gr.description, "live general edit")

    def test_missing_muscle_priority_and_general_rule_inserted(self):
        user = User.objects.create_user(
            username="arman@example.com", email="arman@example.com", password="x"
        )
        coach = CoachProfile.objects.create(user=user, display_name="آرمان واعظی")
        # Minimal existing rules so seed takes create-only path (not full replace).
        replace_coach_rules(
            coach,
            {
                "templates": PARTIAL_RULES["templates"],
                "levels": PARTIAL_RULES["levels"],
                "injuries": [],
                "muscle_priorities": [],
                "exercise_bank": [],
                "general_rules": {"extra_notes": "", "items": []},
            },
            partial=False,
        )
        self.assertEqual(MusclePriority.objects.filter(coach=coach).count(), 0)
        self.assertEqual(GeneralRule.objects.filter(coach=coach).count(), 0)

        call_command("seed_demo_fixtures", skip_generate=True, force=True, verbosity=0)

        self.assertGreaterEqual(
            MusclePriority.objects.filter(coach=coach).count(),
            len(ARMAN_RULES["muscle_priorities"]),
        )
        self.assertGreaterEqual(
            GeneralRule.objects.filter(coach=coach).count(),
            len(ARMAN_RULES["general_rules"]["items"]),
        )
        self.assertTrue(MusclePriority.objects.filter(coach=coach, muscle="زیربغل").exists())
        self.assertTrue(
            GeneralRule.objects.filter(coach=coach, title="مبتدی بدون failure").exists()
        )
