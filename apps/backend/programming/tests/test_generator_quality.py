"""Quality regressions for split-driven rules_v1 training generation."""

from __future__ import annotations

from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from accounts.models import (
    CoachExercisePreference,
    CoachProfile,
    Exercise,
    ProgramTemplate,
)
from accounts.rules_services import ensure_rule_set, replace_coach_rules
from common.testing import auth_header, register
from programming.services import generator as gen
from programming.services.split_parser import parse_split_day, parse_template_split
from programming.services.training_selection import available_equipment_tokens
from students.models import Student

ARMAN_4DAY_RULES = {
    "templates": [
        {
            "name": "۴ روزه حجم متوسط",
            "goal": "افزایش حجم",
            "main_goal": "حجم",
            "level": "intermediate",
            "days_per_week": 4,
            "intensity": "متوسط رو به سنگین",
            "volume": "متوسط",
            "rest_time": "۷۵ تا ۱۲۰ ثانیه",
            "split": ["سینه و پشت بازو", "زیربغل و جلو بازو", "پا", "سرشانه و شکم"],
            "muscle_priority_order": ["سینه", "زیربغل", "پا", "سرشانه"],
            "special_rules": [],
            "is_active": True,
            "sort_order": 0,
        },
        {
            "name": "فول بادی مبتدی ۳ روزه",
            "goal": "عمومی",
            "main_goal": "فول بادی",
            "level": "beginner",
            "days_per_week": 3,
            "intensity": "متوسط",
            "volume": "کم تا متوسط",
            "rest_time": "۶۰ تا ۹۰ ثانیه",
            "split": ["فول بادی A", "فول بادی B", "فول بادی C"],
            "muscle_priority_order": ["سینه", "زیربغل", "پا"],
            "special_rules": [],
            "is_active": True,
            "sort_order": 1,
        },
    ],
    "levels": [
        {
            "id": "intermediate",
            "intensity": "متوسط رو به سنگین",
            "volume": "۳ تا ۴ ست",
            "allowed_techniques": ["سوپرست محدود"],
            "forbidden_exercises": [],
            "required_exercises": ["پایه"],
            "coach_notes": "",
        }
    ],
    "injuries": [
        {
            "name": "گردن درد",
            "forbidden_exercises": ["پرس سرشانه سنگین", "شراگ سنگین", "پرس پشت گردن"],
            "alternatives": ["نشر جانب دمبل"],
            "notes": "",
            "is_active": True,
            "sort_order": 0,
        },
        {
            "name": "کمر درد",
            "forbidden_exercises": ["ددلیفت سنگین", "اسکوات سنگین", "خیر رومانیایی سنگین"],
            "alternatives": ["پرس پا", "ددلیفت رومانیایی"],
            "notes": "",
            "is_active": True,
            "sort_order": 1,
        },
        {
            "name": "زانو درد",
            "forbidden_exercises": ["اسکوات پرشی", "لانج پرشی"],
            "alternatives": ["پرس پا", "جلوپا دستگاه"],
            "notes": "",
            "is_active": True,
            "sort_order": 2,
        },
    ],
    "muscle_priorities": [
        {
            "muscle": "سینه",
            "extra_exercises": 0,
            "extra_sets": 1,
            "order_change": "ابتدای جلسه",
            "notes": "",
            "sort_order": 0,
        }
    ],
    "exercise_bank": [
        {
            "group": "سینه",
            "favorite_exercises": [
                "پرس سینه هالتر",
                "پرس بالا سینه دمبل",
                "کراس اور",
                "قفسه سینه دستگاه",
            ],
            "beginner_friendly": ["پرس سینه دستگاه"],
            "professional_friendly": ["پرس سینه هالتر"],
            "forbidden_exercises": [],
            "sort_order": 0,
        },
        {
            "group": "زیربغل",
            "favorite_exercises": ["لت سیم کش", "روئینگ هالتر", "بارفیکس کمکی", "پول اور"],
            "beginner_friendly": ["لت سیم کش"],
            "professional_friendly": ["روئینگ هالتر"],
            "forbidden_exercises": [],
            "sort_order": 1,
        },
        {
            "group": "پا",
            "favorite_exercises": [
                "اسکوات",
                "پرس پا",
                "ددلیفت رومانیایی",
                "جلوپا دستگاه",
                "ساق ایستاده",
            ],
            "beginner_friendly": ["پرس پا"],
            "professional_friendly": ["اسکوات"],
            "forbidden_exercises": [],
            "sort_order": 2,
        },
        {
            "group": "سرشانه",
            "favorite_exercises": [
                "پرس سرشانه سنگین",
                "شراگ سنگین",
                "پرس سرشانه دستگاه",
                "نشر جانب دمبل",
                "فیس پول",
            ],
            "beginner_friendly": ["نشر جانب دمبل"],
            "professional_friendly": ["پرس سرشانه دستگاه"],
            "forbidden_exercises": [],
            "sort_order": 3,
        },
        {
            "group": "پشت بازو",
            "favorite_exercises": ["پشت بازو سیم‌کش", "دیپ نیمکت", "پشت بازو دمبل"],
            "beginner_friendly": ["پشت بازو سیم‌کش"],
            "professional_friendly": ["دیپ نیمکت"],
            "forbidden_exercises": [],
            "sort_order": 4,
        },
        {
            "group": "جلو بازو",
            "favorite_exercises": ["جلو بازو دمبل", "جلو بازو هالتر", "چکش دمبل"],
            "beginner_friendly": ["جلو بازو دمبل"],
            "professional_friendly": ["جلو بازو هالتر"],
            "forbidden_exercises": [],
            "sort_order": 5,
        },
        {
            "group": "شکم و اصلاحی",
            "favorite_exercises": ["کرانچ", "پلانک", "زیرشکم پا آویزان"],
            "beginner_friendly": ["کرانچ"],
            "professional_friendly": ["پلانک"],
            "forbidden_exercises": [],
            "sort_order": 6,
        },
    ],
    "general_rules": {
        "extra_notes": "",
        "items": [
            {
                "title": "حرکات اصلی اول برنامه باشند",
                "description": "چندمفصلی اول",
                "category": "ترتیب تمرین",
                "importance": "high",
                "is_active": True,
                "order": 1,
            },
            {
                "title": "شکم آخر جلسه",
                "description": "شکم و اصلاحی آخر",
                "category": "ترتیب تمرین",
                "importance": "high",
                "is_active": True,
                "order": 2,
            },
        ],
    },
}


