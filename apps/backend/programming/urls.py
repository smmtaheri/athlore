from django.urls import path

from programming.views import (
    GenerationRunDetailView,
    GenerationRunListView,
    MyProgramDetailView,
    MyProgramListView,
    ProgramActivateView,
    ProgramArchiveView,
    ProgramDetailView,
    ProgramGenerateView,
    ProgramListCreateView,
    ProgramUploadedPdfDraftView,
    ProgramVersionDetailView,
    ProgramVersionDuplicateView,
    ProgramVersionFinalizeView,
    ProgramVersionListView,
    ProgramVersionNewVersionView,
    ProgramVersionStagedPdfView,
    StudentProgramListView,
)

urlpatterns = [
    path("me/programs/", MyProgramListView.as_view(), name="my-program-list"),
    path("me/programs/<uuid:program_id>/", MyProgramDetailView.as_view(), name="my-program-detail"),
    path("programs/", ProgramListCreateView.as_view(), name="program-list"),
    path("programs/generate/", ProgramGenerateView.as_view(), name="program-generate"),
    path(
        "programs/upload-pdf/",
        ProgramUploadedPdfDraftView.as_view(),
        name="program-upload-pdf-draft",
    ),
    path("programs/<uuid:program_id>/", ProgramDetailView.as_view(), name="program-detail"),
    path(
        "programs/<uuid:program_id>/archive/",
        ProgramArchiveView.as_view(),
        name="program-archive",
    ),
    path(
        "programs/<uuid:program_id>/activate/",
        ProgramActivateView.as_view(),
        name="program-activate",
    ),
    path(
        "programs/<uuid:program_id>/versions/",
        ProgramVersionListView.as_view(),
        name="program-version-list",
    ),
    path(
        "programs/<uuid:program_id>/versions/<uuid:version_id>/",
        ProgramVersionDetailView.as_view(),
        name="program-version-detail",
    ),
    path(
        "programs/<uuid:program_id>/versions/<uuid:version_id>/staged-pdf/",
        ProgramVersionStagedPdfView.as_view(),
        name="program-version-staged-pdf",
    ),
    path(
        "programs/<uuid:program_id>/versions/<uuid:version_id>/finalize/",
        ProgramVersionFinalizeView.as_view(),
        name="program-version-finalize",
    ),
    path(
        "programs/<uuid:program_id>/versions/<uuid:version_id>/new-version/",
        ProgramVersionNewVersionView.as_view(),
        name="program-version-new",
    ),
    path(
        "programs/<uuid:program_id>/versions/<uuid:version_id>/duplicate/",
        ProgramVersionDuplicateView.as_view(),
        name="program-version-duplicate",
    ),
    path(
        "students/<uuid:student_id>/programs/",
        StudentProgramListView.as_view(),
        name="student-programs",
    ),
    path("generation-runs/", GenerationRunListView.as_view(), name="generation-run-list"),
    path(
        "generation-runs/<uuid:run_id>/",
        GenerationRunDetailView.as_view(),
        name="generation-run-detail",
    ),
]
