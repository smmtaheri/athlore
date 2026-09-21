from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardLimitOffsetPagination
from common.permissions import (
    IsAuthenticatedCoach,
    IsAuthenticatedStudent,
    get_request_coach,
    get_request_student,
)
from programming.models import GenerationRun
from programming.services import programs as program_services


class ProgramListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request):
        coach = get_request_coach(request)
        qs = program_services.programs_for_coach(coach)
        qs = program_services.filter_programs(qs, request.query_params)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            [program_services.serialize_program_summary(p) for p in page]
        )

    def post(self, request):
        coach = get_request_coach(request)
        data = request.data
        program = program_services.create_empty_draft(
            coach,
            student_id=data.get("student_id"),
            title=data.get("title") or "",
            program_type=data.get("program_type") or "complete",
            date_range_label=data.get("date_range_label") or "",
            date_range_start=data.get("date_range_start"),
            date_range_end=data.get("date_range_end"),
        )
        return Response(
            program_services.serialize_program_detail(program),
            status=status.HTTP_201_CREATED,
        )


class ProgramGenerateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request):
        coach = get_request_coach(request)
        program, run = program_services.generate_program(coach, request.data)
        return Response(
            {
                "generation_run_id": str(run.id),
                "generator_version": run.engine,
                "warnings": list(run.warnings or []),
                "program": program_services.serialize_program_detail(program),
            },
            status=status.HTTP_201_CREATED,
        )


class ProgramDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, program_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        return Response(program_services.serialize_program_detail(program))

    def patch(self, request, program_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        program = program_services.update_program_lineage(program, request.data)
        return Response(program_services.serialize_program_detail(program))

    def delete(self, request, program_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        program_services.delete_program(program)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProgramArchiveView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, program_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        program = program_services.archive_program(program)
        return Response(program_services.serialize_program_summary(program))


class ProgramActivateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, program_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        version_id = request.data.get("version_id")
        if not version_id:
            return Response(
                {
                    "error": {
                        "code": "validation_error",
                        "message": "version_id required",
                        "details": {},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        program = program_services.activate_version(program, version_id)
        return Response(program_services.serialize_program_summary(program))


class ProgramVersionListView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, program_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        versions = program.versions.order_by("-version_number")
        return Response([program_services.serialize_version_summary(v) for v in versions])


class ProgramVersionDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, program_id, version_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        version = program_services.get_version_for_coach(coach, program, version_id)
        return Response(program_services.serialize_version_detail(version))

    def patch(self, request, program_id, version_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        version = program_services.get_version_for_coach(coach, program, version_id)
        version = program_services.update_draft_version(version, request.data)
        return Response(program_services.serialize_version_detail(version))


class ProgramVersionFinalizeView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, program_id, version_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        version = program_services.get_version_for_coach(coach, program, version_id)
        version = program_services.finalize_version(version, actor=request.user)
        return Response(program_services.serialize_version_detail(version))


class ProgramVersionNewVersionView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, program_id, version_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        version = program_services.get_version_for_coach(coach, program, version_id)
        new_version = program_services.create_new_version(version)
        program.refresh_from_db()
        detail = program_services.serialize_program_detail(program)
        detail["current_draft"] = program_services.serialize_version_detail(new_version)
        return Response(detail, status=status.HTTP_201_CREATED)


class ProgramVersionDuplicateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, program_id, version_id):
        coach = get_request_coach(request)
        program = program_services.get_program_for_coach(coach, program_id)
        version = program_services.get_version_for_coach(coach, program, version_id)
        new_program = program_services.duplicate_program(version)
        return Response(
            program_services.serialize_program_detail(new_program),
            status=status.HTTP_201_CREATED,
        )


class StudentProgramListView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request, student_id):
        coach = get_request_coach(request)
        # Ownership via student filter (404 if not owned)
        from students.services import get_student_for_coach

        get_student_for_coach(coach, student_id)
        qs = program_services.programs_for_coach(coach).filter(student_id=student_id)
        qs = program_services.filter_programs(qs, request.query_params)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            [program_services.serialize_program_summary(p) for p in page]
        )


class MyProgramListView(APIView):
    """Read-only program list for the currently authenticated student."""

    permission_classes = [IsAuthenticatedStudent]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request):
        student = get_request_student(request)
        qs = program_services.programs_for_student(student).order_by("-updated_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            [program_services.serialize_student_program_summary(p) for p in page]
        )


class MyProgramDetailView(APIView):
    permission_classes = [IsAuthenticatedStudent]

    def get(self, request, program_id):
        student = get_request_student(request)
        program = program_services.get_program_for_student(student, program_id)
        return Response(program_services.serialize_student_program_detail(program))


class GenerationRunListView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request):
        coach = get_request_coach(request)
        qs = GenerationRun.objects.filter(coach=coach).order_by("-created_at")
        student_id = request.query_params.get("student_id")
        if student_id:
            qs = qs.filter(student_id=student_id)
        program_id = request.query_params.get("program_id")
        if program_id:
            qs = qs.filter(program_id=program_id)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = [
            {
                "id": str(r.id),
                "student_id": str(r.student_id),
                "program_id": str(r.program_id) if r.program_id else None,
                "resulting_version_id": str(r.resulting_version_id)
                if r.resulting_version_id
                else None,
                "engine": r.engine,
                "status": r.status,
                "warnings": list(r.warnings or []),
                "created_at": r.created_at.isoformat().replace("+00:00", "Z"),
            }
            for r in page
        ]
        return paginator.get_paginated_response(data)


class GenerationRunDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, run_id):
        coach = get_request_coach(request)
        try:
            run = GenerationRun.objects.get(pk=run_id, coach=coach)
        except GenerationRun.DoesNotExist:
            return Response(
                {"error": {"code": "not_found", "message": "Not found.", "details": {}}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {
                "id": str(run.id),
                "student_id": str(run.student_id),
                "program_id": str(run.program_id) if run.program_id else None,
                "resulting_version_id": str(run.resulting_version_id)
                if run.resulting_version_id
                else None,
                "engine": run.engine,
                "seed": run.seed,
                "status": run.status,
                "request": run.request,
                "input_snapshot": run.input_snapshot,
                "output_snapshot": run.output_snapshot,
                "warnings": list(run.warnings or []),
                "error_message": run.error_message,
                "created_at": run.created_at.isoformat().replace("+00:00", "Z"),
            }
        )
