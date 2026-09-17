from rest_framework import serializers
from .models import Coach, CoachExercisePreference, CoachRule, CoachTemplate, Exercise, GeneratedProgram, StudentProfile


class CoachSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coach
        fields = "__all__"


class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = "__all__"


class CoachExercisePreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoachExercisePreference
        fields = "__all__"


class CoachTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoachTemplate
        fields = "__all__"


class CoachRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoachRule
        fields = "__all__"


class StudentProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentProfile
        fields = "__all__"


class GeneratedProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneratedProgram
        fields = "__all__"
