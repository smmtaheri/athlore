#!/usr/bin/env bash
# Run on a fresh replacement host; refuse existing containers, volumes or files.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/recovery.py" restore "$@"
