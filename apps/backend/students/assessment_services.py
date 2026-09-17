"""Deprecated shim — use students.visit_form_services."""

from students.visit_form_models import (
    CoachVisitFormTemplate as CoachAssessmentTemplate,  # noqa: F401
)
from students.visit_form_services import *  # noqa: F403
