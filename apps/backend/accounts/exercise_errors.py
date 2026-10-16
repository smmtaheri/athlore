"""User-facing errors and diagnostics for exercise catalog writes only."""

import logging
import uuid

from django.core.exceptions import PermissionDenied
from django.db import IntegrityError
from django.http import Http404
from rest_framework.exceptions import APIException, ParseError, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

DUPLICATE_MESSAGE = (
    "حرکتی با این نام برای این عضله قبلاً ثبت شده است. "
    "حرکت موجود را ویرایش کنید یا نام دیگری وارد کنید."
)
EXTERNAL_KEY_DUPLICATE_MESSAGE = "شناسه مرجع این حرکت قبلاً استفاده شده است؛ شناسه دیگری وارد کنید."

VALIDATION_MESSAGES = {
    "name and a primary muscle are required.": "نام فارسی و عضله اصلی حرکت را وارد کنید.",
    "Exercise already exists for this muscle.": DUPLICATE_MESSAGE,
    "Exercise external_key already exists for this coach.": EXTERNAL_KEY_DUPLICATE_MESSAGE,
    "Use 1-160 lowercase letters, numbers, '.', '_' or '-'.": (
        "شناسه مرجع باید حداکثر ۱۶۰ نویسه و شامل حروف کوچک انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد."
    ),
    "At least one structured target is required.": "عضله اصلی حرکت را انتخاب کنید.",
    "Exactly one primary target is required.": "برای هر حرکت باید دقیقاً یک عضله اصلی انتخاب شود.",
    "Every target must be an object.": "اطلاعات عضله‌های حرکت نامعتبر است؛ آن‌ها را دوباره انتخاب کنید.",
    "Priority must be a non-negative integer.": "اولویت حرکت باید یک عدد صحیح صفر یا بیشتر باشد.",
    "Expected a list.": "ساختار اطلاعات ارسالی حرکت نامعتبر است؛ صفحه را تازه کنید و دوباره تلاش کنید.",
}

FIELD_LABELS = {
    "aliases": "نام‌های جایگزین",
    "levels": "سطح‌های مناسب",
    "suitable_levels": "سطح‌های مناسب",
    "equipment_keys": "تجهیزات",
    "secondary_muscles": "عضله‌های فرعی",
    "risk_tags": "محدودیت‌های حرکت",
}


def _validation_message(field, message):
    if message in VALIDATION_MESSAGES:
        return VALIDATION_MESSAGES[message]
    if message == "All items must be strings." and field in FIELD_LABELS:
        return f"اطلاعات {FIELD_LABELS[field]} نامعتبر است؛ گزینه‌ها را دوباره وارد کنید."
    if field == "targets":
        if message.startswith("Unknown taxonomy key:"):
            return "عضله انتخاب‌شده نامعتبر یا غیرفعال است؛ عضله اصلی و عضله‌های مرتبط را دوباره انتخاب کنید."
        if message.startswith("Unknown region key:"):
            return "ناحیه انتخاب‌شده نامعتبر، غیرفعال یا متعلق به عضله دیگری است؛ ناحیه را دوباره انتخاب کنید."
        if message.startswith("Unsupported role:"):
            return "نوع اتصال عضله به حرکت نامعتبر است؛ عضله‌های حرکت را دوباره انتخاب کنید."
    if field == "equipment_keys" and message.startswith("Unknown taxonomy key:"):
        return "یکی از تجهیزات انتخاب‌شده نامعتبر یا غیرفعال است؛ تجهیزات را دوباره انتخاب کنید."
    if field in {"levels", "suitable_levels"} and message.startswith("Unsupported levels:"):
        return "سطح تمرینی انتخاب‌شده معتبر نیست؛ سطح‌های مناسب حرکت را دوباره انتخاب کنید."
    return None


def _error_response(code, message, details, status=400):
    return Response(
        {"error": {"code": code, "message": message, "details": details}}, status=status
    )


class ExerciseWriteAPIView(APIView):
    def handle_exception(self, exc):
        if self.request.method not in {"POST", "PATCH"}:
            return super().handle_exception(exc)

        if isinstance(exc, ValidationError):
            translated = {}
            if isinstance(exc.detail, dict) and exc.detail:
                for field, errors in exc.detail.items():
                    messages = errors if isinstance(errors, (list, tuple)) else [errors]
                    translations = [
                        _validation_message(field, str(message)) for message in messages
                    ]
                    if not translations or any(message is None for message in translations):
                        break
                    translated[field] = translations
                else:
                    messages = list(
                        dict.fromkeys(message for row in translated.values() for message in row)
                    )
                    code = (
                        "exercise_duplicate"
                        if messages == [DUPLICATE_MESSAGE]
                        else "exercise_validation_error"
                    )
                    return _error_response(code, " ".join(messages), translated)
            return self._unknown_error(exc, status=400)

        if isinstance(exc, IntegrityError):
            constraint = getattr(getattr(exc.__cause__, "diag", None), "constraint_name", None)
            sqlite_duplicate = (
                "UNIQUE constraint failed: accounts_exercise.coach_id, "
                "accounts_exercise.name, accounts_exercise.primary_muscle"
            )
            sqlite_external_key = "UNIQUE constraint failed: accounts_exercise.coach_id, accounts_exercise.external_key"
            if constraint == "uniq_coach_exercise_name_muscle" or str(exc) == sqlite_duplicate:
                return _error_response(
                    "exercise_duplicate", DUPLICATE_MESSAGE, {"name": [DUPLICATE_MESSAGE]}
                )
            if constraint == "uniq_coach_exercise_external_key" or str(exc) == sqlite_external_key:
                return _error_response(
                    "exercise_validation_error",
                    EXTERNAL_KEY_DUPLICATE_MESSAGE,
                    {"external_key": [EXTERNAL_KEY_DUPLICATE_MESSAGE]},
                )

        if isinstance(exc, ParseError):
            return _error_response(
                "exercise_validation_error",
                "اطلاعات حرکت به‌درستی ارسال نشده است؛ صفحه را تازه کنید و دوباره تلاش کنید.",
                {},
            )
        if isinstance(exc, APIException) and exc.status_code >= 500:
            return self._unknown_error(exc, status=exc.status_code)
        if isinstance(exc, (APIException, Http404, PermissionDenied)):
            return super().handle_exception(exc)
        return self._unknown_error(exc, status=500)

    def _unknown_error(self, exc, *, status):
        error_id = uuid.uuid4().hex
        logger.log(
            logging.WARNING if status < 500 else logging.ERROR,
            "Unknown exercise save error error_id=%s method=%s path=%s user_id=%s details=%r",
            error_id,
            self.request.method,
            self.request.path,
            self.request.user.pk,
            getattr(exc, "detail", None),
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return _error_response(
            "exercise_save_unknown",
            "خطای ناشناخته‌ای هنگام ذخیره حرکت رخ داد. کد پیگیری را برای بررسی لاگ به پشتیبانی بدهید.",
            {"error_id": error_id},
            status=status,
        )
