from django.db import transaction
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ProgramTemplate
from common.permissions import (
    IsAuthenticatedCoach,
    IsAuthenticatedStudent,
    get_request_coach,
    get_request_student,
)
from programming.models import WorkoutSession
from programming.services import programs
from programming.services.preparation import prepare_from_visit, validate_settings
from programming.services.regeneration import regenerate
from programming.services.workouts import save_progress, serialize_progress, workout_version


class PrepareVisitProgramView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, visit_id):
        program, run = prepare_from_visit(
            get_request_coach(request),
            request.user,
            visit_id,
            request.data.get("operation_key"),
            request.data.get("section_methods"),
        )
        return Response(
            {
                "program": programs.serialize_program_detail(program),
                "generation_run_id": str(run.id),
            }
        )


class RegenerateProgramView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, program_id):
        return Response(
            programs.serialize_program_detail(
                regenerate(get_request_coach(request), program_id, request.data)
            )
        )


class ProgramDefaultsView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        settings = dict(coach.program_defaults or {})
        student_id = request.query_params.get("student_id")
        if student_id:
            student_id = serializers.UUIDField().run_validation(student_id)
            previous = (
                programs.programs_for_coach(coach)
                .filter(student_id=student_id, active_version__isnull=False)
                .order_by("-updated_at")
                .first()
            )
            if previous and previous.active_version.generation_run_id:
                saved = previous.active_version.generation_run.request or {}
                settings.update(
                    {
                        key: saved[key]
                        for key in (
                            "training_systems",
                            "exercise_variety",
                            "duration_weeks",
                            "session_muscles",
                            "template_id",
                        )
                        if key in saved
                    }
                )
        template_id = settings.get("template_id")
        if template_id:
            try:
                template_id = serializers.UUIDField().run_validation(template_id)
            except serializers.ValidationError:
                settings.pop("template_id", None)
            else:
                if not ProgramTemplate.objects.filter(
                    pk=template_id, coach=coach, is_active=True, is_archived=False
                ).exists():
                    settings.pop("template_id", None)
        return Response(settings)

    def put(self, request):
        coach = get_request_coach(request)
        coach.program_defaults = validate_settings(request.data)
        coach.save(update_fields=["program_defaults", "updated_at"])
        return Response(coach.program_defaults)


class WorkoutProgressView(APIView):
    permission_classes = [IsAuthenticatedStudent]

    def get(self, request, program_id):
        student = get_request_student(request)
        version = workout_version(student, program_id)
        rows = WorkoutSession.objects.filter(student=student, version=version)
        return Response(
            {"version_id": str(version.id), "sessions": [serialize_progress(row) for row in rows]}
        )

    @transaction.atomic
    def put(self, request, program_id):
        return Response(save_progress(get_request_student(request), program_id, request.data))
