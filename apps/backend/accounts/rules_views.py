from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rules_services
from accounts.models import Exercise, ProgramTemplate
from common.pagination import StandardLimitOffsetPagination
from common.permissions import IsAuthenticatedCoach, get_owned_object, get_request_coach


class CoachRulesAggregateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        return Response(rules_services.get_coach_rules_aggregate(coach))

    def put(self, request):
        coach = get_request_coach(request)
        data = rules_services.replace_coach_rules(coach, request.data, partial=False)
        return Response(data)

    def patch(self, request):
        coach = get_request_coach(request)
        data = rules_services.replace_coach_rules(coach, request.data, partial=True)
        return Response(data)


class ProgramTemplateListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request):
        coach = get_request_coach(request)
        qs = ProgramTemplate.objects.filter(coach=coach, is_archived=False).order_by(
            "sort_order", "name"
        )
        level = request.query_params.get("level")
        if level:
            qs = qs.filter(level=level)
        active = request.query_params.get("is_active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() in {"1", "true", "yes"})
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(goal__icontains=search))
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            [rules_services.serialize_template(t) for t in page]
        )

    def post(self, request):
        coach = get_request_coach(request)
        template = rules_services.create_template(coach, request.data)
        return Response(
            rules_services.serialize_template(template),
            status=status.HTTP_201_CREATED,
        )


class ProgramTemplateDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, template_id):
        coach = get_request_coach(request)
        template = get_owned_object(ProgramTemplate.objects.all(), coach=coach, pk=template_id)
        return Response(rules_services.serialize_template(template))

    def patch(self, request, template_id):
        coach = get_request_coach(request)
        template = get_owned_object(ProgramTemplate.objects.all(), coach=coach, pk=template_id)
        template = rules_services.update_template(template, request.data)
        return Response(rules_services.serialize_template(template))

    def delete(self, request, template_id):
        coach = get_request_coach(request)
        template = get_owned_object(ProgramTemplate.objects.all(), coach=coach, pk=template_id)
        rules_services.delete_template(template)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExerciseListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request):
        coach = get_request_coach(request)
        qs = Exercise.objects.filter(coach=coach).prefetch_related("preferences")
        include_archived = (request.query_params.get("include_archived") or "").lower() in {
            "1",
            "true",
            "yes",
        }
        if not include_archived:
            qs = qs.filter(is_archived=False)
        muscle = request.query_params.get("primary_muscle") or request.query_params.get("muscle")
        if muscle:
            qs = qs.filter(primary_muscle__icontains=muscle)
        level = request.query_params.get("level")
        if level:
            qs = qs.filter(level=level)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(primary_muscle__icontains=search)
                | Q(equipment__icontains=search)
            )
        preferred = request.query_params.get("is_preferred")
        if preferred is not None:
            flag = preferred.lower() in {"1", "true", "yes"}
            qs = qs.filter(preferences__coach=coach, preferences__is_preferred=flag)
        qs = qs.order_by("primary_muscle", "name").distinct()
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            [rules_services.serialize_exercise(ex) for ex in page]
        )

    def post(self, request):
        coach = get_request_coach(request)
        exercise = rules_services.create_exercise(coach, request.data)
        return Response(
            rules_services.serialize_exercise(exercise),
            status=status.HTTP_201_CREATED,
        )


class ExerciseDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, exercise_id):
        coach = get_request_coach(request)
        exercise = get_owned_object(Exercise.objects.all(), coach=coach, pk=exercise_id)
        return Response(rules_services.serialize_exercise(exercise))

    def patch(self, request, exercise_id):
        coach = get_request_coach(request)
        exercise = get_owned_object(Exercise.objects.all(), coach=coach, pk=exercise_id)
        exercise = rules_services.update_exercise(exercise, request.data)
        return Response(rules_services.serialize_exercise(exercise))

    def delete(self, request, exercise_id):
        coach = get_request_coach(request)
        exercise = get_owned_object(Exercise.objects.all(), coach=coach, pk=exercise_id)
        rules_services.archive_exercise(exercise)
        return Response(status=status.HTTP_204_NO_CONTENT)
