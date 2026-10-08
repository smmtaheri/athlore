"""Coach-scoped supplement catalog and non-persisting proposal API."""

from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.supplement_catalog import (
    catalog,
    entry_payload,
    propose,
    save_entry,
    snapshot_selection,
)
from accounts.supplement_models import SupplementDose, SupplementGoal
from common.pagination import StandardLimitOffsetPagination
from common.permissions import IsAuthenticatedCoach, get_request_coach


class SupplementOptionsView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        return Response(
            {
                "goals": [
                    {"id": str(goal.id), "name": goal.name}
                    for goal in SupplementGoal.objects.filter(coach=coach)
                ],
                **{
                    name: [{"key": key, "name": label} for key, label in choices]
                    for name, choices in [
                        ("units", SupplementDose.Unit.choices),
                        ("timings", SupplementDose.Timing.choices),
                        ("days", SupplementDose.Days.choices),
                    ]
                },
            }
        )


class GoalSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)


class SupplementGoalView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request):
        coach = get_request_coach(request)
        serializer = GoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["name"]
        if SupplementGoal.objects.filter(coach=coach, name=name).exists():
            raise ValidationError("نام هدف تکراری است.")
        goal = SupplementGoal.objects.create(coach=coach, name=name)
        return Response({"id": str(goal.id), "name": goal.name}, status=201)


class SupplementGoalDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def patch(self, request, goal_id):
        coach = get_request_coach(request)
        goal = get_object_or_404(SupplementGoal, coach=coach, id=goal_id)
        serializer = GoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["name"]
        if SupplementGoal.objects.filter(coach=coach, name=name).exclude(id=goal.id).exists():
            raise ValidationError("نام هدف تکراری است.")
        goal.name = name
        goal.save(update_fields=["name"])
        return Response({"id": str(goal.id), "name": goal.name})

    def delete(self, request, goal_id):
        goal = get_object_or_404(SupplementGoal, coach=get_request_coach(request), id=goal_id)
        if goal.supplementcatalogentry_set.exists():
            raise ValidationError("ابتدا اتصال این هدف به مکمل‌ها را بردارید.")
        goal.delete()
        return Response(status=204)


class SupplementCatalogListView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        qs = catalog(get_request_coach(request)).filter(is_archived=False)
        if request.query_params.get("active") == "true":
            qs = qs.filter(is_active=True)
        if goal := request.query_params.get("goal"):
            goal = serializers.UUIDField().run_validation(goal)
            qs = qs.filter(goals__id=goal)
        if search := request.query_params.get("search"):
            from django.db.models import Q

            qs = qs.filter(
                Q(name__icontains=search)
                | Q(name_en__icontains=search)
                | Q(category__icontains=search)
            )
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([entry_payload(entry) for entry in page])

    def post(self, request):
        return Response(
            entry_payload(save_entry(get_request_coach(request), request.data)), status=201
        )


class SupplementCatalogDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, entry_id):
        return Response(
            entry_payload(get_object_or_404(catalog(get_request_coach(request)), id=entry_id))
        )

    def put(self, request, entry_id):
        coach = get_request_coach(request)
        entry = get_object_or_404(catalog(coach), id=entry_id, is_archived=False)
        return Response(entry_payload(save_entry(coach, request.data, entry)))

    def delete(self, request, entry_id):
        entry = get_object_or_404(catalog(get_request_coach(request)), id=entry_id)
        entry.is_archived = True
        entry.is_active = False
        entry.save(update_fields=["is_archived", "is_active", "updated_at"])
        return Response(status=204)


class SupplementProposalView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request):
        return Response(propose(get_request_coach(request), request.data))


class SupplementPrescriptionView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request):
        from students.models import Student

        coach = get_request_coach(request)
        student_field = serializers.UUIDField()
        student_id = student_field.run_validation(request.data.get("student_id"))
        student = get_object_or_404(Student, coach=coach, id=student_id)
        items, evidence = snapshot_selection(coach, student, request.data.get("selection", {}))
        return Response({"items": items, "evidence": evidence})
