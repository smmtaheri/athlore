#!/usr/bin/env bash
# Quick operator snapshot for the HTTP origin behind the ParsPack CDN.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

for key in TLS_MODE PUBLIC_DOMAIN COACH_DOMAIN STUDENT_DOMAIN; do
  if [[ -z "${!key:-}" ]]; then
    echo "${key} is required in .env" >&2
    exit 1
  fi
done

if [[ "$TLS_MODE" != "external" ]]; then
  echo "TLS_MODE must be external; HTTPS is terminated by the ParsPack CDN" >&2
  exit 1
fi

HTTP_PORT="${HTTP_PORT:-80}"
echo "== docker compose ps =="
docker compose ps

echo
echo "== Coach origin health check =="
curl -fsS --resolve "${COACH_DOMAIN}:${HTTP_PORT}:127.0.0.1" \
  "http://${COACH_DOMAIN}:${HTTP_PORT}/api/v1/health/"
echo

echo
echo "== Rendered external CDN-origin configuration =="
if [[ -f nginx/rendered/nginx.conf ]] \
  && grep -q "listen 80;" nginx/rendered/nginx.conf \
  && grep -q "X-Forwarded-Proto \$athlore_forwarded_proto" nginx/rendered/nginx.conf; then
  echo "rendered config: HTTP origin server block present"
else
  echo "rendered config: external origin server block missing — run scripts/render-nginx.sh"
fi
