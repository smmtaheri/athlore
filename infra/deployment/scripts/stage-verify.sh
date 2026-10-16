#!/usr/bin/env bash
# Refresh legacy CDN cache entries and verify the deployed stage frontend/API.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=infra/deployment/scripts/stage-common.sh
source "$ROOT/scripts/stage-common.sh"
stage_load_env
stage_validate_env

expected_bundle="$(stage_compose exec -T frontend cat /usr/share/nginx/html/index.html < /dev/null \
  | sed -n 's/.*src="\(\/assets\/[^\"]*\.js\)".*/\1/p')"
if [[ -z "$expected_bundle" ]]; then
  echo "ERROR: could not identify the deployed stage frontend bundle." >&2
  exit 1
fi

response_headers="$(mktemp)"
response_body="$(mktemp)"
trap 'rm -- "$response_headers" "$response_body"' EXIT

for hostname in "$PUBLIC_DOMAIN" "$COACH_DOMAIN" "$STUDENT_DOMAIN"; do
  for encoding in identity gzip 'gzip, deflate, br' 'gzip, deflate, br, zstd'; do
    # Revalidate older responses cached before the stage no-store policy existed.
    # A deliberately different ETag forces a full response, not a stale 304.
    curl --fail --silent --show-error --compressed --max-time 20 \
      --header "Accept-Encoding: $encoding" \
      --header 'Cache-Control: no-cache' --header 'Pragma: no-cache' \
      --header 'If-None-Match: "athlore-deploy-refresh"' \
      --output /dev/null "https://$hostname/"
    curl --fail --silent --show-error --compressed --max-time 20 \
      --header "Accept-Encoding: $encoding" \
      --dump-header "$response_headers" --output "$response_body" \
      "https://$hostname/"
    if ! grep -Fq "$expected_bundle" "$response_body" \
      || ! grep -iEq '^cache-control:.*no-store' "$response_headers"; then
      echo "ERROR: https://$hostname/ still serves an outdated or cacheable frontend ($encoding)." >&2
      exit 1
    fi
  done
  curl --fail --silent --show-error --max-time 20 \
    "https://$hostname/api/v1/health/" \
    | python3 -c 'import json, sys; result = json.load(sys.stdin); sys.exit(0 if result.get("status") == "ok" and result.get("database") == "ok" else 1)'
  echo "==> Verified https://$hostname/: current frontend, no-store, and healthy API"
done

echo "==> Stage deployment verified through the public CDN"
