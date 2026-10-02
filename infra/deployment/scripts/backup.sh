#!/usr/bin/env bash
# Run on the operator's laptop; collect a production snapshot over SSH.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/recovery.py" backup "$@"
