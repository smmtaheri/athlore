"""Unauthenticated health check for load balancers and orchestration."""

from __future__ import annotations

from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        db_status = "ok"
        try:
            connection.ensure_connection()
        except Exception:
            db_status = "error"
        overall = "ok" if db_status == "ok" else "degraded"
        status_code = 200 if overall == "ok" else 503
        return Response(
            {"status": overall, "database": db_status},
            status=status_code,
        )
