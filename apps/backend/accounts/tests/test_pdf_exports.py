from __future__ import annotations

from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.rules_services import replace_coach_rules
from common.testing import auth_header, register

MIN_RULES = {
    "templates": [
        {
            "name": "T1",
            "goal": "g",
            "main_goal": "g",
            "level": "intermediate",
            "days_per_week": 3,
            "intensity": "m",
            "volume": "m",
            "rest_time": "60",
            "split": ["A", "B", "C"],
            "muscle_priority_order": [],
            "special_rules": [],
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "levels": [],
    "injuries": [],
    "muscle_priorities": [],
    "exercise_bank": [],
    "general_rules": {"extra_notes": "یادداشت", "items": []},
}


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class PdfExportApiTests(APITestCase):
    def setUp(self):
        a = register(
            self.client, "pdf-export-a@example.com", full_name="آرمان", phone_number="09126660001"
        )
        b = register(
            self.client, "pdf-export-b@example.com", full_name="B", phone_number="09126660002"
        )
        self.ha = auth_header(a.data["tokens"])
        self.hb = auth_header(b.data["tokens"])
        from accounts.models import CoachProfile

        self.coach_a = CoachProfile.objects.get(id=a.data["coach"]["id"])
        replace_coach_rules(self.coach_a, MIN_RULES)
        stu = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "شاگرد PDF",
                "age": 27,
                "gender": "male",
                "height_cm": "180.0",
                "weight_kg": "80.0",
                "phone_number": "09126660003",
                "goals": {"primary_goal": "hypertrophy"},
                "training_background": {"level": "intermediate"},
            },
            format="json",
            **self.ha,
        )
        self.assertEqual(stu.status_code, 201, stu.data)
        self.student_id = stu.data["id"]

    @patch("delivery.services.export_pdfs.render_html_to_pdf", return_value=b"%PDF-1.4 mock")
    def test_coach_rules_pdf(self, _mock_pdf):
        res = self.client.get("/api/v1/me/coach-rules/pdf/", **self.ha)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertIn("attachment", res["Content-Disposition"])
        self.assertIn("filename*=UTF-8''", res["Content-Disposition"])
        self.assertTrue(res.content.startswith(b"%PDF"))

    @patch("delivery.services.export_pdfs.render_html_to_pdf", return_value=b"%PDF-1.4 mock")
    def test_student_profile_pdf_ownership(self, _mock_pdf):
        ok = self.client.get(f"/api/v1/students/{self.student_id}/profile.pdf", **self.ha)
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok["Content-Type"], "application/pdf")

        denied = self.client.get(f"/api/v1/students/{self.student_id}/profile.pdf", **self.hb)
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)
