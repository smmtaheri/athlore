# Athlore deployment

This repository deploys Athlore's three independent browser surfaces:

```text
athlore.ir          -> public Home
coach.athlore.ir   -> coach login and panel
student.athlore.ir -> student login and panel
```

The frontend asset is shared, but the host-aware router mounts only the
surface allowed for the current hostname. Invalid browser routes receive a
real application 404; legacy route aliases and redirects are not provided.

## Production topology

ParsPack must proxy all three hostnames to this server and terminate HTTPS at
the CDN. The origin serves HTTP only on port 80; it does not need a local
certificate or an origin port 443.

```text
Browser HTTPS -> ParsPack CDN -> HTTP :80 -> Nginx -> frontend/backend
```

The CDN must forward `X-Forwarded-Proto: https`. Nginx preserves that value
for Django's `SECURE_PROXY_SSL_HEADER`, so Django can keep SSL redirects,
secure cookies, and HSTS enabled even though the origin connection is HTTP.

Required checkout layout:

```text
/root/athlore/apps/backend
/root/athlore/apps/front
/root/athlore/infra/deployment
```

## Runtime `.env`

The production file is `/root/athlore/infra/deployment/.env` and must not be
committed. Start from `.env.production.example` and keep the secret values
private.

```env
TLS_MODE=external
PUBLIC_DOMAIN=athlore.ir
COACH_DOMAIN=coach.athlore.ir
STUDENT_DOMAIN=student.athlore.ir
HTTP_PORT=80
```

Production origins must be exactly the HTTPS origins of these three
hostnames in `CSRF_TRUSTED_ORIGINS` and `CORS_ALLOWED_ORIGINS`. The same three
hostnames must be in `DJANGO_ALLOWED_HOSTS`. API and authentication responses
are marked `Cache-Control: no-store` so the CDN must not cache them.

## Build and deployment

```bash
cd /root/athlore/infra/deployment
./scripts/deploy.sh
```

The deploy script synchronizes the monorepo, preserves the existing runtime
`.env` and data volumes, validates the environment, builds the
frontend/backend images, and starts the Compose stack. It does not create demo
users unless explicitly enabled through the production environment.

For a Compose update without repository synchronization:

```bash
cd /root/athlore/infra/deployment
./scripts/up.sh
```

## Status

```bash
cd /root/athlore/infra/deployment
./scripts/status.sh
```

This reports the Compose state, the HTTP origin health endpoint, and whether
the rendered Nginx configuration is using the external CDN mode. Public
HTTPS should be checked through ParsPack after deployment.

## Final browser routes

```text
https://athlore.ir/
https://coach.athlore.ir/login
https://coach.athlore.ir/dashboard
https://coach.athlore.ir/students
https://student.athlore.ir/login
https://student.athlore.ir/dashboard
https://student.athlore.ir/visits
https://student.athlore.ir/visits/:visitId
https://student.athlore.ir/body-check
```

The API is available under `/api/v1/` through Nginx. No database migration is
introduced by this deployment change.
