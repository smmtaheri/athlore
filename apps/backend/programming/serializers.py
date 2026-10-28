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
    session_duration_minutes = serializers.IntegerField(
        min_value=15, max_value=180, required=False, allow_null=True
    )
    equipment_available = serializers.ListField(
        child=serializers.ChoiceField(
            choices=[
                "full_gym",
                "bodyweight_only",
                "dumbbell",
                "barbell",
                "cable",
                "machines",
                "resistance_band",
                "bench_flat",
                "bench_adjustable",
                "pullup_bar",
            ]
        ),
        required=False,
        allow_empty=True,
        max_length=10,
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

    def validate_session_duration_minutes(self, value):
        if value is not None and value % 15:
            raise serializers.ValidationError("مدت جلسه باید مضربی از ۱۵ دقیقه باشد.")
        return value

    def validate_equipment_available(self, value):
        if "full_gym" in value and len(value) > 1:
            raise serializers.ValidationError(
                "انتخاب همهٔ تجهیزات باشگاه با گزینه‌های دیگر هم‌زمان نیست."
            )
        if "bodyweight_only" in value and len(value) > 1:
            raise serializers.ValidationError("تمرین فقط با وزن بدن با گزینه‌های دیگر هم‌زمان نیست.")
        return value


class ProgramRequestMarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), required=False)