class SplitParserTests(TestCase):
    def test_parse_arman_day_labels(self):
        self.assertEqual(parse_split_day("سینه و پشت بازو"), ["سینه", "پشت بازو"])
        self.assertEqual(parse_split_day("زیربغل و جلو بازو"), ["زیربغل", "جلو بازو"])
        self.assertEqual(parse_split_day("پا"), ["پا"])
        self.assertEqual(parse_split_day("سرشانه و شکم"), ["سرشانه", "شکم"])
        self.assertEqual(parse_split_day("فول بادی A"), [])

    def test_parse_template_split_length(self):
        days = parse_template_split(
            ["سینه و پشت بازو", "زیربغل و جلو بازو", "پا", "سرشانه و شکم"],
            days_per_week=4,
        )
        self.assertEqual(len(days), 4)
        self.assertEqual(days[0][1], ["سینه", "پشت بازو"])
        with self.assertRaises(ValueError):
            parse_template_split(["سینه"], days_per_week=4)


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class GeneratorQualityTests(APITestCase):
    def setUp(self):
        a = register(self.client, "quality-coach@example.com", full_name="Coach Quality")
        self.tokens = a.data["tokens"]
        self.coach = CoachProfile.objects.get(id=a.data["coach"]["id"])
        replace_coach_rules(self.coach, ARMAN_4DAY_RULES, partial=False)
        self.template = ProgramTemplate.objects.filter(coach=self.coach, days_per_week=4).first()
        self.rule_set = ensure_rule_set(self.coach)
        # Catalog equipment tags for hard-filter tests
        for name, muscle, eq in [
            ("پرس سینه هالتر", "سینه", "هالتر"),
            ("پرس بالا سینه دمبل", "سینه", "دمبل"),
            ("کراس اور", "سینه", "کابل"),
            ("لت سیم کش", "زیربغل", "کابل"),
            ("روئینگ هالتر", "زیربغل", "هالتر"),
            ("اسکوات", "پا", "هالتر"),
            ("پرس پا", "پا", "دستگاه"),
            ("ددلیفت رومانیایی", "پا", "هالتر"),
            ("جلوپا دستگاه", "پا", "دستگاه"),
            ("ساق ایستاده", "پا", "دستگاه"),
            ("پرس سرشانه دستگاه", "سرشانه", "دستگاه"),
            ("نشر جانب دمبل", "سرشانه", "دمبل"),
            ("فیس پول", "سرشانه", "کابل"),
            ("پرس سرشانه سنگین", "سرشانه", "هالتر"),
            ("شراگ سنگین", "سرشانه", "هالتر"),
            ("ددلیفت سنگین", "پا", "هالتر"),
            ("اسکوات سنگین", "پا", "هالتر"),
            ("اسکوات پرشی", "پا", "وزن بدن"),
            ("لانج پرشی", "پا", "وزن بدن"),
            ("پشت بازو سیم‌کش", "پشت بازو", "کابل"),
            ("دیپ نیمکت", "پشت بازو", "وزن بدن"),
            ("جلو بازو دمبل", "جلو بازو", "دمبل"),
            ("کرانچ", "شکم", "وزن بدن"),
            ("پلانک", "شکم", "وزن بدن"),
        ]:
            Exercise.objects.update_or_create(
                coach=self.coach,
                name=name,
                defaults={
                    "primary_muscle": muscle,
                    "equipment": eq,
                    "level": Exercise.Level.ALL,
                    "is_active": True,
                },
            )

    def _mohammad(self, **overrides) -> Student:
        defaults = dict(
            coach=self.coach,
            full_name="محمد طاهری",
            age=27,
            gender=Student.Gender.MALE,
            height_cm=Decimal("182.0"),
            weight_kg=Decimal("86.0"),
            goals={
                "primary_goal": "hypertrophy",
                "muscle_priorities": ["chest", "shoulders", "triceps"],
                "weak_muscles": ["chest", "upper_chest", "triceps"],
                "strong_muscles": ["legs"],
            },
            injuries={
                "has_injury": True,
                "injury_type": "mild_neck",
                "aggravating_movements": ["heavy_shoulder_press"],
                "disallowed_exercises": ["heavy_shrug"],
            },
            equipment={
                "has_barbell": True,
                "has_dumbbell": True,
                "has_machines": True,
                "has_cable": True,
                "has_full_gym": True,
            },
            training_background={"level": "intermediate"},
            training_conditions={"training_days_per_week": 4},
        )
        defaults.update(overrides)
        return Student.objects.create(**defaults)

    def _generate(self, student: Student, **request):
        payload = {
            "program_type": "workout",
            "level": "intermediate",
            "days_per_week": 4,
            **request,
        }
        return gen.generate_document(
            coach=self.coach,
            student=student,
            visit=None,
            template=self.template,
            request=payload,
        )

    def test_template_days_mismatch_raises(self):
        student = self._mohammad()
        with self.assertRaises(ValidationError):
            self._generate(student, days_per_week=3)

    def test_api_days_mismatch(self):
        student = self._mohammad()
        res = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": str(student.id),
                "template_id": str(self.template.id),
                "program_type": "workout",
                "title": "mismatch",
                "level": "intermediate",
                "days_per_week": 3,
            },
            format="json",
            **auth_header(self.tokens),
        )
        self.assertEqual(res.status_code, 400)

    def test_four_day_split_followed(self):
        student = self._mohammad()
        document, _warnings = self._generate(student)
        days = document["training"]["days"]
        self.assertEqual(len(days), 4)
        self.assertEqual(days[0]["targetMuscles"], ["سینه", "پشت بازو"])
        self.assertEqual(days[1]["targetMuscles"], ["زیربغل", "جلو بازو"])
        self.assertEqual(days[2]["targetMuscles"], ["پا"])
        self.assertEqual(days[3]["targetMuscles"], ["سرشانه", "شکم"])
        self.assertEqual(days[0]["title"], "سینه و پشت بازو")

    def test_no_adjacent_injected_muscle_overlap(self):
        """Muscles come only from split — back must not appear on chest day as primary pair via RR."""
        student = self._mohammad()
        document, _ = self._generate(student)
        day0 = document["training"]["days"][0]
        self.assertNotIn("زیربغل", day0["targetMuscles"])
        day1 = document["training"]["days"][1]
        self.assertNotIn("سینه", day1["targetMuscles"])

    def test_no_duplicate_exercise_across_days(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        names = [e["name"] for d in document["training"]["days"] for e in d["exercises"]]
        self.assertEqual(len(names), len(set(names)))

    def test_complete_leg_day_coverage(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        leg_day = document["training"]["days"][2]
        names = " ".join(e["name"] for e in leg_day["exercises"])
        self.assertGreaterEqual(len(leg_day["exercises"]), 3)
        self.assertTrue(any(k in names for k in ("اسکوات", "پرس پا", "لانج")))
        self.assertTrue(any(k in names for k in ("ددلیفت", "رومانی", "پشت پا")))
        self.assertTrue(any("ساق" in e["name"] for e in leg_day["exercises"]))

    def test_arms_and_core_coverage(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        tris = [
            e
            for e in document["training"]["days"][0]["exercises"]
            if e["targetMuscle"] == "پشت بازو"
        ]
        bis = [
            e
            for e in document["training"]["days"][1]["exercises"]
            if e["targetMuscle"] == "جلو بازو"
        ]
        cores = [
            e for e in document["training"]["days"][3]["exercises"] if e["targetMuscle"] == "شکم"
        ]
        back = [
            e for e in document["training"]["days"][1]["exercises"] if e["targetMuscle"] == "زیربغل"
        ]
        self.assertGreaterEqual(len(tris), 2)
        self.assertGreaterEqual(len(bis), 2)
        self.assertGreaterEqual(len(cores), 2)
        self.assertEqual(document["training"]["days"][3]["exercises"][-1]["targetMuscle"], "شکم")
        self.assertGreaterEqual(len(back), 3)

    def test_balanced_session_volume(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        day_sets = [
            sum(int(e["sets"]) for e in day["exercises"]) for day in document["training"]["days"]
        ]
        self.assertTrue(all(12 <= s <= 22 for s in day_sets), day_sets)
        self.assertLessEqual(max(day_sets) - min(day_sets), 8, day_sets)

    def test_chest_capped_with_upper_priority(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        chest = [
            e for e in document["training"]["days"][0]["exercises"] if e["targetMuscle"] == "سینه"
        ]
        self.assertGreaterEqual(len(chest), 3)
        self.assertLessEqual(len(chest), 4)
        self.assertTrue(any("بالا" in e["name"] for e in chest))

    def test_weak_muscle_increased_volume(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        chest = [
            e for e in document["training"]["days"][0]["exercises"] if e["targetMuscle"] == "سینه"
        ]
        legs = document["training"]["days"][2]["exercises"]
        chest_sets = sum(e["sets"] for e in chest)
        leg_sets = sum(e["sets"] for e in legs)
        self.assertGreaterEqual(chest_sets, leg_sets - 2)

    def test_strong_muscle_reduced_volume(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        evidence = document["generator"]["evidence"]
        self.assertIn("پا", evidence["strong_muscles"])
        legs = document["training"]["days"][2]["exercises"]
        chest = [
            e for e in document["training"]["days"][0]["exercises"] if e["targetMuscle"] == "سینه"
        ]
        leg_sets = sum(e["sets"] for e in legs)
        chest_sets = sum(e["sets"] for e in chest)
        self.assertLessEqual(leg_sets, chest_sets)
        self.assertGreaterEqual(len(legs), 3)
        self.assertTrue(all(e["sets"] <= 3 for e in legs))

    def test_injury_overrides_historical_preference(self):
        student = self._mohammad()
        # Prefer forbidden heavy work
        heavy = Exercise.objects.get(coach=self.coach, name="پرس سرشانه سنگین")
        CoachExercisePreference.objects.create(coach=self.coach, exercise=heavy, is_preferred=True)
        document, _ = self._generate(student)
        names = [e["name"] for d in document["training"]["days"] for e in d["exercises"]]
        self.assertNotIn("پرس سرشانه سنگین", names)
        self.assertNotIn("شراگ سنگین", names)
        self.assertNotIn("پرس پشت گردن", names)

    def test_equipment_hard_filtering(self):
        tokens = available_equipment_tokens(
            {
                "has_dumbbell": False,
                "has_barbell": False,
                "has_cable": False,
                "has_machines": False,
                "has_full_gym": False,
            }
        )
        self.assertEqual(tokens, set())

        student = self._mohammad(
            equipment={
                "has_dumbbell": False,
                "has_barbell": False,
                "has_cable": False,
                "has_machines": False,
                "has_full_gym": False,
            }
        )
        document, warnings = self._generate(student)
        names = [e["name"] for d in document["training"]["days"] for e in d["exercises"]]
        for name in names:
            ex = Exercise.objects.filter(coach=self.coach, name=name).first()
            if ex and ex.equipment in {"دمبل", "هالتر", "کابل", "دستگاه"}:
                self.fail(f"equipment leak: {name} ({ex.equipment})")
        evidence = document["generator"]["evidence"]
        self.assertTrue(
            evidence.get("excluded_due_to_equipment")
            or any(w.startswith("missing_exercise_candidates") for w in warnings)
        )

    def test_exercise_bank_usage(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        evidence = document["generator"]["evidence"]
        self.assertGreater(len(evidence["selected_from_coach_bank"]), 0)

    def test_prescription_variation_and_rest_time(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        rests = [e["rest"] for d in document["training"]["days"] for e in d["exercises"]]
        reps = [e["reps"] for d in document["training"]["days"] for e in d["exercises"]]
        for rest in rests:
            digits = "".join(ch for ch in rest if ch.isdigit())
            self.assertIn(int(digits), {60, 75, 90, 120}, rest)
        self.assertGreater(len(set(reps)), 1)
        self.assertFalse(all(r == "۱۰-۱۲" for r in reps))

    def test_superset_representation(self):
        student = self._mohammad()
        document, _ = self._generate(student)
        found_pair = False
        for day in document["training"]["days"]:
            grouped = [e for e in day["exercises"] if e.get("supersetGroupId")]
            if not grouped:
                continue
            found_pair = True
            by_group: dict[str, list] = {}
            for ex in grouped:
                by_group.setdefault(ex["supersetGroupId"], []).append(ex)
            for members in by_group.values():
                self.assertEqual(len(members), 2)
                self.assertEqual(sum(1 for m in members if m.get("supersetWithPrevious")), 1)
                self.assertTrue(all(m.get("supersetPartnerName") for m in members))
        self.assertTrue(found_pair)

    def test_deterministic_output(self):
        student = self._mohammad()
        d1, _ = self._generate(student)
        d2, _ = self._generate(student)
        n1 = [e["name"] for d in d1["training"]["days"] for e in d["exercises"]]
        n2 = [e["name"] for d in d2["training"]["days"] for e in d["exercises"]]
        self.assertEqual(n1, n2)
        r1 = [
            (e["sets"], e["reps"], e["rest"])
            for d in d1["training"]["days"]
            for e in d["exercises"]
        ]
        r2 = [
            (e["sets"], e["reps"], e["rest"])
            for d in d2["training"]["days"]
            for e in d["exercises"]
        ]
        self.assertEqual(r1, r2)

    def test_mohammad_acceptance_scenario(self):
        student = self._mohammad()
        document, _warnings = self._generate(student)
        days = document["training"]["days"]
        self.assertEqual(len(days), 4)
        self.assertEqual(
            [d["targetMuscles"] for d in days],
            [["سینه", "پشت بازو"], ["زیربغل", "جلو بازو"], ["پا"], ["سرشانه", "شکم"]],
        )
        names = [e["name"] for d in days for e in d["exercises"]]
        self.assertEqual(len(names), len(set(names)))
        self.assertNotIn("پرس سرشانه سنگین", names)
        self.assertNotIn("شراگ سنگین", names)
        chest = [e for e in days[0]["exercises"] if e["targetMuscle"] == "سینه"]
        self.assertLessEqual(len(chest), 4)
        self.assertGreaterEqual(len(chest), 3)
        bis = [e for e in days[1]["exercises"] if e["targetMuscle"] == "جلو بازو"]
        self.assertGreaterEqual(len(bis), 2)
        cores = [e for e in days[3]["exercises"] if e["targetMuscle"] == "شکم"]
        self.assertGreaterEqual(len(cores), 2)
        day_sets = [sum(int(e["sets"]) for e in d["exercises"]) for d in days]
        self.assertTrue(all(12 <= s <= 22 for s in day_sets), day_sets)
        self.assertLessEqual(max(day_sets) - min(day_sets), 8, day_sets)
        evidence = document["generator"]["evidence"]
        self.assertGreater(len(evidence["selected_from_coach_bank"]), 0)
        self.assertEqual(days[3]["exercises"][-1]["targetMuscle"], "شکم")

    def test_acceptance_matrix_beginner_3day_no_injury(self):
        """Scenario B: beginner, 3 days, full gym, no injury."""
        beginner = ProgramTemplate.objects.filter(coach=self.coach, days_per_week=3).first()
        self.assertIsNotNone(beginner)
        student = self._mohammad(
            full_name="شاگرد مبتدی",
            goals={"primary_goal": "hypertrophy", "weak_muscles": [], "strong_muscles": []},
            injuries={"has_injury": False},
            training_background={"level": "beginner"},
            training_conditions={"training_days_per_week": 3},
        )
        document, _ = gen.generate_document(
            coach=self.coach,
            student=student,
            visit=None,
            template=beginner,
            request={
                "program_type": "workout",
                "level": "beginner",
                "days_per_week": 3,
            },
        )
        days = document["training"]["days"]
        self.assertEqual(len(days), 3)
        names = [e["name"] for d in days for e in d["exercises"]]
        self.assertEqual(len(names), len(set(names)))
        self.assertTrue(all(d["exercises"] for d in days))

    def test_acceptance_matrix_back_pain(self):
        """Scenario C: intermediate 4-day with back pain."""
        student = self._mohammad(
            injuries={
                "has_injury": True,
                "injury_type": "کمر درد",
                "disallowed_exercises": ["ددلیفت سنگین"],
            }
        )
        document, _ = self._generate(student)
        names = [e["name"] for d in document["training"]["days"] for e in d["exercises"]]
        self.assertEqual(len(document["training"]["days"]), 4)
        self.assertNotIn("ددلیفت سنگین", names)
        self.assertNotIn("اسکوات سنگین", names)

    def test_acceptance_matrix_knee_pain(self):
        """Scenario D: intermediate 4-day with knee pain."""
        student = self._mohammad(
            injuries={
                "has_injury": True,
                "injury_type": "زانو درد",
                "disallowed_exercises": ["اسکوات پرشی"],
            }
        )
        document, _ = self._generate(student)
        names = [e["name"] for d in document["training"]["days"] for e in d["exercises"]]
        self.assertEqual(len(document["training"]["days"]), 4)
        self.assertNotIn("اسکوات پرشی", names)
        self.assertNotIn("لانج پرشی", names)

    def test_acceptance_matrix_limited_equipment(self):
        """Scenario E: limited equipment (dumbbells only)."""
        student = self._mohammad(
            injuries={"has_injury": False},
            equipment={
                "has_dumbbell": True,
                "has_barbell": False,
                "has_cable": False,
                "has_machines": False,
                "has_full_gym": False,
            },
        )
        document, _ = self._generate(student)
        self.assertEqual(len(document["training"]["days"]), 4)
        for day in document["training"]["days"]:
            for ex in day["exercises"]:
                row = Exercise.objects.filter(coach=self.coach, name=ex["name"]).first()
                if row and row.equipment in {"هالتر", "کابل", "دستگاه"}:
                    self.fail(f"equipment leak under limited kit: {ex['name']} ({row.equipment})")

    def test_acceptance_matrix_different_priority_muscle(self):
        """Scenario F: weak/priority back instead of chest."""
        student = self._mohammad(
            injuries={"has_injury": False},
            goals={
                "primary_goal": "hypertrophy",
                "muscle_priorities": ["back", "biceps"],
                "weak_muscles": ["back"],
                "strong_muscles": ["chest"],
            },
        )
        document, _ = self._generate(student)
        days = document["training"]["days"]
        self.assertEqual(len(days), 4)
        evidence = document["generator"]["evidence"]
        weak = " ".join(str(x) for x in evidence.get("weak_muscles") or [])
        self.assertTrue("زیربغل" in weak or "back" in weak.lower() or "زیربغل" in str(evidence))
        back_day = days[1]
        self.assertIn("زیربغل", back_day["targetMuscles"])
        self.assertGreaterEqual(
            len([e for e in back_day["exercises"] if e["targetMuscle"] == "زیربغل"]),
            2,
        )
