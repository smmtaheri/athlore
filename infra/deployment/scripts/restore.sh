#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BACKUP_PATH="${1:-}"
if [[ -z "$BACKUP_PATH" ]]; then
  echo "Usage: $0 /path/to/backup-dir" >&2
  exit 1
fi
# Resolve to absolute path (required for docker -v binds)
if [[ "$BACKUP_PATH" != /* ]]; then
  BACKUP_PATH="$ROOT/$BACKUP_PATH"
fi
BACKUP_PATH="$(cd "$BACKUP_PATH" && pwd)"

if [[ ! -f "$BACKUP_PATH/postgres.dump" || ! -f "$BACKUP_PATH/manifest.txt" ]]; then
  echo "Invalid backup: missing postgres.dump or manifest.txt" >&2
  exit 1
fi
echo "About to restore from $BACKUP_PATH"
read -r -p "Type RESTORE to continue: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Cancelled"
  exit 1
fi

# Load .env for credentials if present
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

docker compose stop backend nginx frontend || true
docker compose up -d postgres
sleep 3
docker compose exec -T postgres pg_restore \
  -U "${POSTGRES_USER:-coach_assistant}" \
  -d "${POSTGRES_DB:-coach_assistant}" \
  --clean --if-exists < "$BACKUP_PATH/postgres.dump" || true

if [[ -d "$BACKUP_PATH/media" ]]; then
  docker compose run --rm --no-deps --entrypoint sh --user root \
    -v "$BACKUP_PATH/media:/restore-media:ro" \
    backend -c 'rm -rf /data/media/*; cp -R /restore-media/. /data/media/; chown -R 10001:10001 /data/media || true'
fi

docker compose up -d
echo "Restore finished"
