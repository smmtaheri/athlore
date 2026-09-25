from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rules_services
from accounts.models import CoachTechnique, Exercise, MuscleRegion, MuscleTaxonomy, ProgramTemplate
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
        qs = Exercise.objects.filter(coach=coach).prefetch_related(
            "preferences",
            "aliases",
            "muscle_targets__muscle",
            "muscle_targets__region",
            "suitable_level_rows",
            "equipment_rows__equipment",
        )
        include_archived = (request.query_params.get("include_archived") or "").lower() in {
            "1",
            "true",
            "yes",
        }
        if not include_archived:
            qs = qs.filter(is_archived=False)
        muscle = request.query_params.get("primary_muscle") or request.query_params.get("muscle")
        if muscle:
            qs = qs.filter(
                Q(primary_muscle__icontains=muscle)
                | Q(muscle_targets__muscle__key=muscle)
                | Q(muscle_targets__muscle__name__icontains=muscle)
            )
        region = request.query_params.get("region") or request.query_params.get("region_key")
        if region:
            if ":" in region:
                muscle_key, region_key = region.split(":", 1)
                qs = qs.filter(
                    muscle_targets__muscle__key=muscle_key,
                    muscle_targets__region__key=region_key,
                )
            else:
                qs = qs.filter(
                    Q(muscle_targets__region__key=region)
                    | Q(muscle_targets__region__name__icontains=region)
                )
        level = request.query_params.get("level")
        if level:
            qs = qs.filter(Q(level=level) | Q(suitable_level_rows__level=level))
        equipment = request.query_params.get("equipment") or request.query_params.get(
            "equipment_key"
        )
        if equipment:
            qs = qs.filter(
                Q(equipment__icontains=equipment)
                | Q(equipment_rows__equipment__key=equipment)
                | Q(equipment_rows__equipment__name__icontains=equipment)
            )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(name_en__icontains=search)
                | Q(primary_muscle__icontains=search)
                | Q(equipment__icontains=search)
                | Q(aliases__alias__icontains=search)
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


class ExerciseTaxonomyView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        get_request_coach(request)
        include_inactive = (request.query_params.get("include_inactive") or "").lower() in {
            "1",
            "true",
            "yes",
        }
        return Response(rules_services.serialize_taxonomy(include_inactive=include_inactive))


class MuscleTaxonomyListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request):
        get_request_coach(request)
        muscle = rules_services.create_muscle_taxonomy(request.data)
        return Response(rules_services.serialize_muscle(muscle), status=status.HTTP_201_CREATED)


class MuscleTaxonomyDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def patch(self, request, muscle_id):
        get_request_coach(request)
        muscle = get_object_or_404(MuscleTaxonomy, pk=muscle_id)
        muscle = rules_services.update_muscle_taxonomy(muscle, request.data)
        return Response(rules_services.serialize_muscle(muscle))

    def delete(self, request, muscle_id):
        get_request_coach(request)
        muscle = get_object_or_404(MuscleTaxonomy, pk=muscle_id)
        muscle = rules_services.update_muscle_taxonomy(muscle, {"is_active": False})
        return Response(rules_services.serialize_muscle(muscle))


class MuscleRegionListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, muscle_id):
        get_request_coach(request)
        muscle = get_object_or_404(MuscleTaxonomy, pk=muscle_id)
        region = rules_services.create_muscle_region(muscle, request.data)
        return Response(
            rules_services.serialize_muscle_region(region), status=status.HTTP_201_CREATED
        )


class MuscleRegionDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def patch(self, request, region_id):
        get_request_coach(request)
        region = get_object_or_404(MuscleRegion.objects.select_related("muscle"), pk=region_id)
        region = rules_services.update_muscle_region(region, request.data)
        return Response(rules_services.serialize_muscle_region(region))

    def delete(self, request, region_id):
        get_request_coach(request)
        region = get_object_or_404(MuscleRegion.objects.select_related("muscle"), pk=region_id)
        region = rules_services.update_muscle_region(region, {"is_active": False})
        return Response(rules_services.serialize_muscle_region(region))


class TrainingTechniqueListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        return Response(rules_services.get_coach_techniques(coach))

    def post(self, request):
        coach = get_request_coach(request)
        config = rules_services.create_coach_technique(coach, request.data)
        return Response(
            rules_services.serialize_coach_technique(config),
            status=status.HTTP_201_CREATED,
        )


class TrainingTechniqueDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, technique_id):
        coach = get_request_coach(request)
        config = get_owned_object(
            CoachTechnique.objects.select_related("base_technique"), coach=coach, pk=technique_id
        )
        return Response(rules_services.serialize_coach_technique(config))

    def patch(self, request, technique_id):
        coach = get_request_coach(request)
        config = get_owned_object(
            CoachTechnique.objects.select_related("base_technique"), coach=coach, pk=technique_id
        )
        config = rules_services.update_coach_technique(config, request.data)
        return Response(rules_services.serialize_coach_technique(config))

    def delete(self, request, technique_id):
        coach = get_request_coach(request)
        config = get_owned_object(CoachTechnique.objects.all(), coach=coach, pk=technique_id)
        rules_services.delete_coach_technique(config)
        return Response(status=status.HTTP_204_NO_CONTENT)
