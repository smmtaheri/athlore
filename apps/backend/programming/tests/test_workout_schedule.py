from datetime import date

from django.test import SimpleTestCase

from programming.services.workout_schedule import build_workout_schedule


class WorkoutScheduleTests(SimpleTestCase):
    def test_full_period_uses_split_days_for_each_actual_week(self):
        training = {"days": [{"id": f"day-{index}"} for index in range(1, 5)]}

        result = build_workout_schedule(training, date(2026, 10, 1), date(2026, 10, 28))

        self.assertTrue(result["configured"])
        self.assertEqual(len(result["weeks"]), 4)
        self.assertEqual(sum(len(week["sessions"]) for week in result["weeks"]), 16)
        self.assertEqual(
            [item["scheduled_on"] for item in result["weeks"][0]["sessions"]],
            ["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-06"],
        )

    def test_partial_final_week_only_contains_occurrences_inside_program_dates(self):
        training = {"days": [{"id": f"day-{index}"} for index in range(1, 4)]}

        result = build_workout_schedule(training, date(2026, 10, 1), date(2026, 10, 10))

        self.assertEqual([len(week["sessions"]) for week in result["weeks"]], [3, 2])
        self.assertTrue(
            all(
                date.fromisoformat(session["scheduled_on"]) <= date(2026, 10, 10)
                for week in result["weeks"]
                for session in week["sessions"]
            )
        )

    def test_missing_or_invalid_date_range_is_explicitly_unconfigured(self):
        training = {"days": [{"id": "day-1"}]}

        self.assertEqual(
            build_workout_schedule(training, None, None),
            {"version": 1, "configured": False, "weeks": []},
        )
        self.assertFalse(
            build_workout_schedule(training, date(2026, 10, 10), date(2026, 10, 1))[
                "configured"
            ]
        )
