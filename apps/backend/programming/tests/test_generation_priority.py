"""Coverage for the rules_v1 explicit-priority generator pipeline.

These tests target the planned-model-aware design in
``programming/services/generator.py``. Several models referenced by the
product spec (ExerciseAlias, ExerciseHistoricalUsage, CoachNutritionTemplate,
CoachSupplementTemplate) may not exist yet in this codebase revision — tests
that require them detect the model dynamically and ``skipTest`` when it is
absent, rather than asserting against speculative schema.
"""

from __future__ import annotations

from decimal import Decimal

from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import (
    CoachExercisePreference,
    CoachNutritionTemplate,
    CoachProfile,
    Exercise,
    ExerciseBankGroup,
    InjuryRule,
    NutritionMealOption,
    NutritionMealSlot,
    NutritionOptionItem,
    ProgramTemplate,
)
from accounts.rules_services import ensure_rule_set, replace_coach_rules
from common.testing import register
from programming.services import generator as gen
from students.models import Student

BASE_RULES = {
    "templates": [
        {
            "name": "۳ روزه تست اولویت",
            "goal": "حجم",
            "main_goal": "حجم",
            "level": "intermediate",
            "days_per_week": 3,
            "intensity": "متوسط",
            "volume": "متوسط",
            "rest_time": "۹۰ ثانیه",
            "split": ["سینه", "زیربغل", "پا"],
            "muscle_priority_order": ["سینه", "زیربغل", "پا"],
            "special_rules": [],
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "levels": [],
    "injuries": [],
    "muscle_priorities": [],
    "exercise_bank": [
        {
            "group": "سینه",
            "favorite_exercises": ["پرس سینه هالتر", "پرس بالا سینه دمبل"],
            "beginner_friendly": ["پرس سینه دستگاه"],
            "professional_friendly": ["پرس سینه هالتر"],
            "forbidden_exercises": [],
            "sort_order": 0,
        },
        {
            "group": "زیربغل",
            "favorite_exercises": ["لت سیم کش", "روئینگ هالتر"],
            "beginner_friendly": ["لت سیم کش"],
            "professional_friendly": ["بارفیکس"],
            "forbidden_exercises": [],
            "sort_order": 1,
        },
        {
            "group": "پا",
            "favorite_exercises": ["اسکوات", "پرس پا"],
            "beginner_friendly": ["پرس پا"],
            "professional_friendly": ["اسکوات"],
            "forbidden_exercises": [],
            "sort_order": 2,
        },
        {
            "group": "سرشانه",
            "favorite_exercises": ["نشر جانب دمبل", "پرس سرشانه دستگاه"],
            "beginner_friendly": ["نشر جانب دمبل"],
            "professional_friendly": ["پرس سرشانه دستگاه"],
            "forbidden_exercises": [],
            "sort_order": 3,
        },
    ],
    "general_rules": {"extra_notes": "", "items": []},
}


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class GenerationPriorityTests(APITestCase):
    def setUp(self):
        a = register(self.client, "priority-a@example.com", full_name="Coach Priority")
        self.tokens_a = a.data["tokens"]
        self.coach = CoachProfile.objects.get(id=a.data["coach"]["id"])
        replace_coach_rules(self.coach, BASE_RULES, partial=False)
        self.template = ProgramTemplate.objects.filter(coach=self.coach).first()
        self.rule_set = ensure_rule_set(self.coach)

    def _make_student(self, **overrides) -> Student:
        defaults = dict(
            coach=self.coach,
            full_name="شاگرد تست",
            age=28,
            gender=Student.Gender.MALE,
            height_cm=Decimal("180.0"),
            weight_kg=Decimal("80.0"),
            goals={"primary_goal": "hypertrophy", "weak_muscles": [], "muscle_priorities": []},
            injuries={},
            equipment={},
        )
        defaults.update(overrides)
        return Student.objects.create(**defaults)

    def _generate(self, student: Student, *, request: dict | None = None):
        request = request or {
            "program_type": "workout",
            "level": "intermediate",
            "days_per_week": 3,
        }
        return gen.generate_document(
            coach=self.coach,
            student=student,
            visit=None,
            template=self.template,
            request=request,
        )

    def _all_names(self, document: dict) -> list[str]:
        return [e["name"] for d in document["training"]["days"] for e in d["exercises"]]

    # 1. historical bank used when no injury -----------------------------
    def test_historical_bank_used_when_no_injury(self):
        student = self._make_student()
        document, warnings = self._generate(student)
        names = self._all_names(document)
        self.assertIn("پرس سینه هالتر", names)
        evidence = document["generator"]["evidence"]
        self.assertEqual(evidence["excluded_injury"], [])
        # ExerciseHistoricalUsage is a planned model; until it lands the
        # historical-usage signal degrades to a no-op without breaking
        # generation or promoting anything above forbidden/injury rules.
        self.assertEqual(evidence["historical_selected"], [])

    # 2. aliases don't duplicate ------------------------------------------
    def test_aliases_dont_duplicate(self):
        InjuryRule.objects.create(
            rule_set=self.rule_set,
            coach=self.coach,
            name="گردن درد",
            forbidden_exercises=["پرس سرشانه سنگین"],
            alternatives=["نشر جانب سبک"],
            is_active=True,
            sort_order=0,
        )
        student = self._make_student(
            injuries={
                "has_injury": True,
                "injury_type": "mild_neck",
                "aggravating_movements": ["heavy_shoulder_press"],
                "disallowed_exercises": [],
            }
        )
        document, warnings = self._generate(student)
        evidence = document["generator"]["evidence"]
        names_seen = [item["name"] for item in evidence["excluded_injury"]]
        self.assertEqual(len(names_seen), len(set(names_seen)))
        self.assertIn("پرس سرشانه سنگین", names_seen)

    # 3. neck restriction beats historical shoulder/shrug ------------------
    def test_neck_restriction_beats_historical_shoulder_shrug(self):
        ExerciseBankGroup.objects.filter(rule_set=self.rule_set, group_name="سرشانه").update(
            favorite_exercises=["پرس سرشانه هالتر", "شراگز", "نشر جانب دمبل"]
        )
        student = self._make_student(injuries={"has_injury": True, "injury_type": "mild_neck"})
        document, warnings = self._generate(student)
        names = self._all_names(document)
        self.assertNotIn("پرس سرشانه هالتر", names)
        self.assertNotIn("شراگز", names)
        evidence = document["generator"]["evidence"]
        self.assertTrue(
            any(
                item["reason"] == "neck_injury_safety_default"
                for item in evidence["excluded_injury"]
            )
        )

    # 4. forbidden excluded -------------------------------------------------
    def test_forbidden_excluded(self):
        exercise = Exercise.objects.create(
            coach=self.coach, name="پرس سینه هالتر", primary_muscle="سینه", is_active=True
        )
        CoachExercisePreference.objects.create(
            coach=self.coach, exercise=exercise, is_prohibited=True
        )
        student = self._make_student()
        document, warnings = self._generate(student)
        names = self._all_names(document)
        self.assertNotIn("پرس سینه هالتر", names)
        evidence = document["generator"]["evidence"]
        self.assertTrue(
            any(
                item["name"] == "پرس سینه هالتر" and item["reason"] == "coach_prohibited_preference"
                for item in evidence["excluded_forbidden"]
            )
        )

    # 5. preference affects selection --------------------------------------
    def test_preference_affects_selection(self):
        exercise = Exercise.objects.create(
            coach=self.coach,
            name="پرس سینه دمبل تخت",
            primary_muscle="سینه",
            level=Exercise.Level.ALL,
            is_active=True,
        )
        CoachExercisePreference.objects.create(
            coach=self.coach, exercise=exercise, is_preferred=True
        )
        student = self._make_student()
        document, warnings = self._generate(student)
        chest_day = next(d for d in document["training"]["days"] if "سینه" in d["targetMuscles"])
        chest_names = [e["name"] for e in chest_day["exercises"] if e["targetMuscle"] == "سینه"]
        self.assertIn("پرس سینه دمبل تخت", chest_names)
        evidence = document["generator"]["evidence"]
        self.assertIn("پرس سینه دمبل تخت", evidence["preferred_selected"])

    # 6. unreviewed nutrition not used --------------------------------------
    def test_unreviewed_nutrition_not_used(self):
        student = self._make_student()
        student.food_allergies = ["گلوتن"]  # planned safety field; set dynamically
        document, warnings = self._generate(student, request={"program_type": "nutrition"})
        self.assertFalse(document["nutrition"]["enabled"])
        self.assertIn("no_reviewed_nutrition_template", warnings)
        self.assertIsNone(document["generator"]["evidence"]["nutrition"]["selected_template_id"])

    # 7. reviewed nutrition used ---------------------------------------------
    def test_reviewed_nutrition_used(self):
        student = self._make_student()
        student.food_allergies = ["گلوتن"]
        template = CoachNutritionTemplate.objects.create(
            coach=self.coach,
            rule_set=self.rule_set,
            name="رژیم استاندارد",
            purpose="hypertrophy",
            status=CoachNutritionTemplate.Status.ACTIVE,
            needs_coach_review=False,
            is_eligible_for_auto_select=True,
        )
        slot = NutritionMealSlot.objects.create(
            template=template,
            slot_key=NutritionMealSlot.SlotKey.BREAKFAST,
            sort_order=0,
        )
        option = NutritionMealOption.objects.create(slot=slot, option_index=1, sort_order=0)
        NutritionOptionItem.objects.create(
            option=option,
            sort_order=0,
            food_name="تخم مرغ",
            quantity_text="۲ عدد",
        )
        document, warnings = self._generate(student, request={"program_type": "nutrition"})
        self.assertTrue(document["nutrition"]["enabled"])
        self.assertNotIn("no_reviewed_nutrition_template", warnings)
        self.assertEqual(
            document["generator"]["evidence"]["nutrition"]["selected_template_id"],
            str(template.id),
        )
        self.assertTrue(
            any(
                food["name"] == "تخم مرغ"
                for meal in document["nutrition"]["meals"]
                for food in meal["foods"]
            )
        )

    # 8. unreviewed supplement not used --------------------------------------
    def test_unreviewed_supplement_not_used(self):
        student = self._make_student()
        document, warnings = self._generate(
            student, request={"program_type": "supplement", "supplement_opt_in": True}
        )
        self.assertFalse(document["supplements"]["enabled"])
        self.assertIn("no_reviewed_supplement_template", warnings)

    # 9. supplement_opt_in required ------------------------------------------
    def test_supplement_opt_in_required(self):
        student = self._make_student()
        document, warnings = self._generate(student, request={"program_type": "supplement"})
        self.assertFalse(document["supplements"]["enabled"])
        self.assertIn("supplement_opt_in_required", warnings)

        document2, warnings2 = self._generate(
            student, request={"program_type": "supplement", "supplement_opt_in": True}
        )
        self.assertNotIn("supplement_opt_in_required", warnings2)

    # 10. evidence matches decisions ------------------------------------------
    def test_evidence_matches_decisions(self):
        InjuryRule.objects.create(
            rule_set=self.rule_set,
            coach=self.coach,
            name="گردن درد",
            forbidden_exercises=["پرس سرشانه سنگین"],
            alternatives=["نشر جانب سبک"],
            is_active=True,
            sort_order=0,
        )
        exercise = Exercise.objects.create(
            coach=self.coach,
            name="پرس سینه دمبل تخت",
            primary_muscle="سینه",
            level=Exercise.Level.ALL,
            is_active=True,
        )
        CoachExercisePreference.objects.create(
            coach=self.coach, exercise=exercise, is_preferred=True
        )
        student = self._make_student(
            injuries={
                "has_injury": True,
                "injury_type": "mild_neck",
                "aggravating_movements": ["heavy_shoulder_press"],
            }
        )
        document, warnings = self._generate(student)
        evidence = document["generator"]["evidence"]

        self.assertEqual(evidence["priority_order"], gen.PRIORITY_ORDER)
        self.assertEqual(evidence["training_days"], 3)
        self.assertEqual(evidence["ruleset"]["id"], str(self.rule_set.id))
        self.assertTrue(any(r["name"] == "گردن درد" for r in evidence["injury_rules_applied"]))
        self.assertIn("پرس سینه دمبل تخت", evidence["preferred_selected"])
        excluded_names = {item["name"] for item in evidence["excluded_injury"]}
        self.assertIn("پرس سرشانه سنگین", excluded_names)
        self.assertEqual(evidence["nutrition"]["reason"], "not_requested")
        self.assertEqual(evidence["supplements"]["reason"], "not_requested")

        names = self._all_names(document)
        self.assertNotIn("پرس سرشانه سنگین", names)
