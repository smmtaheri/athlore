from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from accounts.models import CoachProfile
from common.phone import InvalidPhoneError, normalize_iran_mobile


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    full_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=32)

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_phone_number(self, value):
        try:
            return normalize_iran_mobile(value, required=True)
        except InvalidPhoneError as exc:
            raise serializers.ValidationError(exc.message) from exc


class LoginSerializer(serializers.Serializer):
    # Coaches log in with email; students log in with the username issued at activation.
    email = serializers.EmailField(required=False, allow_blank=True)
    username = serializers.CharField(required=False, allow_blank=True, max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if not attrs.get("email") and not attrs.get("username"):
            raise serializers.ValidationError({"email": ["Email or username is required."]})
        return attrs


class RefreshSerializer(serializers.Serializer):
    # Optional when an HttpOnly refresh cookie is present.
    refresh = serializers.CharField(required=False, allow_blank=True)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=True)


class CoachProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    phone_number = serializers.CharField(required=False, allow_blank=False, max_length=32)

    class Meta:
        model = CoachProfile
        fields = (
            "id",
            "display_name",
            "phone_number",
            "style_notes",
            "control_mode",
            "default_session_minutes",
        )
        extra_kwargs = {
            "display_name": {"required": False},
            "style_notes": {"required": False},
            "control_mode": {"required": False},
            "default_session_minutes": {"required": False},
        }

    def validate_phone_number(self, value):
        try:
            return normalize_iran_mobile(value, required=True)
        except InvalidPhoneError as exc:
            raise serializers.ValidationError(exc.message) from exc
