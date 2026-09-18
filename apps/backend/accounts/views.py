from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from accounts import services
from accounts.serializers import (
    CoachProfileSerializer,
    LoginSerializer,
    LogoutSerializer,
    RefreshSerializer,
    RegisterSerializer,
)
from common.exceptions import ConflictError
from common.permissions import IsAuthenticatedCoach, get_request_coach


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from django.conf import settings

        if not getattr(settings, "PUBLIC_REGISTRATION_ENABLED", False):
            return Response(
                {
                    "error": {
                        "code": "registration_disabled",
                        "message": "ثبت‌نام عمومی غیرفعال است. برای ساخت حساب با مدیر سامانه تماس بگیرید.",
                        "details": {},
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = services.register_coach(**serializer.validated_data)
        except ConflictError as exc:
            raise exc
        except ValueError as exc:
            return Response(
                {"error": {"code": "validation_error", "message": str(exc), "details": {}}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(payload, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from accounts.auth_cookies import set_refresh_cookie

        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = services.login_user(**serializer.validated_data)
        except PermissionError:
            return Response(
                {
                    "error": {
                        "code": "authentication_required",
                        "message": "ایمیل یا رمز عبور نادرست است.",
                        "details": {},
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        refresh = payload.get("tokens", {}).get("refresh")
        # Prefer HttpOnly cookie for refresh; still return body for backward-compatible clients.
        response = Response(payload, status=status.HTTP_200_OK)
        if refresh:
            set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from accounts.auth_cookies import read_refresh_token, set_refresh_cookie

        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = read_refresh_token(request) or serializer.validated_data.get("refresh")
        if not refresh:
            return Response(
                {
                    "error": {
                        "code": "authentication_required",
                        "message": "Refresh token missing.",
                        "details": {},
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            refresh = services.prepare_refresh_token_for_rotation(refresh)
            refresh_serializer = TokenRefreshSerializer(data={"refresh": refresh})
            refresh_serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            return Response(
                {
                    "error": {
                        "code": "token_expired",
                        "message": str(exc),
                        "details": {},
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        data = refresh_serializer.validated_data
        new_refresh = str(data.get("refresh", refresh))
        response = Response(
            {
                "access": str(data["access"]),
                "refresh": new_refresh,
            },
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, new_refresh)
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from accounts.auth_cookies import clear_refresh_cookie, read_refresh_token

        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = read_refresh_token(request) or serializer.validated_data.get("refresh")
        if not refresh:
            response = Response(status=status.HTTP_204_NO_CONTENT)
            clear_refresh_cookie(response)
            return response
        try:
            services.logout_refresh_token(refresh)
        except TokenError:
            return Response(
                {
                    "error": {
                        "code": "token_expired",
                        "message": "Invalid or expired refresh token.",
                        "details": {},
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        coach = getattr(user, "coach_profile", None)
        if coach is not None:
            return Response(
                {
                    "user": services.serialize_user(user),
                    "role": "coach",
                    "coach": services.serialize_coach(coach),
                }
            )
        student_profile = getattr(user, "student_profile", None)
        if student_profile is not None:
            if not student_profile.portal_enabled:
                raise PermissionDenied(detail="دسترسی پنل شاگرد غیرفعال است.")
            # Allow mid-setup sessions so the client can finish forced password change.
            return Response(
                {
                    "user": services.serialize_user(user),
                    "role": "student",
                    "student": services.serialize_student_for_session(student_profile.student),
                    "must_change_password": student_profile.must_change_password,
                    "setup_required": student_profile.must_change_password,
                    "username": (user.username if student_profile.is_account_activated else None),
                }
            )
        raise PermissionDenied(detail="Coach or student profile is required.")


class MeCoachView(APIView):
    permission_classes = [IsAuthenticatedCoach]

    def patch(self, request):
        coach = get_request_coach(request)
        serializer = CoachProfileSerializer(coach, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            services.update_coach_profile(coach, **serializer.validated_data)
        except ValueError as exc:
            return Response(
                {"error": {"code": "validation_error", "message": str(exc), "details": {}}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        coach.refresh_from_db()
        return Response(services.serialize_coach(coach))
