from copy import deepcopy

from django.template.loader import render_to_string
from django.test import SimpleTestCase

from delivery.services.render import _pdf_exercise_rows


class WorkoutPdfRowTests(SimpleTestCase):
    def test_prescription_digits_are_ascii_without_changing_the_source(self):
        exercises = [
            {
                "name": "فلای دستگاه",
                "sets": "۲",
                "reps": "۸ تا ۱۵",
                "rest": "٩٠ ثانیه",
                "tempo": "۳-۱-۱",
                "rpe": "RIR ٢",
            }
        ]
        original = deepcopy(exercises)
        member = _pdf_exercise_rows(exercises)[0]["members"][0]
        self.assertEqual(member["prescription"], "2 ست × 8 تا 15")
        self.assertEqual(member["rest"], "90 ثانیه")
        self.assertEqual(member["tempo"], "3-1-1")
        self.assertEqual(member["effort"], "RIR 2")
        self.assertEqual(exercises, original)

    def test_per_set_and_group_prescriptions_normalize_both_digit_scripts(self):
        rows = _pdf_exercise_rows(
            [
                {
                    "name": "حرکت اول",
                    "sets": "۳",
                    "reps": "۱۲",
                    "prescription": {"set_plan": [{"set": "۱", "reps_text": "١٢"}]},
                    "supersetGroupId": "pair",
                    "supersetRestBetweenSeconds": "۰",
                    "supersetRestAfterSeconds": "٩٠",
                },
                {
                    "name": "حرکت دوم",
                    "sets": "٣",
                    "reps": "۱۰",
                    "supersetGroupId": "pair",
                },
                {
                    "name": "حرکت سوم",
                    "sets": 2,
                    "prescription": {
                        "set_plan": [
                            {"set": "۱", "reps_text": "۱۲"},
                            {"set": "٢", "reps_text": "٨"},
                        ]
                    },
                },
            ]
        )
        self.assertEqual(rows[0]["compact_prescription"], "3 ست × 12-10")
        self.assertEqual(rows[0]["rest_between"], "0 ثانیه بین حرکت‌ها")
        self.assertEqual(rows[0]["rest_after"], "90 ثانیه بعد از گروه")
        self.assertEqual(rows[1]["members"][0]["prescription"], "1: 12 · 2: 8")

    def test_technique_label_is_printed_once_per_group(self):
        exercises = [
            {
                "name": f"حرکت {index}",
                "sets": 3,
                "reps": "۱۲",
                "supersetGroupId": f"pair-{index // 2}",
                "techniques": [{"name": "سوپرست"}],
            }
            for index in range(4)
        ]
        exercises[1]["techniques"].append({"name": "دراپ‌ست"})
        rows = _pdf_exercise_rows(exercises)
        self.assertEqual(rows[0]["techniques"], ["سوپرست", "دراپ‌ست"])
        self.assertEqual(rows[1]["techniques"], ["سوپرست"])
        document = render_to_string(
            "delivery/program_pdf.html",
            {"include_training": True, "workout_pages": [[{"exercise_rows": rows}]]},
        )
        self.assertEqual(document.count("سوپرست"), 2)
        self.assertEqual(document.count("دراپ‌ست"), 1)
        self.assertNotRegex(document, r"[۰-۹٠-٩]")
