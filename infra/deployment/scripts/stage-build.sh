#!/usr/bin/env bash
# Build and start staging images sequentially, without touching production.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=infra/deployment/scripts/stage-common.sh
source "$ROOT/scripts/stage-common.sh"
REPO_ROOT="$(git -C "$ROOT/../.." rev-parse --show-toplevel 2>/dev/null || true)"

if [[ "$#" -gt 0 ]]; then
  echo "Usage: $0" >&2
  exit 2
fi
if [[ -z "$REPO_ROOT" || "$(git -C "$REPO_ROOT" branch --show-current)" != "stage" ]]; then
  echo "ERROR: stage-build.sh only builds from a Git checkout on the stage branch." >&2
  exit 1
fi
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "ERROR: stage checkout has local changes; commit them before building a reproducible stage image." >&2
  exit 1
fi

stage_prepare
NEW_IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"

restore_stage_on_failure() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 ]]; then
    echo "Stage build failed; attempting to restart the previously deployed stage images." >&2
    if ! stage_compose up -d --no-build; then
      echo "Previous stage images could not be started. Inspect stage-status.sh and Docker logs." >&2
    fi
  fi
  exit "$status"
}
trap restore_stage_on_failure EXIT

echo "==> Stopping only the stage stack (persistent stage volumes are preserved)"
stage_compose down
echo "==> Building stage images sequentially (tag: ${NEW_IMAGE_TAG})"
STAGE_IMAGE_TAG="$NEW_IMAGE_TAG" stage_compose --parallel 1 build
echo "==> Starting stage stack"
STAGE_IMAGE_TAG="$NEW_IMAGE_TAG" stage_compose up -d --no-build

_stage_upsert_env STAGE_IMAGE_TAG "$NEW_IMAGE_TAG"
trap - EXIT

echo "Stage is running from revision ${NEW_IMAGE_TAG}:"
echo "  Coach:   https://stage.coach.athlore.ir/"
echo "  Student: https://stage.student.athlore.ir/"
echo "Stop it without deleting data: ./scripts/stage-down.sh"
