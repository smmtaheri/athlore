from rest_framework import serializers

from programming.models import ProgramRequest


class ProgramRequestInputSerializer(serializers.Serializer):
    purpose = serializers.ChoiceField(
        choices=ProgramRequest.Purpose.choices,
        required=False,
        default=ProgramRequest.Purpose.NEXT,
    )
    sections = serializers.ListField(
        child=serializers.ChoiceField(choices=["workout", "nutrition", "supplement"]),
        allow_empty=False,
        max_length=3,
    )
    sessions_per_week = serializers.IntegerField(
        min_value=1, max_value=14, required=False, allow_null=True
    )
    training_environment = serializers.ChoiceField(
        choices=[
            ("", "Not specified"),
            ("gym", "Gym"),
            ("home", "Home"),
            ("outdoors", "Outdoors"),
            ("other", "Other"),
        ],
        required=False,
        allow_blank=True,
    )
    assessment_mode = serializers.ChoiceField(
        choices=ProgramRequest.AssessmentMode.choices,
        required=False,
    )
    goal = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    injury_notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    training_time_notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    sleep_notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    nutrition_notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    visit_id = serializers.UUIDField(required=False, allow_null=True)


class ProgramRequestMarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), required=False)
