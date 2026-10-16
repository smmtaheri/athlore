#!/usr/bin/env bash
# Render the HTTP-origin Nginx configuration for the selected Athlore stack.
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
STAGE_PUBLIC_DOMAIN="${STAGE_PUBLIC_DOMAIN:-stage.athlore.ir}"
STAGE_COACH_DOMAIN="${STAGE_COACH_DOMAIN:-stage.coach.athlore.ir}"
STAGE_STUDENT_DOMAIN="${STAGE_STUDENT_DOMAIN:-stage.student.athlore.ir}"
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
STAGE_GATEWAY_TEMPLATE="$ROOT/nginx/templates/server-stage-gateway.conf.template"
NGINX_RENDER_MODE="${NGINX_RENDER_MODE:-production}"
if [[ "$NGINX_RENDER_MODE" != "production" && "$NGINX_RENDER_MODE" != "stage" ]]; then
  echo "NGINX_RENDER_MODE must be production or stage" >&2
  exit 1
fi
OUT_DIR="$ROOT/nginx/rendered"
OUT_FILE="${NGINX_RENDERED_CONFIG:-$OUT_DIR/nginx.conf}"

mkdir -p "$(dirname "$OUT_FILE")"
NGINX_SERVER_NAMES="$(printf '%s\n' "$PUBLIC_DOMAIN" "$COACH_DOMAIN" "$STUDENT_DOMAIN" | awk 'NF && !seen[$0]++' | paste -sd' ' -)"
VARS='${NGINX_SERVER_NAMES} ${STAGE_PUBLIC_DOMAIN} ${STAGE_COACH_DOMAIN} ${STAGE_STUDENT_DOMAIN}'
export NGINX_SERVER_NAMES STAGE_PUBLIC_DOMAIN STAGE_COACH_DOMAIN STAGE_STUDENT_DOMAIN
TMP_BASE="$(mktemp)"
TMP_SERVER="$(mktemp)"
TMP_GATEWAY="$(mktemp)"
trap 'rm -f "$TMP_BASE" "$TMP_SERVER" "$TMP_GATEWAY"' EXIT

envsubst "$VARS" < "$BASE_TEMPLATE" > "$TMP_BASE"
envsubst "$VARS" < "$SERVER_TEMPLATE" > "$TMP_SERVER"
if [[ "$NGINX_RENDER_MODE" == "production" ]]; then
  envsubst "$VARS" < "$STAGE_GATEWAY_TEMPLATE" > "$TMP_GATEWAY"
  cat "$TMP_GATEWAY" >> "$TMP_SERVER"
fi
sed -e "/__SERVER_BLOCKS__/r $TMP_SERVER" -e "/__SERVER_BLOCKS__/d" "$TMP_BASE" > "$OUT_FILE"

echo "Rendered $OUT_FILE (mode=${NGINX_RENDER_MODE}; hosts=${NGINX_SERVER_NAMES})"

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
