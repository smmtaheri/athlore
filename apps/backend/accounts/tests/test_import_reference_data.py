from __future__ import annotations

from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from accounts.models import (
    CoachNutritionTemplate,
    CoachProfile,
    CoachSupplementTemplate,
    Exercise,
    ExerciseAlias,
    ExerciseBankGroup,
    ExerciseHistoricalUsage,
)
from accounts.services import create_coach_account

DATASET = "arman"
COACH_EMAIL = "arman-import@example.com"

EXPECTED_CATEGORIES = {
    "سرشانه و کتف",
    "سینه",
    "زیربغل",
    "جلوبازو",
    "پشت‌بازو",
    "پا",
    "شکم و اصلاحی",
}


def _create_coach(email: str, phone: str) -> CoachProfile:
    _, coach = create_coach_account(
        email=email,
        password="SecurePass123!",
        full_name="Test Coach",
        phone_number=phone,
    )
    return coach


class ImportReferenceDataCommandTests(TestCase):
    def setUp(self):
        self.coach = _create_coach(COACH_EMAIL, "09121110101")

    def _run(self, **kwargs) -> str:
        out = StringIO()
        call_command(
            "import_coach_reference_data",
            coach_email=COACH_EMAIL,
            dataset=DATASET,
            stdout=out,
            **kwargs,
        )
        return out.getvalue()

    def _line(self, output: str, prefix: str) -> str:
        matches = [line for line in output.splitlines() if line.startswith(prefix)]
        self.assertTrue(matches, f"No line starting with {prefix!r} in output:\n{output}")
        return matches[0]

    # -- coach must already exist --------------------------------------------------

    def test_missing_coach_raises_and_writes_nothing(self):
        with self.assertRaises(Exception):
            call_command(
                "import_coach_reference_data",
                coach_email="does-not-exist@example.com",
                dataset=DATASET,
                stdout=StringIO(),
            )
        self.assertEqual(Exercise.objects.count(), 0)

    # -- dry-run ---------------------------------------------------------------------

    def test_dry_run_reports_counts_but_writes_nothing(self):
        output = self._run(dry_run=True)
        self.assertIn("Exercises: created=76", output)
        self.assertIn("Aliases: created=117", output)
        self.assertIn("Exercise bank groups: created=7", output)
        self.assertIn("Nutrition templates: created=3", output)
        self.assertIn("Supplement templates: created=1", output)
        self.assertIn("Dry-run: no changes were written.", output)

        self.assertEqual(Exercise.objects.filter(coach=self.coach).count(), 0)
        self.assertEqual(ExerciseAlias.objects.filter(coach=self.coach).count(), 0)
        self.assertEqual(ExerciseBankGroup.objects.filter(coach=self.coach).count(), 0)
        self.assertEqual(ExerciseHistoricalUsage.objects.filter(coach=self.coach).count(), 0)
        self.assertEqual(CoachNutritionTemplate.objects.filter(coach=self.coach).count(), 0)
        self.assertEqual(CoachSupplementTemplate.objects.filter(coach=self.coach).count(), 0)

    # -- idempotent second run --------------------------------------------------------

    def test_import_then_second_run_is_fully_idempotent(self):
        first_output = self._run()
        self.assertIn("Exercises: created=76", first_output)
        self.assertIn("Aliases: created=117", first_output)

        exercise_count = Exercise.objects.filter(coach=self.coach).count()
        alias_count = ExerciseAlias.objects.filter(coach=self.coach).count()
        historical_count = ExerciseHistoricalUsage.objects.filter(coach=self.coach).count()
        bank_group_count = ExerciseBankGroup.objects.filter(coach=self.coach).count()
        self.assertGreater(exercise_count, 0)
        self.assertGreater(alias_count, 0)
        self.assertGreater(historical_count, 0)

        second_output = self._run()
        self.assertIn(
            f"Exercises: created=0 updated=0 skipped={exercise_count} conflicts=0", second_output
        )
        self.assertIn(
            f"Aliases: created=0 updated=0 skipped={alias_count} conflicts=0", second_output
        )
        self.assertIn(
            f"Historical usage rows: created=0 updated=0 skipped={historical_count} conflicts=0",
            second_output,
        )
        self.assertIn(
            "Nutrition templates: created=0 updated=0 skipped=3 conflicts=0", second_output
        )
        self.assertIn(
            "Supplement templates: created=0 updated=0 skipped=1 conflicts=0", second_output
        )

        self.assertEqual(Exercise.objects.filter(coach=self.coach).count(), exercise_count)
        self.assertEqual(ExerciseAlias.objects.filter(coach=self.coach).count(), alias_count)
        self.assertEqual(
            ExerciseHistoricalUsage.objects.filter(coach=self.coach).count(), historical_count
        )
        self.assertEqual(
            ExerciseBankGroup.objects.filter(coach=self.coach).count(), bank_group_count
        )
        self.assertEqual(CoachNutritionTemplate.objects.filter(coach=self.coach).count(), 3)
        self.assertEqual(CoachSupplementTemplate.objects.filter(coach=self.coach).count(), 1)

    # -- alias dedup -------------------------------------------------------------------

    def test_aliases_are_deduplicated_per_coach(self):
        self._run()
        aliases = list(
            ExerciseAlias.objects.filter(coach=self.coach).values_list("alias", flat=True)
        )
        self.assertEqual(len(aliases), len(set(aliases)), "Aliases must be unique per coach.")

        canonical_names = set(
            Exercise.objects.filter(coach=self.coach).values_list("name", flat=True)
        )
        self.assertTrue(
            canonical_names.isdisjoint(set(aliases)),
            "A canonical exercise name must never also appear as someone else's alias.",
        )

    def test_alias_conflict_with_existing_different_exercise_is_not_overwritten(self):
        unrelated = Exercise.objects.create(
            coach=self.coach, name="حرکت آزمایشی نامرتبط", primary_muscle="متفرقه"
        )
        ExerciseAlias.objects.create(coach=self.coach, exercise=unrelated, alias="پرس شانه هالتر")

        output = self._run()
        alias_line = self._line(output, "Aliases:")
        self.assertIn("conflicts=1", alias_line)

        # The pre-existing alias -> exercise mapping must be untouched.
        alias_row = ExerciseAlias.objects.get(coach=self.coach, alias="پرس شانه هالتر")
        self.assertEqual(alias_row.exercise_id, unrelated.id)

    # -- ownership ----------------------------------------------------------------------

    def test_import_only_affects_selected_coach(self):
        other_coach = _create_coach("other-coach@example.com", "09121110102")
        self._run()

        self.assertGreater(Exercise.objects.filter(coach=self.coach).count(), 0)
        self.assertEqual(Exercise.objects.filter(coach=other_coach).count(), 0)
        self.assertEqual(ExerciseAlias.objects.filter(coach=other_coach).count(), 0)
        self.assertEqual(ExerciseBankGroup.objects.filter(coach=other_coach).count(), 0)
        self.assertEqual(ExerciseHistoricalUsage.objects.filter(coach=other_coach).count(), 0)
        self.assertEqual(CoachNutritionTemplate.objects.filter(coach=other_coach).count(), 0)
        self.assertEqual(CoachSupplementTemplate.objects.filter(coach=other_coach).count(), 0)

    # -- bank groups --------------------------------------------------------------------

    def test_bank_groups_created_for_every_category(self):
        self._run()
        actual = set(
            ExerciseBankGroup.objects.filter(coach=self.coach).values_list("group_name", flat=True)
        )
        self.assertEqual(actual, EXPECTED_CATEGORIES)
        chest = ExerciseBankGroup.objects.get(coach=self.coach, group_name="سینه")
        self.assertIn("پرس سینه تخت با هالتر", chest.favorite_exercises)

    # -- replace flag --------------------------------------------------------------------

    def test_replace_flag_recreates_nutrition_and_supplement_templates(self):
        self._run()
        before_nutrition = {
            t.name: t.id for t in CoachNutritionTemplate.objects.filter(coach=self.coach)
        }
        before_supplement = {
            t.name: t.id for t in CoachSupplementTemplate.objects.filter(coach=self.coach)
        }

        self._run(replace=True)

        after_nutrition = {
            t.name: t.id for t in CoachNutritionTemplate.objects.filter(coach=self.coach)
        }
        after_supplement = {
            t.name: t.id for t in CoachSupplementTemplate.objects.filter(coach=self.coach)
        }
        self.assertEqual(set(before_nutrition), set(after_nutrition))
        self.assertTrue(
            all(before_nutrition[name] != after_nutrition[name] for name in before_nutrition)
        )
        self.assertEqual(set(before_supplement), set(after_supplement))

    # -- newly-created rows never bypass coach review ------------------------------------

    def test_imported_templates_require_coach_review_before_auto_select(self):
        self._run()
        for template in CoachNutritionTemplate.objects.filter(coach=self.coach):
            self.assertTrue(template.needs_coach_review)
            self.assertFalse(template.is_eligible_for_auto_select)
        for template in CoachSupplementTemplate.objects.filter(coach=self.coach):
            self.assertTrue(template.needs_coach_review)
            self.assertFalse(template.is_eligible_for_auto_select)
