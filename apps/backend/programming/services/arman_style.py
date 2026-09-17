"""Compatibility shim — prefer style_calibration for new code."""

from programming.services.style_calibration import (  # noqa: F401
    DEFAULT_DAY_TARGETS,
    DEFAULT_RX_BY_CLASS,
    DEFAULT_SESSION_SETS,
    DEFAULT_SETS_PER_CLASS,
    REST_BUCKETS,
    day_style_target,
    load_arman_style_profile,
    load_style_profile,
    platform_default_style_profile,
    rest_bucket,
    session_set_target,
)
