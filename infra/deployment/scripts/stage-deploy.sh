#!/usr/bin/env bash
# Update only the dedicated stage checkout from origin/stage, then rebuild it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if [[ "$(git -C "$REPO_ROOT" branch --show-current)" != "stage" ]]; then
  echo "ERROR: stage-deploy.sh only runs from a checkout on the stage branch." >&2
  exit 1
fi
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "ERROR: stage checkout has local changes; commit or safely preserve them before updating." >&2
  exit 1
fi

git -C "$REPO_ROOT" fetch origin stage
git -C "$REPO_ROOT" merge --ff-only FETCH_HEAD
if [[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" != "$(git -C "$REPO_ROOT" rev-parse FETCH_HEAD)" ]]; then
  echo "ERROR: this checkout is not exactly at origin/stage after fast-forward." >&2
  echo "Publish the intended stage commit, then retry from the stage checkout." >&2
  exit 1
fi
exec "$REPO_ROOT/infra/deployment/scripts/stage-build.sh"
