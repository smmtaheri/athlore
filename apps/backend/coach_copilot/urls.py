from django.contrib import admin
from django.urls import include, path

from common.health import HealthView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Production API. Legacy anonymous /api/ prototype routes are intentionally not mounted.
    path("api/v1/health/", HealthView.as_view(), name="health"),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("students.urls")),
    path("api/v1/", include("programming.urls")),
    path("api/v1/", include("delivery.urls")),
]
