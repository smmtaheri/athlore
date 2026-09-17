from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.dashboard import build_dashboard
from common.permissions import IsAuthenticatedCoach, get_request_coach


class DashboardView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def get(self, request):
        coach = get_request_coach(request)
        return Response(build_dashboard(coach))
