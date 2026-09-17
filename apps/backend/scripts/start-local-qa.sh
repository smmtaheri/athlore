#!/usr/bin/env bash
# Start Backend for local manual QA using dedicated DB + media under .local/
# Does not touch db.sqlite3.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${ROOT}/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  if command -v uv >/dev/null 2>&1; then
    echo "Missing Backend .venv — running: uv sync --frozen" >&2
    (cd "$ROOT" && uv sync --frozen)
  fi
fi
if [[ ! -x "$PYTHON" ]]; then
  echo "Missing Backend venv at .venv/bin/python. Run: uv sync --frozen" >&2
  exit 1
fi

mkdir -p "$ROOT/.local/manual-media"
export DJANGO_DEBUG=true
export DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-local-manual-qa-only-secret-key-change-me-32chars}"
export PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-athlore.localhost}"
export COACH_DOMAIN="${COACH_DOMAIN:-coach.athlore.localhost}"
export STUDENT_DOMAIN="${STUDENT_DOMAIN:-student.athlore.localhost}"
export DJANGO_ALLOWED_HOSTS="${DJANGO_ALLOWED_HOSTS:-localhost,127.0.0.1}"
export DJANGO_DB_NAME="${DJANGO_DB_NAME:-$ROOT/.local/manual-qa.sqlite3}"
export DJANGO_MEDIA_ROOT="${DJANGO_MEDIA_ROOT:-$ROOT/.local/manual-media}"
export PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://127.0.0.1:5173,http://localhost:5173}"

PROTECTED_DB="$ROOT/db.sqlite3"
if [[ "$(realpath -m "$DJANGO_DB_NAME")" == "$(realpath -m "$PROTECTED_DB")" ]]; then
  echo "Refusing to start: DJANGO_DB_NAME points at protected db.sqlite3" >&2
  exit 1
fi

echo "Manual-QA Backend"
echo "  DB:    $DJANGO_DB_NAME"
echo "  Media: $DJANGO_MEDIA_ROOT"
echo "  API:   http://127.0.0.1:8000/api/v1/"
echo "  Admin: http://127.0.0.1:8000/admin/"
echo

"$PYTHON" manage.py migrate --noinput
echo
echo "Optional demo seed (idempotent):"
echo "  DJANGO_DB_NAME=\"$DJANGO_DB_NAME\" DJANGO_MEDIA_ROOT=\"$DJANGO_MEDIA_ROOT\" $PYTHON manage.py seed_demo_data"
echo
exec "$PYTHON" manage.py runserver 127.0.0.1:8000
