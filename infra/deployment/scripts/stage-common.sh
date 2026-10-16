#!/usr/bin/env bash
# Shared configuration and safety checks for the isolated stage Compose stack.
set -euo pipefail

STAGE_DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE_ENV_FILE="$STAGE_DEPLOY_DIR/.env.stage"
STAGE_COMPOSE_FILE="$STAGE_DEPLOY_DIR/compose.stage.yaml"
STAGE_PROJECT="athlore-stage"

_stage_upsert_env() {
  local key="$1"
  local value="$2"
  local temp_file
  temp_file="$(mktemp)"
  if grep -qE "^${key}=" "$STAGE_ENV_FILE"; then
    awk -v k="$key" -v v="$value" '
      BEGIN { done = 0 }
      index($0, k "=") == 1 { print k "=" v; done = 1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$STAGE_ENV_FILE" > "$temp_file"
    mv "$temp_file" "$STAGE_ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$STAGE_ENV_FILE"
    rm -f "$temp_file"
  fi
  chmod 600 "$STAGE_ENV_FILE"
}

_stage_ensure_secret() {
  local key="$1"
  local bytes="$2"
  local current="${!key-}"
  if [[ -n "$current" ]]; then return 0; fi
  local secret
  secret="$(python3 -c "import secrets; print(secrets.token_urlsafe(${bytes}))")"
  _stage_upsert_env "$key" "$secret"
  printf 'Generated %s in .env.stage\n' "$key"
}

stage_load_env() {
  if [[ ! -f "$STAGE_ENV_FILE" ]]; then
    echo "Creating stage runtime environment from .env.stage.example"
    (umask 077 && cp "$STAGE_DEPLOY_DIR/.env.stage.example" "$STAGE_ENV_FILE")
  fi
  chmod 600 "$STAGE_ENV_FILE"

  set -a
  # shellcheck disable=SC1090
  source "$STAGE_ENV_FILE"
  set +a
  _stage_ensure_secret POSTGRES_PASSWORD 24
  _stage_ensure_secret DJANGO_SECRET_KEY 48

  set -a
  # shellcheck disable=SC1090
  source "$STAGE_ENV_FILE"
  set +a
}

stage_validate_env() {
  if [[ "${PUBLIC_DOMAIN:-}" != "stage.athlore.ir" \
    || "${STUDENT_DOMAIN:-}" != "stage.student.athlore.ir" \
    || "${COACH_DOMAIN:-}" != "stage.coach.athlore.ir" \
    || "${STAGE_PUBLIC_DOMAIN:-}" != "stage.athlore.ir" \
    || "${STAGE_COACH_DOMAIN:-}" != "stage.coach.athlore.ir" \
    || "${STAGE_STUDENT_DOMAIN:-}" != "stage.student.athlore.ir" ]]; then
    echo "ERROR: .env.stage must use the dedicated public, coach, and student stage hostnames." >&2
    exit 1
  fi
  if [[ "${POSTGRES_DB:-}" != "athlore_stage" || "${POSTGRES_USER:-}" != "athlore_stage" ]]; then
    echo "ERROR: stage database name/user must remain athlore_stage." >&2
    exit 1
  fi
  if [[ "${LOAD_DEMO_FIXTURES:-false}" != "false" ]]; then
    echo "ERROR: stage must not load demo fixtures with fixed credentials." >&2
    exit 1
  fi
}

stage_compose() {
  docker compose \
    --project-name "$STAGE_PROJECT" \
    --env-file "$STAGE_ENV_FILE" \
    --file "$STAGE_COMPOSE_FILE" \
    "$@"
}

stage_prepare() {
  stage_load_env
  stage_validate_env
  "$STAGE_DEPLOY_DIR/scripts/validate-env.sh" "$STAGE_ENV_FILE"
  NGINX_RENDER_MODE=stage \
    NGINX_RENDERED_CONFIG="$STAGE_DEPLOY_DIR/nginx/rendered/stage-nginx.conf" \
    "$STAGE_DEPLOY_DIR/scripts/render-nginx.sh" "$STAGE_ENV_FILE"
  "$STAGE_DEPLOY_DIR/scripts/ensure-edge-network.sh"
  stage_compose config --quiet
}
