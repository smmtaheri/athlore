from __future__ import annotations

from urllib.parse import quote

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import (
    IsAuthenticatedCoach,
    IsAuthenticatedStudent,
    assert_student_writable_access,
    get_request_coach,
    get_request_student,
)
from students import body_check_services as bcs
from students import services as student_services
from students.body_check_serializers import (
    BodyCheckCycleCreateSerializer,
    BodyCheckCycleUpdateSerializer,
    BodyCheckDailyEntryWriteSerializer,
    BodyCheckPhotoUploadSerializer,
    BodyCheckSuggestTargetsSerializer,
)


def _dj_validation_to_drf(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError(list(exc.messages))
    return ValidationError(str(exc))


class CoachBodyCheckCycleListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        cycles = bcs.cycles_for_coach_student(coach, student)
        return Response(
            {
                "count": cycles.count(),
                "results": [bcs.serialize_cycle(c, include_report=True) for c in cycles],
            }
        )

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        serializer = BodyCheckCycleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            cycle = bcs.create_cycle(
                coach,
                student,
                start_date=data["start_date"],
                starting_weight_kg=data["starting_weight_kg"],
                goal_weight_kg=data["goal_weight_kg"],
                meal_detail_enabled=data.get("meal_detail_enabled", False),
                daily_targets_kg=data.get("daily_targets_kg"),
            )
        except DjangoValidationError as exc:
            raise _dj_validation_to_drf(exc) from exc
        return Response(
            bcs.serialize_cycle(cycle, include_calendar=True, include_report=True, include_photos=True),
            status=status.HTTP_201_CREATED,
        )


class CoachBodyCheckSuggestTargetsView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id):
        get_request_coach(request)
        student_services.get_student_for_coach(get_request_coach(request), student_id)
        serializer = BodyCheckSuggestTargetsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        targets = bcs.suggest_daily_targets_kg(
            data["starting_weight_kg"], data["goal_weight_kg"]
        )
        return Response({"daily_targets_kg": targets, "source": "system_suggestion"})


class CoachBodyCheckCycleDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id, cycle_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        cycle = bcs.get_cycle_for_coach(coach, student, cycle_id)
        return Response(
            bcs.serialize_cycle(
                cycle, include_calendar=True, include_report=True, include_photos=True
            )
        )

    def patch(self, request, student_id, cycle_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        cycle = bcs.get_cycle_for_coach(coach, student, cycle_id)
        serializer = BodyCheckCycleUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            cycle = bcs.update_cycle(cycle, serializer.validated_data)
        except DjangoValidationError as exc:
            raise _dj_validation_to_drf(exc) from exc
        return Response(
            bcs.serialize_cycle(
                cycle, include_calendar=True, include_report=True, include_photos=True
            )
        )


class CoachBodyCheckCycleCloseView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id, cycle_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        cycle = bcs.get_cycle_for_coach(coach, student, cycle_id)
        cycle = bcs.close_cycle(cycle)
        return Response(
            bcs.serialize_cycle(
                cycle, include_calendar=True, include_report=True, include_photos=True
            )
        )


class CoachBodyCheckCycleReportView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, student_id, cycle_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        cycle = bcs.get_cycle_for_coach(coach, student, cycle_id)
        return Response(
            bcs.serialize_cycle(
                cycle, include_calendar=True, include_report=True, include_photos=True
            )
        )


class CoachBodyCheckPhotoUploadView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, student_id, cycle_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        cycle = bcs.get_cycle_for_coach(coach, student, cycle_id)
        serializer = BodyCheckPhotoUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            photo = bcs.add_progress_photo(
                cycle,
                week_number=serializer.validated_data["week_number"],
                uploaded_file=serializer.validated_data["file"],
                actor_is_student=False,
            )
        except DjangoValidationError as exc:
            raise _dj_validation_to_drf(exc) from exc
        return Response(bcs.serialize_photo(photo), status=status.HTTP_201_CREATED)


class MyBodyCheckActiveView(APIView):
    permission_classes = [IsAuthenticatedStudent]

    def get(self, request):
        student = get_request_student(request)
        cycle = bcs.active_cycle_for_student(student)
        history = bcs.student_body_check_history(student)
        if cycle is None:
            return Response({"cycle": None, "dashboard": None, "history": history})
        return Response(
            {
                "cycle": bcs.serialize_cycle(
                    cycle,
                    for_student=True,
                    include_calendar=True,
                    include_report=True,
                    include_photos=True,
                ),
                "dashboard": bcs.student_dashboard_body_check(student),
                "history": history,
            }
        )


class MyBodyCheckDashboardView(APIView):
    permission_classes = [IsAuthenticatedStudent]

    def get(self, request):
        student = get_request_student(request)
        payload = bcs.student_dashboard_body_check(student)
        return Response(payload)


class MyBodyCheckEntryUpsertView(APIView):
    permission_classes = [IsAuthenticatedStudent]
    parser_classes = [JSONParser]

    def put(self, request):
        student = get_request_student(request)
        assert_student_writable_access(student)
        cycle = bcs.active_cycle_for_student(student)
        if cycle is None:
            raise ValidationError({"cycle": ["No active Body Check cycle."]})
        serializer = BodyCheckDailyEntryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        local_date = data.pop("local_date")
        try:
            entry = bcs.upsert_daily_entry(
                cycle, local_date=local_date, data=data, actor_is_student=True
            )
        except DjangoValidationError as exc:
            raise _dj_validation_to_drf(exc) from exc
        return Response(
            bcs.serialize_entry(entry, cycle=cycle, local_date=local_date, for_student=True)
        )


class MyBodyCheckPhotoUploadView(APIView):
    permission_classes = [IsAuthenticatedStudent]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        student = get_request_student(request)
        assert_student_writable_access(student)
        cycle = bcs.active_cycle_for_student(student)
        if cycle is None:
            raise ValidationError({"cycle": ["No active Body Check cycle."]})
        serializer = BodyCheckPhotoUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            photo = bcs.add_progress_photo(
                cycle,
                week_number=serializer.validated_data["week_number"],
                uploaded_file=serializer.validated_data["file"],
                actor_is_student=True,
            )
        except DjangoValidationError as exc:
            raise _dj_validation_to_drf(exc) from exc
        return Response(bcs.serialize_photo(photo), status=status.HTTP_201_CREATED)


class BodyCheckPhotoDownloadView(APIView):
    """Authenticated download for coach owner or the student of the cycle."""

    permission_classes = [IsAuthenticated]

    def get(self, request, photo_id):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return Response(status=status.HTTP_401_UNAUTHORIZED)

        from students.body_check_models import BodyCheckProgressPhoto

        try:
            photo = BodyCheckProgressPhoto.objects.select_related(
                "cycle", "cycle__student", "cycle__coach"
            ).get(pk=photo_id)
        except BodyCheckProgressPhoto.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        allowed = False
        coach = getattr(user, "coach_profile", None)
        if coach is not None and photo.cycle.coach_id == coach.id:
            allowed = True
        student_profile = getattr(user, "student_profile", None)
        if (
            student_profile is not None
            and student_profile.student_id == photo.cycle.student_id
            and student_profile.portal_enabled
            and student_profile.account_activated_at
            and not student_profile.must_change_password
        ):
            allowed = True
        if not allowed:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if not photo.file:
            return Response(status=status.HTTP_404_NOT_FOUND)

        filename = photo.original_filename or "progress.jpg"
        ascii_fallback = "progress.jpg"
        encoded = quote(filename)
        response = FileResponse(
            photo.file.open("rb"), content_type=photo.content_type or "application/octet-stream"
        )
        response["Content-Disposition"] = (
            f"inline; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"
        )
        return response


class BodyCheckPhotoDeleteView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def delete(self, request, student_id, cycle_id, photo_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        cycle = bcs.get_cycle_for_coach(coach, student, cycle_id)
        photo = bcs.get_photo_for_cycle(cycle, photo_id)
        bcs.delete_progress_photo(photo)
        return Response(status=status.HTTP_204_NO_CONTENT)
