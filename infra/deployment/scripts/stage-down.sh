#!/usr/bin/env bash
# Stop/remove stage containers but preserve its database and media volumes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=infra/deployment/scripts/stage-common.sh
source "$ROOT/scripts/stage-common.sh"

if [[ ! -f "$STAGE_ENV_FILE" ]]; then
  echo "Stage has not been initialized; there are no stage containers to stop."
  exit 0
fi

stage_load_env
stage_compose down
echo "Stage is stopped. Its athlore-stage database and media volumes were preserved."
