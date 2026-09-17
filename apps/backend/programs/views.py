from rest_framework import status, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .core.planner import build_program, match_template
from .models import Coach, CoachExercisePreference, CoachRule, CoachTemplate, Exercise, GeneratedProgram, StudentProfile
from .serializers import (
    CoachExercisePreferenceSerializer,
    CoachRuleSerializer,
    CoachSerializer,
    CoachTemplateSerializer,
    ExerciseSerializer,
    GeneratedProgramSerializer,
    StudentProfileSerializer,
)


class CoachViewSet(viewsets.ModelViewSet):
    queryset = Coach.objects.all()
    serializer_class = CoachSerializer


class ExerciseViewSet(viewsets.ModelViewSet):
    queryset = Exercise.objects.all()
    serializer_class = ExerciseSerializer


class CoachExercisePreferenceViewSet(viewsets.ModelViewSet):
    queryset = CoachExercisePreference.objects.all()
    serializer_class = CoachExercisePreferenceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        coach_id = self.request.query_params.get("coach_id")
        if coach_id:
            qs = qs.filter(coach_id=coach_id)
        return qs


class CoachTemplateViewSet(viewsets.ModelViewSet):
    queryset = CoachTemplate.objects.all()
    serializer_class = CoachTemplateSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        coach_id = self.request.query_params.get("coach_id")
        if coach_id:
            qs = qs.filter(coach_id=coach_id)
        return qs


class CoachRuleViewSet(viewsets.ModelViewSet):
    queryset = CoachRule.objects.all()
    serializer_class = CoachRuleSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        coach_id = self.request.query_params.get("coach_id")
        if coach_id:
            qs = qs.filter(coach_id=coach_id)
        return qs


class StudentProfileViewSet(viewsets.ModelViewSet):
    queryset = StudentProfile.objects.all()
    serializer_class = StudentProfileSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        coach_id = self.request.query_params.get("coach_id")
        if coach_id:
            qs = qs.filter(coach_id=coach_id)
        return qs


class GeneratedProgramViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GeneratedProgram.objects.all()
    serializer_class = GeneratedProgramSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        student_id = self.request.query_params.get("student_id")
        coach_id = self.request.query_params.get("coach_id")
        if student_id:
            qs = qs.filter(student_id=student_id)
        if coach_id:
            qs = qs.filter(coach_id=coach_id)
        return qs


@api_view(["POST"])
def match_template_view(request):
    student_id = request.data.get("student_id")
    if not student_id:
        return Response({"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST)
    student = StudentProfile.objects.select_related("coach").get(id=student_id)
    result = match_template(student)
    template = result.pop("template")
    return Response({
        "template_id": template.id,
        "template_name": template.name,
        **result,
    })


@api_view(["POST"])
def generate_program_view(request):
    student_id = request.data.get("student_id")
    template_id = request.data.get("template_id")
    seed = request.data.get("seed")
    save = request.data.get("save", True)
    if not student_id:
        return Response({"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST)
    student = StudentProfile.objects.select_related("coach").get(id=student_id)
    template = None
    if template_id:
        template = CoachTemplate.objects.get(id=template_id, coach=student.coach)
    payload = build_program(student=student, template=template, seed=seed, save=save)
    return Response(payload)
