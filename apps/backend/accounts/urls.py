from django.urls import path

from accounts.dashboard_views import DashboardView
from accounts.rules_views import (
    CoachRulesAggregateView,
    ExerciseDetailView,
    ExerciseListCreateView,
    ExerciseTaxonomyView,
    MuscleRegionDetailView,
    MuscleRegionListCreateView,
    MuscleTaxonomyDetailView,
    MuscleTaxonomyListCreateView,
    ProgramTemplateDetailView,
    ProgramTemplateListCreateView,
    TrainingTechniqueDetailView,
    TrainingTechniqueListCreateView,
)
from accounts.template_views import NutritionTemplateDetailView, SupplementTemplateDetailView
from accounts.views import LoginView, LogoutView, MeCoachView, MeView, RefreshView, RegisterView
from delivery.export_views import CoachRulesPdfExportView

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="me"),
    path("me/coach/", MeCoachView.as_view(), name="me-coach"),
    path("me/coach-rules/pdf/", CoachRulesPdfExportView.as_view(), name="me-coach-rules-pdf"),
    path(
        "me/nutrition-templates/<uuid:template_id>/",
        NutritionTemplateDetailView.as_view(),
        name="me-nutrition-template-detail",
    ),
    path(
        "me/supplement-templates/<uuid:template_id>/",
        SupplementTemplateDetailView.as_view(),
        name="me-supplement-template-detail",
    ),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("coach-rules/", CoachRulesAggregateView.as_view(), name="coach-rules"),
    path(
        "coach-rules/templates/",
        ProgramTemplateListCreateView.as_view(),
        name="coach-rules-templates",
    ),
    path(
        "coach-rules/templates/<uuid:template_id>/",
        ProgramTemplateDetailView.as_view(),
        name="coach-rules-template-detail",
    ),
    path(
        "program-templates/",
        ProgramTemplateListCreateView.as_view(),
        name="program-templates",
    ),
    path(
        "program-templates/<uuid:template_id>/",
        ProgramTemplateDetailView.as_view(),
        name="program-template-detail",
    ),
    path("exercises/", ExerciseListCreateView.as_view(), name="exercises"),
    path(
        "exercises/<uuid:exercise_id>/",
        ExerciseDetailView.as_view(),
        name="exercise-detail",
    ),
    path("exercise-taxonomy/", ExerciseTaxonomyView.as_view(), name="exercise-taxonomy"),
    path(
        "exercise-taxonomy/muscles/",
        MuscleTaxonomyListCreateView.as_view(),
        name="exercise-taxonomy-muscles",
    ),
    path(
        "exercise-taxonomy/muscles/<uuid:muscle_id>/",
        MuscleTaxonomyDetailView.as_view(),
        name="exercise-taxonomy-muscle-detail",
    ),
    path(
        "exercise-taxonomy/muscles/<uuid:muscle_id>/regions/",
        MuscleRegionListCreateView.as_view(),
        name="exercise-taxonomy-regions",
    ),
    path(
        "exercise-taxonomy/regions/<uuid:region_id>/",
        MuscleRegionDetailView.as_view(),
        name="exercise-taxonomy-region-detail",
    ),
    path(
        "training-techniques/",
        TrainingTechniqueListCreateView.as_view(),
        name="training-techniques",
    ),
    path(
        "training-techniques/<uuid:technique_id>/",
        TrainingTechniqueDetailView.as_view(),
        name="training-technique-detail",
    ),
]
