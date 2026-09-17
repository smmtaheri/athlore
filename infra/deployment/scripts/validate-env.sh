#!/usr/bin/env bash
# Validate the non-secret runtime contract for the three-host deployment.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for key in TLS_MODE PUBLIC_DOMAIN COACH_DOMAIN STUDENT_DOMAIN DJANGO_ALLOWED_HOSTS CSRF_TRUSTED_ORIGINS CORS_ALLOWED_ORIGINS PUBLIC_API_BASE_URL; do
  if [[ -z "${!key:-}" ]]; then
    echo "ERROR: ${key} is required in ${ENV_FILE}" >&2
    exit 1
  fi
done

if [[ "$TLS_MODE" != "external" ]]; then
  echo "ERROR: TLS_MODE must be external; HTTPS is terminated by the ParsPack CDN" >&2
  exit 1
fi

contains_csv_value() {
  local list=",$1,"
  local value="$2"
  [[ "$list" == *",${value},"* ]]
}

contains_origin() {
  local list=",$1,"
  local origin="$2"
  [[ "$list" == *",${origin},"* ]]
}

for domain in "$PUBLIC_DOMAIN" "$COACH_DOMAIN" "$STUDENT_DOMAIN"; do
  if ! contains_csv_value "$DJANGO_ALLOWED_HOSTS" "$domain"; then
    echo "ERROR: ${domain} is missing from DJANGO_ALLOWED_HOSTS" >&2
    exit 1
  fi
done

if [[ "${DJANGO_DEBUG:-false}" == "true" ]]; then
  ORIGIN_SCHEME="http"
  ORIGIN_PORT="${HTTP_PORT:-80}"
  if [[ "$ORIGIN_PORT" == "80" ]]; then ORIGIN_SUFFIX=""; else ORIGIN_SUFFIX=":${ORIGIN_PORT}"; fi
else
  ORIGIN_SCHEME="https"
  ORIGIN_SUFFIX=""
fi
for domain in "$PUBLIC_DOMAIN" "$COACH_DOMAIN" "$STUDENT_DOMAIN"; do
  origin="${ORIGIN_SCHEME}://${domain}${ORIGIN_SUFFIX}"
  if ! contains_origin "$CSRF_TRUSTED_ORIGINS" "$origin"; then
    echo "ERROR: ${origin} is missing from CSRF_TRUSTED_ORIGINS" >&2
    exit 1
  fi
  if ! contains_origin "$CORS_ALLOWED_ORIGINS" "$origin"; then
    echo "ERROR: ${origin} is missing from CORS_ALLOWED_ORIGINS" >&2
    exit 1
  fi
done

EXPECTED_ORIGINS="${ORIGIN_SCHEME}://${PUBLIC_DOMAIN}${ORIGIN_SUFFIX},${ORIGIN_SCHEME}://${COACH_DOMAIN}${ORIGIN_SUFFIX},${ORIGIN_SCHEME}://${STUDENT_DOMAIN}${ORIGIN_SUFFIX}"
if [[ "$CSRF_TRUSTED_ORIGINS" != "$EXPECTED_ORIGINS" ]]; then
  echo "ERROR: CSRF_TRUSTED_ORIGINS must contain only the three canonical origins: ${EXPECTED_ORIGINS}" >&2
  exit 1
fi
if [[ "$CORS_ALLOWED_ORIGINS" != "$EXPECTED_ORIGINS" ]]; then
  echo "ERROR: CORS_ALLOWED_ORIGINS must contain only the three canonical origins: ${EXPECTED_ORIGINS}" >&2
  exit 1
fi

if [[ "${DJANGO_DEBUG:-false}" != "true" && "$PUBLIC_API_BASE_URL" != https://* ]]; then
  echo "ERROR: PUBLIC_API_BASE_URL must use https when DJANGO_DEBUG is false" >&2
  exit 1
fi

if [[ "${DJANGO_DEBUG:-false}" != "true" ]]; then
  for key in DJANGO_SECURE_SSL_REDIRECT DJANGO_SESSION_COOKIE_SECURE DJANGO_CSRF_COOKIE_SECURE; do
    if [[ "${!key:-false}" != "true" ]]; then
      echo "ERROR: ${key}=true is required in production behind the HTTPS CDN" >&2
      exit 1
    fi
  done
fi

echo "Environment is valid"
echo "  TLS_MODE=${TLS_MODE} (Parspack CDN HTTPS)"
echo "  PUBLIC_DOMAIN=${PUBLIC_DOMAIN}"
echo "  COACH_DOMAIN=${COACH_DOMAIN}"
echo "  STUDENT_DOMAIN=${STUDENT_DOMAIN}"
echo "  HTTP_PORT=${HTTP_PORT:-80}"
