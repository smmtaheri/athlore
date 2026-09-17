"""Coach-owned nutrition and supplement template review endpoints."""

from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.nutrition_models import CoachNutritionTemplate, CoachSupplementTemplate
from common.permissions import IsAuthenticatedCoach, get_request_coach


def _nutrition_payload(template: CoachNutritionTemplate) -> dict:
    return {
        "id": str(template.id),
        "name": template.name,
        "purpose": template.purpose,
        "day_type": template.day_type,
        "status": template.status,
        "needs_coach_review": template.needs_coach_review,
        "is_eligible_for_auto_select": template.is_eligible_for_auto_select,
        "source_document": template.source_document,
        "source_version": template.source_version,
        "updated_at": template.updated_at.isoformat().replace("+00:00", "Z"),
        "meal_slots_count": template.meal_slots.count(),
        "items_needing_review": sum(
            1
            for slot in template.meal_slots.all()
            for option in slot.options.all()
            for item in option.items.all()
            if item.needs_review
        ),
    }


def _supplement_payload(template: CoachSupplementTemplate) -> dict:
    return {
        "id": str(template.id),
        "name": template.name,
        "status": template.status,
        "needs_coach_review": template.needs_coach_review,
        "is_eligible_for_auto_select": template.is_eligible_for_auto_select,
        "source_documents": list(template.source_documents or []),
        "medical_disclaimer": template.medical_disclaimer,
        "updated_at": template.updated_at.isoformat().replace("+00:00", "Z"),
        "items_count": template.items.count(),
    }


class NutritionTemplateDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def patch(self, request, template_id):
        coach = get_request_coach(request)
        template = CoachNutritionTemplate.objects.filter(coach=coach, id=template_id).first()
        if template is None:
            return Response(
                {"error": {"code": "not_found", "message": "یافت نشد.", "details": {}}},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = request.data or {}
        if "needs_coach_review" in data:
            template.needs_coach_review = bool(data["needs_coach_review"])
        if "status" in data:
            status_val = str(data["status"])
            if status_val in {c.value for c in CoachNutritionTemplate.Status}:
                template.status = status_val
        if "is_eligible_for_auto_select" in data:
            template.is_eligible_for_auto_select = bool(data["is_eligible_for_auto_select"])
        if "purpose" in data:
            template.purpose = str(data["purpose"] or "")
        # Auto-eligibility requires reviewed + active.
        if template.is_eligible_for_auto_select and (
            template.needs_coach_review or template.status != CoachNutritionTemplate.Status.ACTIVE
        ):
            template.is_eligible_for_auto_select = False
        template.save()
        return Response(_nutrition_payload(template), status=status.HTTP_200_OK)


class SupplementTemplateDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def patch(self, request, template_id):
        coach = get_request_coach(request)
        template = CoachSupplementTemplate.objects.filter(coach=coach, id=template_id).first()
        if template is None:
            return Response(
                {"error": {"code": "not_found", "message": "یافت نشد.", "details": {}}},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = request.data or {}
        if "needs_coach_review" in data:
            template.needs_coach_review = bool(data["needs_coach_review"])
        if "status" in data:
            status_val = str(data["status"])
            if status_val in {c.value for c in CoachSupplementTemplate.Status}:
                template.status = status_val
        if "is_eligible_for_auto_select" in data:
            template.is_eligible_for_auto_select = bool(data["is_eligible_for_auto_select"])
        if template.is_eligible_for_auto_select and (
            template.needs_coach_review or template.status != CoachSupplementTemplate.Status.ACTIVE
        ):
            template.is_eligible_for_auto_select = False
        template.save()
        return Response(_supplement_payload(template), status=status.HTTP_200_OK)
