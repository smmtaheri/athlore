"""
Django settings for Athlore backend (P0).

Secrets and environment-sensitive values are loaded from environment variables.
"""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "dev-only-insecure-secret-key-min-32-chars!!",
)
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in {"1", "true", "yes"}

PUBLIC_DOMAIN = os.environ.get("PUBLIC_DOMAIN", "athlore.ir").strip().lower()
COACH_DOMAIN = os.environ.get("COACH_DOMAIN", "coach.athlore.ir").strip().lower()
STUDENT_DOMAIN = os.environ.get("STUDENT_DOMAIN", "student.athlore.ir").strip().lower()

_CANONICAL_HOSTS = [PUBLIC_DOMAIN, COACH_DOMAIN, STUDENT_DOMAIN]
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", ",".join(_CANONICAL_HOSTS)).split(",")
    if h.strip()
]
if DEBUG:
    for host in ("testserver", "localhost", "127.0.0.1"):
        if host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(host)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "common",
    "accounts",
    "students",
    "programming",
    "delivery",
    # Legacy prototype app retained for planner code; HTTP routes are not mounted.
    "programs",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "coach_copilot.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
WSGI_APPLICATION = "coach_copilot.wsgi.application"
ASGI_APPLICATION = "coach_copilot.asgi.application"

# Database: SQLite by default; set DB_ENGINE=postgresql for Postgres.
_DB_ENGINE = (os.environ.get("DB_ENGINE") or "sqlite").strip().lower()
if _DB_ENGINE in {"postgresql", "postgres"}:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "coach_assistant"),
            "USER": os.environ.get("POSTGRES_USER", "coach"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        }
    }
else:
    # Prefer DJANGO_DB_NAME; DJANGO_DB_PATH is accepted as an alias for local manual-QA scripts.
    _DB_NAME = (
        os.environ.get("DJANGO_DB_NAME")
        or os.environ.get("DJANGO_DB_PATH")
        or str(BASE_DIR / "db.sqlite3")
    )
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": _DB_NAME,
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = Path(os.environ.get("DJANGO_STATIC_ROOT", str(BASE_DIR / "staticfiles")))
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        # Compressed (non-manifest) so gunicorn can serve admin/static without
        # failing on missing hashed files before/without collectstatic in tests.
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Private PDF artifacts use Django storage. Do not serve MEDIA publicly in product flows.
MEDIA_ROOT = Path(os.environ.get("DJANGO_MEDIA_ROOT", str(BASE_DIR / "media")))
MEDIA_URL = "/media/"
PUBLIC_API_BASE_URL = os.environ.get(
    "PUBLIC_API_BASE_URL", f"https://{PUBLIC_DOMAIN}/api/v1"
)
# PDF share defaults (days)
PDF_SHARE_DEFAULT_DAYS = int(os.environ.get("PDF_SHARE_DEFAULT_DAYS", "7"))
PDF_SHARE_MAX_DAYS = int(os.environ.get("PDF_SHARE_MAX_DAYS", "30"))

# Public self-registration is off by default; create coaches via management commands.
PUBLIC_REGISTRATION_ENABLED = os.environ.get("PUBLIC_REGISTRATION_ENABLED", "false").lower() in {
    "1",
    "true",
    "yes",
}

_CANONICAL_HTTPS_ORIGINS = [f"https://{host}" for host in _CANONICAL_HOSTS]
_LOCAL_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CSRF_TRUSTED_ORIGINS",
        ",".join(_CANONICAL_HTTPS_ORIGINS + (_LOCAL_DEV_ORIGINS if DEBUG else [])),
    ).split(",")
    if o.strip()
]

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        ",".join(_CANONICAL_HTTPS_ORIGINS + (_LOCAL_DEV_ORIGINS if DEBUG else [])),
    ).split(",")
    if o.strip()
]
# Credentials required so the SPA can send/receive the HttpOnly refresh cookie
# behind same-origin Nginx (or explicit CORS allowlist).
CORS_ALLOW_CREDENTIALS = True

# Production TLS / proxy hardening (env-driven; safe defaults for local DEBUG).
_SECURE = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "false").lower() in {
    "1",
    "true",
    "yes",
}
SECURE_SSL_REDIRECT = _SECURE and not DEBUG
SESSION_COOKIE_SECURE = os.environ.get(
    "DJANGO_SESSION_COOKIE_SECURE",
    "true" if _SECURE else "false",
).lower() in {"1", "true", "yes"}
CSRF_COOKIE_SECURE = os.environ.get(
    "DJANGO_CSRF_COOKIE_SECURE",
    "true" if _SECURE else "false",
).lower() in {"1", "true", "yes"}
SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "0"))
if os.environ.get("DJANGO_SECURE_HSTS_SECONDS"):
    SECURE_HSTS_SECONDS = int(os.environ["DJANGO_SECURE_HSTS_SECONDS"])
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = SECURE_HSTS_SECONDS > 0
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardLimitOffsetPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}
