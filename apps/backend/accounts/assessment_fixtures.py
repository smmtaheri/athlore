"""Deprecated shim — use accounts.visit_form_fixtures."""

from accounts.visit_form_fixtures import (  # noqa: F401
    ARMAN_STYLE_PROFILE,
    ARMAN_VISIT_FORM_TEMPLATE,
    MINIMAL_VISIT_FORM_TEMPLATE,
)

# Legacy names for older imports during the assessment→visit rename.
ARMAN_ASSESSMENT_TEMPLATE = ARMAN_VISIT_FORM_TEMPLATE
MINIMAL_ASSESSMENT_TEMPLATE = MINIMAL_VISIT_FORM_TEMPLATE
