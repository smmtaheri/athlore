#!/usr/bin/env bash
# Start an already-built stage stack. Use stage-build.sh to update its code.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=infra/deployment/scripts/stage-common.sh
source "$ROOT/scripts/stage-common.sh"

if [[ "${1:-}" == "--build" ]]; then
  exec "$ROOT/scripts/stage-build.sh"
elif [[ "$#" -gt 0 ]]; then
  echo "Usage: $0 [--build]" >&2
  exit 2
fi

stage_prepare
if ! stage_compose up -d --no-build; then
  echo "Stage did not start. If this is the first run, use ./scripts/stage-build.sh first." >&2
  exit 1
fi

echo "Stage is running:"
echo "  Coach:   https://stage.coach.athlore.ir/"
echo "  Student: https://stage.student.athlore.ir/"
echo "Stop it without deleting data: ./scripts/stage-down.sh"
