from __future__ import annotations

from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class ConflictError(APIException):
    status_code = 409
    default_detail = "Conflict."
    default_code = "conflict"

    def __init__(self, detail=None, code=None):
        if code is not None:
            self.default_code = code
        super().__init__(detail=detail, code=code or self.default_code)


class InvalidStateError(APIException):
    status_code = 400
    default_detail = "Invalid state transition."
    default_code = "invalid_state_transition"

    def __init__(self, detail=None, code=None):
        if code is not None:
            self.default_code = code
        super().__init__(detail=detail, code=code or self.default_code)


class GenerationFailedError(APIException):
    status_code = 422
    default_detail = "Generation failed."
    default_code = "generation_failed"

    def __init__(self, detail=None, code=None):
        if code is not None:
            self.default_code = code
        super().__init__(detail=detail, code=code or self.default_code)


def _code_for_status(status_code: int, default: str = "error") -> str:
    mapping = {
        400: "validation_error",
        401: "authentication_required",
        403: "permission_denied",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "generation_failed",
        429: "rate_limited",
        500: "internal_error",
    }
    return mapping.get(status_code, default)


def _as_message(detail) -> str:
    if detail is None:
        return "Error"
    if isinstance(detail, list):
        return "; ".join(str(x) for x in detail)
    return str(detail)


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    status_code = response.status_code
    data = response.data

    if isinstance(data, dict) and "error" in data and isinstance(data["error"], dict):
        return response

    # Simple detail-only payloads (APIException / auth)
    if isinstance(data, dict) and "detail" in data:
        detail = data.get("detail")
        code = data.get("code")
        if not isinstance(code, str):
            code = getattr(exc, "default_code", None) or _code_for_status(status_code)
        message = _as_message(detail)
        if status_code == 401:
            lower = message.lower()
            if "expired" in lower:
                code = "token_expired"
            elif code in {"token_not_valid"}:
                code = "authentication_required"
        # Prefer typed APIException default_code when present
        typed = getattr(exc, "default_code", None)
        if status_code == 409:
            if isinstance(typed, str) and typed and typed not in {"error", "invalid"}:
                code = typed
            else:
                code = "conflict"
        elif status_code == 422:
            code = typed or "generation_failed"
        elif isinstance(typed, str) and typed and typed not in {"error", "invalid"}:
            code = typed
        details = {k: v for k, v in data.items() if k not in {"detail", "code"}}
        # If remaining keys look like field errors, nest them
        field_details = {}
        for key, value in details.items():
            if isinstance(value, (list, tuple)):
                field_details[key] = [str(v) for v in value]
            elif isinstance(value, dict):
                field_details[key] = value
            else:
                field_details[key] = [str(value)]
        response.data = {
            "error": {
                "code": code,
                "message": message,
                "details": field_details,
            }
        }
        return response

    # Field validation errors without top-level detail
    if isinstance(data, dict):
        details = {}
        for key, value in data.items():
            if isinstance(value, (list, tuple)):
                details[key] = [str(v) for v in value]
            elif isinstance(value, dict):
                details[key] = value
            else:
                details[key] = [str(value)]
        response.data = {
            "error": {
                "code": _code_for_status(status_code),
                "message": "ورودی نامعتبر است." if status_code == 400 else "Error",
                "details": details,
            }
        }
        return response

    if isinstance(data, list):
        response.data = {
            "error": {
                "code": _code_for_status(status_code),
                "message": "; ".join(str(x) for x in data),
                "details": {},
            }
        }
        return response

    response.data = {
        "error": {
            "code": _code_for_status(status_code),
            "message": str(data),
            "details": {},
        }
    }
    return response
