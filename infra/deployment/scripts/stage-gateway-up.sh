#!/usr/bin/env bash
# Apply the stage host route to the shared production Nginx edge, without
# rebuilding or restarting the production application stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=infra/deployment/scripts/stage-common.sh
source "$ROOT/scripts/stage-common.sh"

PRODUCTION_DEPLOY_DIR="${ATHLORE_PRODUCTION_DEPLOY_DIR:-/root/athlore/infra/deployment}"
PRODUCTION_ENV_FILE="$PRODUCTION_DEPLOY_DIR/.env"
PRODUCTION_COMPOSE_FILE="$PRODUCTION_DEPLOY_DIR/compose.yaml"
PRODUCTION_NGINX_CONFIG="$PRODUCTION_DEPLOY_DIR/nginx/rendered/nginx.conf"

stage_load_env
stage_validate_env

for required_file in "$PRODUCTION_ENV_FILE" "$PRODUCTION_COMPOSE_FILE" "$PRODUCTION_NGINX_CONFIG"; do
  if [[ ! -f "$required_file" ]]; then
    echo "ERROR: required production gateway file is missing: $required_file" >&2
    exit 1
  fi
done

PRODUCTION_COMPOSE=(
  docker compose
  --project-directory "$PRODUCTION_DEPLOY_DIR"
  --env-file "$PRODUCTION_ENV_FILE"
  --file "$PRODUCTION_COMPOSE_FILE"
)
nginx_container="$("${PRODUCTION_COMPOSE[@]}" ps --status running -q nginx)"
if [[ -z "$nginx_container" ]]; then
  echo "ERROR: production Nginx is not running; stage gateway route was not changed." >&2
  exit 1
fi

candidate="$(mktemp "$ROOT/nginx/rendered/stage-gateway.XXXXXX")"
backup="$(mktemp "$PRODUCTION_DEPLOY_DIR/nginx/rendered/nginx.conf.backup.XXXXXX")"
cleanup() {
  rm -f "$candidate" "$backup"
}
trap cleanup EXIT

cp -p "$PRODUCTION_NGINX_CONFIG" "$candidate"
python3 "$ROOT/scripts/add-stage-public-host.py" \
  "$candidate" "$STAGE_PUBLIC_DOMAIN" "$STAGE_COACH_DOMAIN" "$STAGE_STUDENT_DOMAIN"

if cmp -s "$candidate" "$PRODUCTION_NGINX_CONFIG"; then
  echo "==> Shared gateway already has the current stage routes; no reload needed"
  exit 0
fi

cp -p "$PRODUCTION_NGINX_CONFIG" "$backup"
# The Nginx config is a bind-mounted file, so write its existing inode in place.
if ! cat "$candidate" > "$PRODUCTION_NGINX_CONFIG"; then
  cat "$backup" > "$PRODUCTION_NGINX_CONFIG"
  echo "ERROR: could not install the stage gateway config; previous config restored." >&2
  exit 1
fi

if ! "${PRODUCTION_COMPOSE[@]}" exec -T nginx nginx -t; then
  cat "$backup" > "$PRODUCTION_NGINX_CONFIG"
  echo "ERROR: production Nginx rejected the stage gateway config; previous config restored." >&2
  exit 1
fi

if ! "${PRODUCTION_COMPOSE[@]}" exec -T nginx nginx -s reload; then
  cat "$backup" > "$PRODUCTION_NGINX_CONFIG"
  if "${PRODUCTION_COMPOSE[@]}" exec -T nginx nginx -t; then
    "${PRODUCTION_COMPOSE[@]}" exec -T nginx nginx -s reload || true
  fi
  echo "ERROR: production Nginx could not reload; previous config restored." >&2
  exit 1
fi

echo "==> Shared Nginx reloaded with stage routes and Cache-Control: no-store"
