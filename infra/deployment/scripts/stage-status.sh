#!/usr/bin/env bash
# Show stage containers and whether its shared edge network exists.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=infra/deployment/scripts/stage-common.sh
source "$ROOT/scripts/stage-common.sh"

if [[ ! -f "$STAGE_ENV_FILE" ]]; then
  echo "Stage is not initialized (.env.stage is missing)."
  exit 0
fi

stage_load_env
echo "== Stage Compose status =="
stage_compose ps --all
echo
if docker network inspect athlore-edge >/dev/null 2>&1; then
  echo "Shared edge network: present"
else
  echo "Shared edge network: missing (run stage-up.sh or production up.sh)"
fi
echo "URLs: https://stage.coach.athlore.ir/ and https://stage.student.athlore.ir/"
