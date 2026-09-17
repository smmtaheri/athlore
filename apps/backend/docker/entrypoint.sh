#!/bin/sh
set -eu

mkdir -p /data/media /app/staticfiles /app/media

run_as() {
  if [ "$(id -u)" = "0" ]; then
    chown -R appuser:appuser /data/media /app/staticfiles /app/media 2>/dev/null || true
    runuser -u appuser -- "$@"
  else
    "$@"
  fi
}

echo "Waiting for database..."
run_as python - <<'PY'
import os, sys, time
engine = (os.environ.get("DB_ENGINE") or "sqlite").lower()
if engine not in {"postgresql", "postgres"}:
    sys.exit(0)
import psycopg
host = os.environ.get("POSTGRES_HOST", "postgres")
port = int(os.environ.get("POSTGRES_PORT", "5432"))
user = os.environ.get("POSTGRES_USER", "coach_assistant")
password = os.environ.get("POSTGRES_PASSWORD", "")
dbname = os.environ.get("POSTGRES_DB", "coach_assistant")
for attempt in range(60):
    try:
        with psycopg.connect(
            host=host, port=port, user=user, password=password, dbname=dbname, connect_timeout=3
        ) as conn:
            conn.execute("SELECT 1")
        print("PostgreSQL is ready")
        sys.exit(0)
    except Exception as exc:
        print(f"DB not ready ({attempt+1}/60): {exc}")
        time.sleep(2)
print("PostgreSQL did not become ready", file=sys.stderr)
sys.exit(1)
PY

run_as python manage.py migrate --noinput
run_as python manage.py collectstatic --noinput

# Demo fixtures: DEBUG or explicit LOAD_DEMO_FIXTURES=true.
# Opting into LOAD_DEMO_FIXTURES also sets the known pilot password (Arman1234!).
LOAD_DEMO="${LOAD_DEMO_FIXTURES:-}"
DJANGO_DEBUG_FLAG="${DJANGO_DEBUG:-false}"
SHOULD_SEED=0
DEMO_PWD_FLAG=""
case "$(echo "$DJANGO_DEBUG_FLAG" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on) SHOULD_SEED=1; DEMO_PWD_FLAG="--allow-demo-password" ;;
esac
case "$(echo "$LOAD_DEMO" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on) SHOULD_SEED=1; DEMO_PWD_FLAG="--allow-demo-password" ;;
esac
if [ "$SHOULD_SEED" = "1" ]; then
  echo "Loading demo fixtures (seed_demo_fixtures)..."
  # shellcheck disable=SC2086
  run_as python manage.py seed_demo_fixtures --with-pdf $DEMO_PWD_FLAG || echo "Demo fixture seed skipped/failed (non-fatal)"
fi

if [ "$(id -u)" = "0" ]; then
  exec runuser -u appuser -- gunicorn coach_copilot.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile -
else
  exec gunicorn coach_copilot.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile -
fi
