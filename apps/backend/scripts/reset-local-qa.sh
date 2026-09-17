#!/usr/bin/env bash
# Reset ONLY the local manual-QA database and media.
# Never touches coach-assistant-backend/db.sqlite3.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

QA_DB="$ROOT/.local/manual-qa.sqlite3"
QA_MEDIA="$ROOT/.local/manual-media"
PROTECTED_DB="$ROOT/db.sqlite3"

if [[ "$(realpath -m "$QA_DB")" == "$(realpath -m "$PROTECTED_DB")" ]]; then
  echo "Refusing to reset: manual-QA DB path resolves to protected db.sqlite3" >&2
  exit 1
fi

mkdir -p "$ROOT/.local"
rm -f "$QA_DB" "$QA_DB"-journal "$QA_DB"-wal "$QA_DB"-shm
rm -rf "$QA_MEDIA"
mkdir -p "$QA_MEDIA"

echo "Removed:"
echo "  $QA_DB"
echo "  $QA_MEDIA"
echo
echo "Next:"
echo "  export DJANGO_DB_NAME=\"$QA_DB\""
echo "  export DJANGO_MEDIA_ROOT=\"$QA_MEDIA\""
echo "  .venv/bin/python manage.py migrate --noinput"
echo "  .venv/bin/python manage.py seed_demo_data   # optional"
