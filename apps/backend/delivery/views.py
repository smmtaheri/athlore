from __future__ import annotations

from urllib.parse import quote

from django.http import FileResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardLimitOffsetPagination
from common.permissions import IsAuthenticatedCoach, get_owned_object, get_request_coach
from delivery.serializers import (
    PdfCreateSerializer,
    PdfRenameSerializer,
    PdfShareCreateSerializer,
)
from delivery.services import artifacts as artifact_services
from delivery.services import share as share_services
from programming.models import Program
from students import services as student_services


def _content_disposition(filename: str) -> str:
    ascii_fallback = "program.pdf"
    encoded = quote(filename)
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


class StudentPdfListView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request, student_id):
        coach = get_request_coach(request)
        student_services.get_student_for_coach(coach, student_id)
        qs = artifact_services.artifacts_for_coach(coach).filter(student_id=student_id)
        qs = artifact_services.filter_artifacts_queryset(qs, request=request)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs.select_related("program"), request, view=self)
        data = [artifact_services.serialize_artifact(a) for a in page]
        return paginator.get_paginated_response(data)


class ProgramPdfListCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    pagination_class = StandardLimitOffsetPagination

    def get(self, request, program_id):
        coach = get_request_coach(request)
        get_owned_object(Program.objects.all(), coach=coach, pk=program_id)
        qs = artifact_services.artifacts_for_coach(coach).filter(program_id=program_id)
        qs = artifact_services.filter_artifacts_queryset(qs, request=request)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs.select_related("program"), request, view=self)
        data = [artifact_services.serialize_artifact(a) for a in page]
        return paginator.get_paginated_response(data)

    def post(self, request, program_id):
        coach = get_request_coach(request)
        program = get_owned_object(Program.objects.all(), coach=coach, pk=program_id)
        serializer = PdfCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        delivery = data.get("delivery_outputs") or "single"
        if delivery == "pair":
            artifacts = artifact_services.create_and_render_delivery_pair(
                coach,
                program,
                version_id=data.get("program_version_id"),
                user=request.user,
            )
            return Response(
                {
                    "count": len(artifacts),
                    "artifacts": [artifact_services.serialize_artifact(a) for a in artifacts],
                    # First artifact kept for older clients that expect a flat object.
                    **artifact_services.serialize_artifact(artifacts[0]),
                },
                status=status.HTTP_201_CREATED,
            )
        artifact = artifact_services.create_and_render(
            coach,
            program,
            version_id=data.get("program_version_id"),
            display_name=data.get("file_name") or data.get("display_name"),
            user=request.user,
            pdf_settings_override=data.get("pdf_settings_override"),
            program_type=data.get("program_type"),
        )
        return Response(
            artifact_services.serialize_artifact(artifact),
            status=status.HTTP_201_CREATED,
        )


class ProgramVersionPdfCreateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, program_id, version_id):
        coach = get_request_coach(request)
        program = get_owned_object(Program.objects.all(), coach=coach, pk=program_id)
        serializer = PdfCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        delivery = data.get("delivery_outputs") or "single"
        if delivery == "pair":
            artifacts = artifact_services.create_and_render_delivery_pair(
                coach,
                program,
                version_id=version_id,
                user=request.user,
            )
            return Response(
                {
                    "count": len(artifacts),
                    "artifacts": [artifact_services.serialize_artifact(a) for a in artifacts],
                    **artifact_services.serialize_artifact(artifacts[0]),
                },
                status=status.HTTP_201_CREATED,
            )
        artifact = artifact_services.create_and_render(
            coach,
            program,
            version_id=version_id,
            display_name=data.get("file_name") or data.get("display_name"),
            user=request.user,
            pdf_settings_override=data.get("pdf_settings_override"),
            program_type=data.get("program_type"),
        )
        return Response(
            artifact_services.serialize_artifact(artifact),
            status=status.HTTP_201_CREATED,
        )


class PdfDetailView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, pdf_id):
        coach = get_request_coach(request)
        artifact = artifact_services.get_artifact_for_coach(coach, pdf_id)
        return Response(artifact_services.serialize_artifact(artifact))

    def patch(self, request, pdf_id):
        coach = get_request_coach(request)
        artifact = artifact_services.get_artifact_for_coach(coach, pdf_id)
        serializer = PdfRenameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        artifact = artifact_services.rename_artifact(
            coach, artifact, serializer.validated_data["file_name"]
        )
        return Response(artifact_services.serialize_artifact(artifact))

    def delete(self, request, pdf_id):
        coach = get_request_coach(request)
        artifact = artifact_services.get_artifact_for_coach(coach, pdf_id)
        artifact_services.delete_artifact(coach, artifact)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PdfDownloadView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request, pdf_id):
        coach = get_request_coach(request)
        artifact = artifact_services.get_artifact_for_coach(coach, pdf_id)
        buf, filename, _size = artifact_services.open_artifact_file(artifact)
        response = FileResponse(buf, content_type=artifact.mime_type or "application/pdf")
        response["Content-Disposition"] = _content_disposition(filename)
        return response


class PdfRegenerateView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, pdf_id):
        coach = get_request_coach(request)
        artifact = artifact_services.get_artifact_for_coach(coach, pdf_id)
        new_artifact = artifact_services.regenerate_artifact(coach, artifact, user=request.user)
        return Response(
            artifact_services.serialize_artifact(new_artifact),
            status=status.HTTP_201_CREATED,
        )


class PdfShareView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def post(self, request, pdf_id):
        coach = get_request_coach(request)
        artifact = artifact_services.get_artifact_for_coach(coach, pdf_id)
        serializer = PdfShareCreateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        link, raw = share_services.create_share_link(
            coach,
            artifact,
            expires_in_days=data.get("expires_in_days"),
            expires_at=data.get("expires_at"),
        )
        return Response(
            {
                "share_url": share_services.build_public_share_url(raw),
                "token": raw,
                "expires_at": link.expires_at.isoformat().replace("+00:00", "Z"),
                "id": str(link.id),
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, pdf_id):
        coach = get_request_coach(request)
        artifact = artifact_services.get_artifact_for_coach(coach, pdf_id)
        share_services.revoke_share_links(coach, artifact)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicSharedPdfDownloadView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        buf, filename, _size = share_services.resolve_share_download(token)
        response = FileResponse(buf, content_type="application/pdf")
        response["Content-Disposition"] = _content_disposition(filename)
        return response
