from django.urls import path

from delivery.views import (
    PdfDetailView,
    PdfDownloadView,
    PdfRegenerateView,
    PdfShareView,
    ProgramPdfListCreateView,
    ProgramVersionPdfCreateView,
    PublicSharedPdfDownloadView,
    StudentPdfListView,
)

urlpatterns = [
    path(
        "students/<uuid:student_id>/pdf-files/",
        StudentPdfListView.as_view(),
        name="student-pdf-list",
    ),
    path(
        "programs/<uuid:program_id>/pdf-files/",
        ProgramPdfListCreateView.as_view(),
        name="program-pdf-list-create",
    ),
    path(
        "programs/<uuid:program_id>/versions/<uuid:version_id>/pdf-files/",
        ProgramVersionPdfCreateView.as_view(),
        name="program-version-pdf-create",
    ),
    path("pdf-files/<uuid:pdf_id>/", PdfDetailView.as_view(), name="pdf-detail"),
    path(
        "pdf-files/<uuid:pdf_id>/download/",
        PdfDownloadView.as_view(),
        name="pdf-download",
    ),
    path(
        "pdf-files/<uuid:pdf_id>/regenerate/",
        PdfRegenerateView.as_view(),
        name="pdf-regenerate",
    ),
    path("pdf-files/<uuid:pdf_id>/share/", PdfShareView.as_view(), name="pdf-share"),
    path(
        "shared/pdf/<str:token>/",
        PublicSharedPdfDownloadView.as_view(),
        name="pdf-shared-download",
    ),
]
