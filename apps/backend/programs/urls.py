from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    CoachExercisePreferenceViewSet,
    CoachRuleViewSet,
    CoachTemplateViewSet,
    CoachViewSet,
    ExerciseViewSet,
    GeneratedProgramViewSet,
    StudentProfileViewSet,
    generate_program_view,
    match_template_view,
)

router = DefaultRouter()
router.register("coaches", CoachViewSet)
router.register("exercises", ExerciseViewSet)
router.register("exercise-preferences", CoachExercisePreferenceViewSet)
router.register("templates", CoachTemplateViewSet)
router.register("rules", CoachRuleViewSet)
router.register("students", StudentProfileViewSet)
router.register("programs", GeneratedProgramViewSet)

urlpatterns = [
    path("templates/match/", match_template_view),
    path("programs/generate/", generate_program_view),

    path("", include(router.urls)),
]
