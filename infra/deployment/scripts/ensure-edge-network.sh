#!/usr/bin/env bash
# Ensure the private Docker network shared by the production and stage proxies.
set -euo pipefail

NETWORK_NAME="athlore-edge"

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  internal="$(docker network inspect --format '{{.Internal}}' "$NETWORK_NAME")"
  if [[ "$internal" != "true" ]]; then
    echo "ERROR: Docker network ${NETWORK_NAME} already exists but is not internal." >&2
    echo "Refusing to change or replace an existing network automatically." >&2
    exit 1
  fi
  echo "Docker network ${NETWORK_NAME} is ready (internal=true)."
  exit 0
fi

docker network create --driver bridge --internal "$NETWORK_NAME" >/dev/null
echo "Created Docker network ${NETWORK_NAME} (internal=true)."
