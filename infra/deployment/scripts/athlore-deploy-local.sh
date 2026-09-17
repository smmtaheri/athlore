#!/usr/bin/env bash
# Laptop-side Athlore deploy entrypoint.
# 1) Push local monorepo commits ONLY when ahead of origin
# 2) SSH to production and run scripts/deploy.sh (sync + Compose)
#
# Invoked by the shell helper `deploy-athlore`. Does not create commits.
# Skips push when already synced (no pointless git push).
set -euo pipefail

ROOT="${ATHLORE_LOCAL_ROOT:-$HOME/Desktop/Tasks/Nobitex/athlore}"
DEPLOY_DIR="${ROOT}/infra/deployment"
DEPLOY_SCRIPT="${DEPLOY_DIR}/scripts/deploy.sh"

if [[ ! -f "${DEPLOY_SCRIPT}" ]]; then
  echo "Missing local deploy script: ${DEPLOY_SCRIPT}" >&2
  echo "Set ATHLORE_LOCAL_ROOT to your athlore checkout root." >&2
  exit 1
fi

_push_repo_if_needed() {
  local dir="$1"
  local label="$2"
  local branch
  local ahead
  local short

  if [[ ! -d "${dir}/.git" ]]; then
    echo "ERROR: ${label} is not a git repo: ${dir}" >&2
    exit 1
  fi

  if [[ -n "$(git -C "${dir}" status --porcelain)" ]]; then
    echo "ERROR: ${label} has uncommitted changes. Commit (or stash) before deploy-athlore." >&2
    echo "  path: ${dir}" >&2
    git -C "${dir}" status -sb >&2
    exit 1
  fi

  branch="$(git -C "${dir}" rev-parse --abbrev-ref HEAD)"
  if [[ "${branch}" == "HEAD" ]]; then
    echo "ERROR: ${label} is in detached HEAD. Check out a branch before deploy." >&2
    exit 1
  fi

  short="$(git -C "${dir}" rev-parse --short HEAD)"

  # Prefer local upstream tracking (updated by the last successful push) — no fetch.
  # Faster than fetch+push every deploy when nothing changed.
  if git -C "${dir}" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    ahead="$(git -C "${dir}" rev-list --count '@{u}..HEAD')"
    if [[ "${ahead}" == "0" ]]; then
      echo "==> ${label}: nothing to push (${short} = @{u})"
      return 0
    fi
    echo "==> Pushing ${label}: ${ahead} local commit(s) → $(git -C "${dir}" rev-parse --abbrev-ref '@{u}')"
    git -C "${dir}" push
    echo "==> ${label}: pushed $(git -C "${dir}" rev-parse --short HEAD)"
    return 0
  fi

  # No upstream yet: establish tracking once.
  echo "==> Pushing ${label}: no upstream — git push -u origin ${branch}"
  git -C "${dir}" push -u origin "HEAD:refs/heads/${branch}"
  echo "==> ${label}: pushed $(git -C "${dir}" rev-parse --short HEAD)"
}

echo "==> deploy-athlore: push only if needed, then remote deploy"
_push_repo_if_needed "${ROOT}" "athlore"

echo "==> Running remote deploy.sh on athlore"
ssh athlore "bash -s" < "${DEPLOY_SCRIPT}"
echo "==> deploy-athlore finished"
