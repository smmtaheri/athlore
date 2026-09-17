from __future__ import annotations

from rest_framework import serializers

from students.body_check_models import BodyCheckCycle
from students.body_check_services import CYCLE_LENGTH_DAYS


class BodyCheckCycleCreateSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    starting_weight_kg = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=20)
    goal_weight_kg = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=20)
    meal_detail_enabled = serializers.BooleanField(required=False, default=False)
    daily_targets_kg = serializers.ListField(
        child=serializers.FloatField(min_value=20, max_value=400),
        required=False,
        allow_null=True,
    )

    def validate_daily_targets_kg(self, value):
        if value is None:
            return value
        if len(value) != CYCLE_LENGTH_DAYS:
            raise serializers.ValidationError(f"Expected {CYCLE_LENGTH_DAYS} daily targets.")
        return value


class BodyCheckCycleUpdateSerializer(serializers.Serializer):
    meal_detail_enabled = serializers.BooleanField(required=False)
    starting_weight_kg = serializers.DecimalField(
        max_digits=5, decimal_places=1, min_value=20, required=False
    )
    goal_weight_kg = serializers.DecimalField(
        max_digits=5, decimal_places=1, min_value=20, required=False
    )
    daily_targets_kg = serializers.ListField(
        child=serializers.FloatField(min_value=20, max_value=400),
        required=False,
        allow_null=True,
    )
    status = serializers.ChoiceField(
        choices=[BodyCheckCycle.Status.ACTIVE, BodyCheckCycle.Status.CLOSED],
        required=False,
    )

    def validate_daily_targets_kg(self, value):
        if value is None:
            return value
        if len(value) != CYCLE_LENGTH_DAYS:
            raise serializers.ValidationError(f"Expected {CYCLE_LENGTH_DAYS} daily targets.")
        return value


class BodyCheckSuggestTargetsSerializer(serializers.Serializer):
    starting_weight_kg = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=20)
    goal_weight_kg = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=20)


class BodyCheckDailyEntryWriteSerializer(serializers.Serializer):
    local_date = serializers.DateField()
    actual_weight_kg = serializers.DecimalField(
        max_digits=5, decimal_places=1, min_value=20, required=False, allow_null=True
    )
    sleep_start_time = serializers.TimeField(required=False, allow_null=True)
    wake_time = serializers.TimeField(required=False, allow_null=True)
    sleep_quality_score = serializers.IntegerField(
        min_value=1, max_value=10, required=False, allow_null=True
    )
    nutrition_adherence_score = serializers.IntegerField(
        min_value=1, max_value=10, required=False, allow_null=True
    )
    meal_1 = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    meal_2 = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    meal_3 = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    meal_4 = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    meal_5 = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    meal_6 = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class BodyCheckPhotoUploadSerializer(serializers.Serializer):
    week_number = serializers.IntegerField(min_value=1, max_value=4)
    file = serializers.FileField()
