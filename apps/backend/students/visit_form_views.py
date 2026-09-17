"""Visit form template API views."""

from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsAuthenticatedCoach, get_request_coach
from students import visit_form_services as svc


class VisitFormTemplateListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        items = [svc.serialize_template(t) for t in svc.list_templates(coach)]
        return Response({"count": len(items), "results": items})

    def post(self, request):
        coach = get_request_coach(request)
        template = svc.create_template(coach, request.data)
        return Response(svc.serialize_template(template), status=status.HTTP_201_CREATED)


class VisitFormTemplateDefaultView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        template = svc.get_default_template(coach)
        if template is None:
            return Response(
                {"detail": "No visit form template.", "template": None},
                status=status.HTTP_200_OK,
            )
        return Response(svc.serialize_template(template))


class VisitFormTemplateDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, template_id):
        coach = get_request_coach(request)
        template = svc.get_template_for_coach(coach, template_id)
        return Response(svc.serialize_template(template))

    def patch(self, request, template_id):
        coach = get_request_coach(request)
        template = svc.get_template_for_coach(coach, template_id)
        template = svc.update_template(template, request.data)
        return Response(svc.serialize_template(template))


class VisitFormTemplateSetDefaultView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, template_id):
        coach = get_request_coach(request)
        template = svc.get_template_for_coach(coach, template_id)
        template = svc.set_default_template(coach, template)
        return Response(svc.serialize_template(template))


class VisitFormTemplateDuplicateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, template_id):
        coach = get_request_coach(request)
        template = svc.get_template_for_coach(coach, template_id)
        new_key = request.data.get("key") if isinstance(request.data, dict) else None
        dup = svc.duplicate_template(coach, template, new_key=new_key)
        return Response(svc.serialize_template(dup), status=status.HTTP_201_CREATED)
