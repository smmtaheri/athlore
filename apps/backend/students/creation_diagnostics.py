"""Failure diagnostics for student creation without submitted personal data."""

import json
import logging
import uuid

from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)


def log_creation_failure(exc, *, request, phase, coach_id=None, student_id=None) -> str:
    request_id = uuid.uuid4().hex
    expected = isinstance(exc, APIException)
    event = {
        "event": "student_create_rejected" if expected else "student_create_failed",
        "request_id": request_id,
        "method": "POST",
        "path": "/api/v1/students/",
        "phase": phase,
        "status": exc.status_code if expected else 500,
        "actor_id": str(request.user.pk) if getattr(request.user, "pk", None) else None,
        "coach_id": str(coach_id) if coach_id else None,
        "student_id": str(student_id) if student_id else None,
        "exception_type": type(exc).__name__,
        "error_codes": exc.get_codes() if expected else "unhandled_error",
        "cause_type": type(exc.__cause__).__name__ if exc.__cause__ else None,
    }
    if not expected:
        locations = []
        trace = exc.__traceback__
        while trace is not None:
            code = trace.tb_frame.f_code
            locations.append(
                f"{code.co_filename.rsplit('/', 1)[-1]}:{trace.tb_lineno}:{code.co_name}"
            )
            trace = trace.tb_next
        event["locations"] = locations
    # Exception messages can contain submitted values or database row contents.
    # Field error codes and source locations provide diagnostics without logging those values.
    logger.log(logging.WARNING if expected else logging.ERROR, json.dumps(event, sort_keys=True))
    return request_id
