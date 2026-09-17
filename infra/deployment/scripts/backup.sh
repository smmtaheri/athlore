#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$ROOT/backups/backup-$STAMP"
mkdir -p "$OUT/media"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-coach_assistant}" -d "${POSTGRES_DB:-coach_assistant}" --no-owner --format=custom > "$OUT/postgres.dump"
# Copy media files from the running backend container into backup/media
docker compose exec -T backend sh -c 'cd /data/media && tar cf - .' | tar -C "$OUT/media" -xf -
cat > "$OUT/manifest.txt" << MAN
timestamp=$STAMP
postgres_dump=postgres.dump
media_dir=media
MAN
echo "Backup written to $OUT"
ls -la "$OUT"
du -sh "$OUT/media" || true
