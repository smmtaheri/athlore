from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import CoachProfile
from students.models import Student, Visit


class CoachVisitListTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.coach = CoachProfile.objects.create(
            user=get_user_model().objects.create_user(username="visit-list-coach")
        )
        other_coach = CoachProfile.objects.create(
            user=get_user_model().objects.create_user(username="visit-list-other")
        )
        cls.student = Student.objects.create(
            coach=cls.coach,
            full_name="Visit history athlete",
            age=25,
            gender="male",
            height_cm=175,
            weight_kg=75,
        )
        other_student = Student.objects.create(
            coach=other_coach,
            full_name="Other coach athlete",
            age=25,
            gender="male",
            height_cm=175,
            weight_kg=75,
        )
        cls.visits = Visit.objects.bulk_create(
            [
                Visit(
                    coach=cls.coach,
                    student=cls.student,
                    visit_date=date(2026, 9, 1) + timedelta(days=index),
                    current_weight_kg=75,
                    previous_weight_kg=75,
                    status="draft" if index == 24 else "finalized",
                )
                for index in range(25)
            ]
        )
        Visit.objects.create(
            coach=other_coach,
            student=other_student,
            visit_date=date(2026, 10, 1),
            current_weight_kg=75,
            previous_weight_kg=75,
            status="finalized",
        )

    def setUp(self):
        self.client.force_authenticate(self.coach.user)

    def test_pagination_includes_repeat_visits_and_drafts_without_other_coach_data(self):
        first = self.client.get("/api/v1/visits/?limit=20")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["count"], 25)
        self.assertEqual(len(first.data["results"]), 20)
        self.assertEqual(first.data["results"][0]["id"], str(self.visits[-1].id))
        self.assertEqual(first.data["results"][0]["status"], "draft")
        self.assertTrue(
            all(row["student_name"] == self.student.full_name for row in first.data["results"])
        )
        second = self.client.get("/api/v1/visits/?limit=20&offset=20")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len(second.data["results"]), 5)
        self.assertEqual(second.data["results"][-1]["id"], str(self.visits[0].id))
        first_ids = {row["id"] for row in first.data["results"]}
        self.assertFalse(first_ids.intersection(row["id"] for row in second.data["results"]))

    def test_status_search_and_ordering_are_applied_on_server(self):
        response = self.client.get("/api/v1/visits/?status=draft&search=history")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        response = self.client.get("/api/v1/visits/?search=Other")
        self.assertEqual(response.data["count"], 0)
        Visit.objects.filter(pk=self.visits[0].pk).update(created_at="2026-12-01T00:00:00Z")
        response = self.client.get("/api/v1/visits/?ordering=-created_at")
        self.assertEqual(response.data["results"][0]["id"], str(self.visits[0].id))
        for query in ("status=unknown", "ordering=student__coach"):
            self.assertEqual(self.client.get(f"/api/v1/visits/?{query}").status_code, 400)

    def test_dashboard_returns_ten_recent_visits_for_same_student(self):
        response = self.client.get("/api/v1/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["latest_visits"]), 10)
        self.assertEqual(len(response.data["latest_visit_entries"]), 10)
        self.assertEqual(response.data["latest_visits"][0]["id"], str(self.visits[-2].id))
        self.assertNotIn("draft", [row["status"] for row in response.data["latest_visits"]])

    def test_anonymous_and_non_coach_cannot_read_history(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/visits/").status_code, 401)
        user = get_user_model().objects.create_user(username="visit-list-non-coach")
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/v1/visits/").status_code, 403)
