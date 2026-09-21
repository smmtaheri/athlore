from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardLimitOffsetPagination
from common.permissions import (
    IsAuthenticatedCoach,
    IsAuthenticatedStudent,
    IsAuthenticatedStudentSetup,
    get_request_coach,
    get_request_student,
)
from students import services
from students import visit_form_services as vfs
from students.serializers import (
    ActivateLoginSerializer,
    ResetPortalPasswordSerializer,
    SendToStudentSerializer,
    SetPortalInitialPasswordSerializer,
    SetPortalUsernameSerializer,
    StudentAnswersUpdateSerializer,
    StudentListSerializer,
    StudentPortalCompleteSetupSerializer,
    StudentPortalLoginSerializer,
    StudentSerializer,
    VisitSerializer,
    VisitWriteSerializer,
)


class StudentListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request):
        coach = get_request_coach(request)
        qs = services.students_for_coach(coach)

        status_filter = request.query_params.get("status")
        if status_filter and status_filter != "all":
            qs = qs.filter(status=status_filter)

        level = request.query_params.get("level")
        if level and level != "all":
            qs = qs.filter(training_background__level=level)

        goal = request.query_params.get("goal")
        if goal and goal != "all":
            qs = qs.filter(goals__primary_goal=goal)

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search)
                | Q(phone_number__icontains=search)
                | Q(summary_current_program_title__icontains=search)
            )

        ordering = request.query_params.get("ordering") or "-updated_at"
        allowed = {
            "updated_at",
            "-updated_at",
            "full_name",
            "-full_name",
            "created_at",
            "-created_at",
        }
        if ordering in allowed:
            qs = qs.order_by(ordering)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = StudentListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        coach = get_request_coach(request)
        serializer = StudentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Ignore any client-provided coach ownership fields
        data = dict(serializer.validated_data)
        data.pop("coach", None)
        data.pop("coach_id", None)
        student = services.create_student(coach, data)
        return Response(StudentSerializer(student).data, status=status.HTTP_201_CREATED)


class StudentDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        return Response(StudentSerializer(student).data)

    def patch(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        serializer = StudentSerializer(student, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        data.pop("coach", None)
        data.pop("coach_id", None)
        student = services.update_student(student, data)
        return Response(StudentSerializer(student).data)


class StudentArchiveView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        student = services.archive_student(student)
        return Response(StudentSerializer(student).data)


class VisitListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        qs = services.visits_for_student(coach, student).order_by("-visit_date", "-created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(VisitSerializer(page, many=True).data)

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        serializer = VisitWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = services.create_visit(coach, student, serializer.validated_data, actor=request.user)
        return Response(VisitSerializer(visit).data, status=status.HTTP_201_CREATED)


class VisitLatestView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_latest_visit(coach, student)
        return Response(VisitSerializer(visit).data)


class VisitDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_visit_for_student(coach, student, visit_id)
        return Response(VisitSerializer(visit).data)

    def patch(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_visit_for_student(coach, student, visit_id)
        serializer = VisitWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        visit = services.update_visit(visit, serializer.validated_data, actor=request.user)
        return Response(VisitSerializer(visit).data)

    def delete(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_visit_for_student(coach, student, visit_id)
        services.delete_visit(visit)
        return Response(status=status.HTTP_204_NO_CONTENT)


class VisitSendToStudentView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_visit_for_student(coach, student, visit_id)
        serializer = SendToStudentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = vfs.send_visit_to_student(
            visit, expires_in_days=serializer.validated_data["expires_in_days"]
        )
        return Response(VisitSerializer(visit).data)


class VisitFinalizeView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_visit_for_student(coach, student, visit_id)
        visit = vfs.finalize_visit(visit, actor=request.user)
        return Response(VisitSerializer(visit).data)


class VisitStartCoachReviewView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_visit_for_student(coach, student, visit_id)
        visit = vfs.start_coach_review(visit, actor=request.user)
        return Response(VisitSerializer(visit).data)


class VisitAnswerRevisionsView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        visit = services.get_visit_for_student(coach, student, visit_id)
        field_key = request.query_params.get("field_key")
        revisions = vfs.list_answer_revisions(visit, field_key=field_key)
        items = [vfs.serialize_answer_revision(r) for r in revisions]
        return Response({"count": len(items), "results": items})


class StudentActivateLoginView(APIView):
    """Back-compat: coach sets username + initial or reset password."""

    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        serializer = ActivateLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.activate_student_login(
            coach,
            student,
            rotate_password=serializer.validated_data.get("rotate_password", True),
            initial_password=serializer.validated_data["initial_password"],
            username=(serializer.validated_data.get("username") or "").strip() or None,
        )
        return Response(result, status=status.HTTP_200_OK)


class StudentPortalSetInitialPasswordView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        serializer = SetPortalInitialPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.set_portal_initial_password(
            coach,
            student,
            username=serializer.validated_data["username"],
            initial_password=serializer.validated_data["initial_password"],
        )
        return Response(result, status=status.HTTP_200_OK)


class StudentPortalSetUsernameView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        serializer = SetPortalUsernameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.set_portal_username(
            coach,
            student,
            username=serializer.validated_data["username"],
        )
        return Response(result, status=status.HTTP_200_OK)


class StudentPortalResetPasswordView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        serializer = ResetPortalPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.reset_portal_password(
            coach,
            student,
            initial_password=serializer.validated_data["initial_password"],
        )
        return Response(result, status=status.HTTP_200_OK)


class StudentPortalDeactivateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        result = services.deactivate_student_portal(coach, student)
        return Response(result, status=status.HTTP_200_OK)


class StudentPortalReactivateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = services.get_student_for_coach(coach, student_id)
        result = services.reactivate_student_portal(coach, student)
        return Response(result, status=status.HTTP_200_OK)


class StudentCompleteSetupView(APIView):
    """Authenticated forced password change after coach initial/reset password.

    Ends the temporary setup session; client must re-login on /student/login.
    """

    permission_classes = [IsAuthenticatedStudentSetup]

    def post(self, request):
        from accounts.auth_cookies import clear_refresh_cookie, read_refresh_token
        from accounts.services import logout_refresh_token

        serializer = StudentPortalCompleteSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = services.complete_student_setup(user=request.user, **serializer.validated_data)
        response = Response(payload, status=status.HTTP_200_OK)
        refresh = read_refresh_token(request)
        if refresh:
            try:
                logout_refresh_token(refresh)
            except Exception:
                pass
        clear_refresh_cookie(response)
        return response


class StudentPublicLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from accounts.auth_cookies import set_refresh_cookie

        serializer = StudentPortalLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = services.login_student(**serializer.validated_data)
        except services.StudentPortalAccessDenied as exc:
            return Response(
                {
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                        "details": {},
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        except services.StudentLoginInvalidCredentials as exc:
            return Response(
                {
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                        "details": {},
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        refresh = payload.get("tokens", {}).get("refresh")
        response = Response(payload, status=status.HTTP_200_OK)
        if refresh:
            set_refresh_cookie(response, refresh)
        return response


class MyVisitListView(APIView):
    permission_classes = [IsAuthenticatedStudent]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request):
        student = get_request_student(request)
        qs = services.visits_for_student_profile(student).order_by("-visit_date", "-created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        items = [vfs.serialize_visit_for_student(v) for v in page]
        return paginator.get_paginated_response(items)


class MyVisitDetailView(APIView):
    permission_classes = [IsAuthenticatedStudent]

    def get(self, request, visit_id):
        student = get_request_student(request)
        visit = services.get_visit_for_student_profile(student, visit_id)
        return Response(vfs.serialize_visit_for_student(visit))

    def patch(self, request, visit_id):
        student = get_request_student(request)
        from common.permissions import assert_student_writable_access

        assert_student_writable_access(student)
        visit = services.get_visit_for_student_profile(student, visit_id)
        serializer = StudentAnswersUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = vfs.student_update_answers(
            visit, serializer.validated_data["answers"], actor=request.user
        )
        return Response(vfs.serialize_visit_for_student(visit))


class MyVisitSubmitView(APIView):
    permission_classes = [IsAuthenticatedStudent]

    def post(self, request, visit_id):
        student = get_request_student(request)
        from common.permissions import assert_student_writable_access

        assert_student_writable_access(student)
        visit = services.get_visit_for_student_profile(student, visit_id)
        visit = vfs.student_submit_visit(visit, actor=request.user)
        return Response(vfs.serialize_visit_for_student(visit))
