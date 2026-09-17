#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.production.example and fill its values." >&2
  exit 1
fi

_upsert_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if grep -qE "^${key}=" .env; then
    awk -v k="$key" -v v="$value" '
      BEGIN { done = 0 }
      index($0, k "=") == 1 { print k "=" v; done = 1; next }
      { print }
      END { if (!done) print k "=" v }
    ' .env > "$tmp"
    mv "$tmp" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

_ensure_secret() {
  local key="$1"
  local nbytes="$2"
  local current="${!key-}"
  if [[ -n "$current" ]]; then return 0; fi
  local value
  value="$(python3 -c "import secrets; print(secrets.token_urlsafe(${nbytes}))")"
  _upsert_env "$key" "$value"
  export "$key=$value"
  echo "Generated empty ${key} and saved it into .env"
}

set -a
# shellcheck disable=SC1091
source .env
set +a
_ensure_secret POSTGRES_PASSWORD 24
_ensure_secret DJANGO_SECRET_KEY 48

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${POSTGRES_PASSWORD:-}" || -z "${DJANGO_SECRET_KEY:-}" ]]; then
  echo "POSTGRES_PASSWORD and DJANGO_SECRET_KEY must be set in .env" >&2
  exit 1
fi

./scripts/validate-env.sh
"$ROOT/scripts/render-nginx.sh"
docker compose up -d --build
# nginx.conf is a bind-mounted generated file; recreate only Nginx so the
# running process loads the freshly rendered CDN-origin configuration.
docker compose up -d --force-recreate nginx

echo "Public:  https://${PUBLIC_DOMAIN}/"
echo "Coach:   https://${COACH_DOMAIN}/login"
echo "Student: https://${STUDENT_DOMAIN}/login"
echo "Health:  https://${COACH_DOMAIN}/api/v1/health/"
