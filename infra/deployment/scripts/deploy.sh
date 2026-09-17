#!/usr/bin/env bash
# Athlore production deploy (safe).
# - Ensures /root/athlore is a checkout of the Athlore monorepo
# - Converts the legacy three-checkout layout in place on its first run
# - Creates .env from example ONLY when missing; never overwrites an existing .env
# - Existing .env is the runtime source of truth for TLS mode and domains/origins
# - Runs ./scripts/up.sh without creating demo users
# Does NOT: overwrite non-empty .env domain/origin values, delete volumes, touch media/DB.
# Note: local tracked edits on the server are discarded so pull never blocks
# (e.g. prior compose.yaml path patches). Untracked files like .env are kept.
set -euo pipefail

ATHLORE_ROOT="${ATHLORE_ROOT:-/root/athlore}"
DEPLOY_DIR="${ATHLORE_ROOT}/infra/deployment"
REPO_URL="${ATHLORE_GIT_URL:-git@github.com:smmtaheri/athlore.git}"

ensure_monorepo() {
  local legacy_git_dir

  mkdir -p "${ATHLORE_ROOT}"
  if [[ ! -d "${ATHLORE_ROOT}/.git" ]]; then
    echo "==> Migrating legacy Athlore checkouts to the monorepo"
    # These are Git metadata directories only. Runtime files such as
    # infra/deployment/.env stay in place and remain ignored by Git.
    for legacy_git_dir in \
      "${ATHLORE_ROOT}/apps/backend/.git" \
      "${ATHLORE_ROOT}/apps/front/.git" \
      "${ATHLORE_ROOT}/infra/deployment/.git"; do
      if [[ -d "${legacy_git_dir}" ]]; then
        rm -rf "${legacy_git_dir}"
      fi
    done
    git -C "${ATHLORE_ROOT}" init -b main
    git -C "${ATHLORE_ROOT}" remote add origin "${REPO_URL}"
  else
    git -C "${ATHLORE_ROOT}" remote set-url origin "${REPO_URL}"
  fi

  echo "==> Syncing Athlore monorepo to origin/main (${ATHLORE_ROOT})"
  git -C "${ATHLORE_ROOT}" fetch origin main

  if git -C "${ATHLORE_ROOT}" rev-parse --verify HEAD >/dev/null 2>&1; then
    git -C "${ATHLORE_ROOT}" checkout -B main origin/main
  else
    # The legacy files are currently untracked because their nested Git
    # metadata was removed during the migration. Stage them temporarily so
    # checkout can safely replace tracked files with the monorepo versions.
    # Ignored runtime files such as infra/deployment/.env are not staged.
    git -C "${ATHLORE_ROOT}" add --all
  fi

  # The deployment host is not for manual commits. This preserves ignored
  # runtime files such as infra/deployment/.env while updating tracked code.
  git -C "${ATHLORE_ROOT}" reset --hard origin/main
}

# Write KEY=VALUE into .env: replace existing line, or append. Never deletes other keys.
# Prefer _ensure_default / _ensure_secret for production — those never overwrite non-empty values.
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
    ' .env >"$tmp"
    mv "$tmp" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

_ensure_secret() {
  local key="$1"
  local nbytes="$2"
  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  local current="${!key-}"
  if [[ -n "${current}" ]]; then
    return 0
  fi
  local value
  value="$(python3 -c "import secrets; print(secrets.token_urlsafe(${nbytes}))")"
  _upsert_env "$key" "$value"
  echo "==> Generated empty ${key} into .env"
}

# Fill a blank/missing key only. Never overwrite an existing non-empty value.
_ensure_default() {
  local key="$1"
  local value="$2"
  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  local current="${!key-}"
  if [[ -n "${current}" ]]; then
    return 0
  fi
  _upsert_env "$key" "$value"
  echo "==> Defaulted empty ${key}=${value}"
}

# First-boot only: fill the canonical production configuration.
_apply_first_boot_domain_defaults() {
  _ensure_default PUBLIC_DOMAIN "athlore.ir"
  _ensure_default COACH_DOMAIN "coach.athlore.ir"
  _ensure_default STUDENT_DOMAIN "student.athlore.ir"
  _ensure_default HTTP_PORT "80"
  _ensure_default TLS_MODE "external"
  _ensure_default DJANGO_DEBUG "false"
  _ensure_default DJANGO_ALLOWED_HOSTS "athlore.ir,coach.athlore.ir,student.athlore.ir"
  _ensure_default CSRF_TRUSTED_ORIGINS "https://athlore.ir,https://coach.athlore.ir,https://student.athlore.ir"
  _ensure_default CORS_ALLOWED_ORIGINS "https://athlore.ir,https://coach.athlore.ir,https://student.athlore.ir"
  _ensure_default PUBLIC_API_BASE_URL "https://athlore.ir/api/v1"
  _ensure_default LOAD_DEMO_FIXTURES "false"
  _ensure_default PUBLIC_REGISTRATION_ENABLED "false"
  _ensure_default DJANGO_SECURE_SSL_REDIRECT "true"
  _ensure_default DJANGO_SESSION_COOKIE_SECURE "true"
  _ensure_default DJANGO_CSRF_COOKIE_SECURE "true"
  _ensure_default DJANGO_SECURE_HSTS_SECONDS "31536000"
}

ensure_monorepo

cd "${DEPLOY_DIR}"

ENV_CREATED=0
if [[ ! -f .env ]]; then
  if [[ -f .env.production.example ]]; then
    echo "==> Creating .env from .env.production.example (first boot only)"
    cp .env.production.example .env
  elif [[ -f .env.example ]]; then
    echo "==> Creating .env from .env.example (first boot only)"
    cp .env.example .env
  else
    echo "ERROR: No .env.production.example or .env.example in ${DEPLOY_DIR}" >&2
    exit 1
  fi
  ENV_CREATED=1
fi

# Existing .env is the runtime source of truth.
# Only fill blank keys; never rewrite non-empty domain/origin values.
# shellcheck disable=SC1091
set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ "${ENV_CREATED}" == "1" ]]; then
  _apply_first_boot_domain_defaults
else
  echo "==> Preserving existing .env (domains/origins will not be overwritten)"
  _ensure_default TLS_MODE "external"
  _ensure_default LOAD_DEMO_FIXTURES "false"
fi

_ensure_secret POSTGRES_PASSWORD 24
_ensure_secret DJANGO_SECRET_KEY 48

echo "==> Validating runtime .env (non-secret)"
./scripts/validate-env.sh

echo "==> Building and restarting Compose stack (up.sh)"
./scripts/up.sh

echo "==> Waiting for backend to become healthy"
ready=0
for _ in $(seq 1 90); do
  if docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/', timeout=3)" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "${ready}" != "1" ]]; then
  echo "ERROR: backend did not become healthy in time" >&2
  docker compose ps >&2 || true
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck disable=SC1091
source .env
set +a
echo "==> Deployment ready"
echo "    Public:  https://${PUBLIC_DOMAIN}/"
echo "    Coach:   https://${COACH_DOMAIN}/login"
echo "    Student: https://${STUDENT_DOMAIN}/login"
