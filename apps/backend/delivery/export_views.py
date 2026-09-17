"""On-demand PDF export HTTP views."""

from __future__ import annotations

from django.http import HttpResponse
from rest_framework.views import APIView

from common.http import content_disposition_attachment
from common.permissions import IsAuthenticatedCoach, get_request_coach
from delivery.services.export_pdfs import build_coach_rules_pdf, build_student_profile_pdf
from students.services import get_student_for_coach


class CoachRulesPdfExportView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        pdf_bytes, filename = build_coach_rules_pdf(coach=coach)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = content_disposition_attachment(
            filename, fallback="coach-rules.pdf"
        )
        response["Content-Length"] = str(len(pdf_bytes))
        return response


class StudentProfilePdfExportView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id):
        coach = get_request_coach(request)
        student = get_student_for_coach(coach, student_id)
        pdf_bytes, filename = build_student_profile_pdf(student=student, coach=coach)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = content_disposition_attachment(
            filename, fallback="student-profile.pdf"
        )
        response["Content-Length"] = str(len(pdf_bytes))
        return response
