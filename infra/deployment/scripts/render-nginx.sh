#!/usr/bin/env bash
# Render the HTTP-origin Nginx configuration for Athlore's three hosts.
# ParsPack terminates HTTPS at the CDN and forwards the original scheme.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/.env"
for arg in "$@"; do
  case "$arg" in
    --*) echo "Unknown argument: $arg (expected an env file path)" >&2; exit 1 ;;
    *) ENV_FILE="$arg" ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE (copy .env.production.example to .env first)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-}"
COACH_DOMAIN="${COACH_DOMAIN:-}"
STUDENT_DOMAIN="${STUDENT_DOMAIN:-}"
TLS_MODE="${TLS_MODE:-}"
for key in PUBLIC_DOMAIN COACH_DOMAIN STUDENT_DOMAIN; do
  if [[ -z "${!key}" ]]; then
    echo "${key} is required in ${ENV_FILE}" >&2
    exit 1
  fi
done
if [[ "$TLS_MODE" != "external" ]]; then
  echo "TLS_MODE=external is required; ParsPack terminates HTTPS for this deployment" >&2
  exit 1
fi

BASE_TEMPLATE="$ROOT/nginx/templates/nginx.conf.template"
SERVER_TEMPLATE="$ROOT/nginx/templates/server-external.conf.template"
OUT_DIR="$ROOT/nginx/rendered"
OUT_FILE="$OUT_DIR/nginx.conf"

mkdir -p "$OUT_DIR"
VARS='${PUBLIC_DOMAIN} ${COACH_DOMAIN} ${STUDENT_DOMAIN}'
TMP_BASE="$(mktemp)"
TMP_SERVER="$(mktemp)"
trap 'rm -f "$TMP_BASE" "$TMP_SERVER"' EXIT

envsubst "$VARS" < "$BASE_TEMPLATE" > "$TMP_BASE"
envsubst "$VARS" < "$SERVER_TEMPLATE" > "$TMP_SERVER"
sed -e "/__SERVER_BLOCKS__/r $TMP_SERVER" -e "/__SERVER_BLOCKS__/d" "$TMP_BASE" > "$OUT_FILE"

echo "Rendered $OUT_FILE (HTTP origin behind ParsPack for ${PUBLIC_DOMAIN}, ${COACH_DOMAIN}, ${STUDENT_DOMAIN})"

if [[ "${SKIP_NGINX_VALIDATE:-}" == "1" ]]; then
  echo "Skipping nginx -t validation (SKIP_NGINX_VALIDATE=1)"
  exit 0
fi

echo "Validating with nginx:1.27-alpine..."
docker run --rm \
  --add-host backend:127.0.0.1 \
  --add-host frontend:127.0.0.1 \
  -v "$OUT_FILE:/etc/nginx/nginx.conf:ro" \
  -v "$ROOT/nginx/snippets:/etc/nginx/snippets:ro" \
  nginx:1.27-alpine nginx -t
