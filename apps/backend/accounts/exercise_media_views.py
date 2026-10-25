from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import exercise_media_services as media_services
from accounts.models import Exercise
from common.permissions import IsAuthenticatedCoach, get_owned_object, get_request_coach


class ExerciseMediaView(APIView):
    permission_classes = [IsAuthenticatedCoach]
    parser_classes = [MultiPartParser, FormParser]

    def exercise(self, request, exercise_id):
        return get_owned_object(
            Exercise.objects.select_related("media_asset"),
            coach=get_request_coach(request),
            pk=exercise_id,
        )

    def get(self, request, exercise_id):
        return Response(media_services.serialize_media(self.exercise(request, exercise_id)))

    def post(self, request, exercise_id):
        exercise = self.exercise(request, exercise_id)
        metadata = {}
        for name, maximum in (
            ("author", 160),
            ("license_name", 160),
            ("source_url", 1024),
            ("license_url", 1024),
        ):
            value = str(request.data.get(name) or "").strip()
            if len(value) > maximum:
                raise serializers.ValidationError({name: ["متن واردشده بیش از حد طولانی است."]})
            if name.endswith("url") and value:
                try:
                    URLValidator(schemes=["https"])(value)
                except DjangoValidationError:
                    raise serializers.ValidationError({name: ["لینک HTTPS معتبر وارد کنید."]})
            metadata[name] = value
        asset = media_services.upload_video(exercise, request.FILES.get("file"), metadata=metadata)
        return Response(
            {
                "media": media_services.media_payload(exercise),
                "media_upload": media_services.upload_payload(asset),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    def delete(self, request, exercise_id):
        exercise = media_services.remove_video(self.exercise(request, exercise_id))
        return Response(media_services.serialize_media(exercise))


class ExerciseMediaRetryView(ExerciseMediaView):
    http_method_names = ["post", "options"]

    def post(self, request, exercise_id):
        exercise = self.exercise(request, exercise_id)
        asset = media_services.retry_video(exercise)
        return Response(
            {
                "media": media_services.media_payload(exercise),
                "media_upload": media_services.upload_payload(asset),
            },
            status=status.HTTP_202_ACCEPTED,
        )
