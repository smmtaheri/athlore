from urllib.parse import quote

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import (
    IsAuthenticatedCoach,
    IsAuthenticatedStudent,
    StudentWritableAccessMixin,
    assert_student_writable_access,
    get_request_coach,
    get_request_student,
)
from students import services as student_services
from students import visit_photo_services as photo_services
from students.models import VisitPhoto


class VisitPhotoUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    pose = serializers.ChoiceField(choices=VisitPhoto.Pose.choices)


class StagedVisitPhotoUploadSerializer(VisitPhotoUploadSerializer):
    session_id = serializers.UUIDField()
    visit_id = serializers.UUIDField(required=False)


class CommitStagedPhotosSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()


def _serialize_photos(visit):
    return {
        "results": [
            photo_services.serialize_photo(photo)
            for photo in photo_services.photos_for_visit(visit)
        ]
    }


def _add_photo(request, visit, role):
    serializer = VisitPhotoUploadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        photo = photo_services.add_visit_photo(
            visit,
            uploaded_file=serializer.validated_data["file"],
            pose=serializer.validated_data["pose"],
            actor=request.user,
            uploader_role=role,
        )
    except DjangoValidationError as exc:
        raise ValidationError(
            exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        ) from exc
    return Response(photo_services.serialize_photo(photo), status=status.HTTP_201_CREATED)


def _stage_photo(request, student, visit, role):
    serializer = StagedVisitPhotoUploadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        staged = photo_services.stage_visit_photo(
            session_id=serializer.validated_data["session_id"],
            student=student,
            visit=visit,
            pose=serializer.validated_data["pose"],
            uploaded_file=serializer.validated_data["file"],
            actor=request.user,
            uploader_role=role,
        )
    except DjangoValidationError as exc:
        raise ValidationError(
            exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        ) from exc
    return Response(
        {"id": str(staged.id), "pose": staged.pose, "expires_at": staged.expires_at},
        status=status.HTTP_201_CREATED,
    )


class CoachStagedVisitPhotosView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, student_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        serializer = StagedVisitPhotoUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit_id = serializer.validated_data.get("visit_id")
        visit = (
            student_services.get_visit_for_student(coach, student, visit_id) if visit_id else None
        )
        return _stage_photo(request, student, visit, "coach")


class StudentStagedVisitPhotosView(StudentWritableAccessMixin, APIView):
    permission_classes = [IsAuthenticatedStudent]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, visit_id):
        student = get_request_student(request)
        visit = student_services.get_visit_for_student_profile(student, visit_id)
        try:
            photo_services.ensure_student_upload_allowed(visit)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict) from exc
        return _stage_photo(request, student, visit, "student")


class StagedVisitPhotoDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, photo_id):
        if getattr(request.user, "student_profile", None) is not None:
            assert_student_writable_access(get_request_student(request))
        removed = photo_services.discard_staged_photo(photo_id=photo_id, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT if removed else status.HTTP_404_NOT_FOUND)


class CoachCommitVisitPhotosView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        visit = student_services.get_visit_for_student(coach, student, visit_id)
        serializer = CommitStagedPhotosSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        issues = photo_services.commit_staged_photos(
            session_id=serializer.validated_data["session_id"], visit=visit, actor=request.user
        )
        return Response({**_serialize_photos(visit), "photo_issues": issues})


class StudentCommitVisitPhotosView(StudentWritableAccessMixin, APIView):
    permission_classes = [IsAuthenticatedStudent]

    def post(self, request, visit_id):
        student = get_request_student(request)
        visit = student_services.get_visit_for_student_profile(student, visit_id)
        try:
            photo_services.ensure_student_upload_allowed(visit)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict) from exc
        serializer = CommitStagedPhotosSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        issues = photo_services.commit_staged_photos(
            session_id=serializer.validated_data["session_id"], visit=visit, actor=request.user
        )
        return Response({**_serialize_photos(visit), "photo_issues": issues})


class CoachVisitPhotosView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        visit = student_services.get_visit_for_student(coach, student, visit_id)
        return Response(_serialize_photos(visit))

    def post(self, request, student_id, visit_id):
        coach = get_request_coach(request)
        student = student_services.get_student_for_coach(coach, student_id)
        visit = student_services.get_visit_for_student(coach, student, visit_id)
        return _add_photo(request, visit, "coach")


class StudentVisitPhotosView(StudentWritableAccessMixin, APIView):
    permission_classes = [IsAuthenticatedStudent]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, visit_id):
        student = get_request_student(request)
        visit = student_services.get_visit_for_student_profile(student, visit_id)
        return Response(_serialize_photos(visit))

    def post(self, request, visit_id):
        student = get_request_student(request)
        visit = student_services.get_visit_for_student_profile(student, visit_id)
        try:
            photo_services.ensure_student_upload_allowed(visit)
        except DjangoValidationError as exc:
            raise ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            ) from exc
        return _add_photo(request, visit, "student")


class VisitPhotoDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, photo_id):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return Response(status=status.HTTP_401_UNAUTHORIZED)

        from students.models import VisitPhoto

        try:
            photo = VisitPhoto.objects.select_related(
                "visit", "visit__student", "visit__coach"
            ).get(pk=photo_id)
        except VisitPhoto.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        allowed = False
        coach = getattr(user, "coach_profile", None)
        if coach is not None and photo.visit.coach_id == coach.id:
            allowed = True
        student_profile = getattr(user, "student_profile", None)
        if (
            student_profile is not None
            and student_profile.student_id == photo.visit.student_id
            and student_profile.portal_enabled
            and student_profile.account_activated_at
            and not student_profile.must_change_password
            and photo.visit.status != photo.visit.Status.DRAFT
        ):
            allowed = True
        if not allowed or not photo.file:
            return Response(status=status.HTTP_404_NOT_FOUND)

        safe_filename = (
            (photo.original_filename or "visit-photo.jpg").replace("\r", "").replace("\n", "")
        )
        response = FileResponse(photo.file.open("rb"), content_type=photo.content_type)
        response["Content-Disposition"] = (
            f"inline; filename=\"visit-photo\"; filename*=UTF-8''{quote(safe_filename)}"
        )
        response["Cache-Control"] = "private, no-store, max-age=0"
        response["X-Content-Type-Options"] = "nosniff"
        return response
