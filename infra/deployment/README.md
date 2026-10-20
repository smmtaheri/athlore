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
`.env` and data volumes, validates the environment, stops the Compose stack,
builds the frontend/backend images sequentially, and starts the stack again.
The site is unavailable during the build. `docker compose down` is run without
`--volumes`, so PostgreSQL data and uploaded media are preserved. If a build or
startup command fails, the script attempts to restart the existing Compose
images without rebuilding. It does not create demo users unless explicitly
enabled through the production environment.

For a Compose update without repository synchronization:

```bash
cd /root/athlore/infra/deployment
./scripts/up.sh
```

## Backups and disaster recovery

The canonical [backup/update/restore runbook](docs/backup-restore.md) covers
laptop snapshots, offline images, uploaded media, and recovery on a fresh
replacement server. Run `bash infra/deployment/scripts/backup.sh --mode full`
from the laptop monorepo root. Use `--mode update` for subsequent snapshots.
Do not use deployment scripts for offline disaster recovery.

A successful backup/`verify` does not prove destination Docker compatibility
or complete DB/account recovery. The runbook records the 2026-10-20 image
archive failure and requires a real restore rehearsal, row/password-hash
comparison, and separate stage/SSH/GitHub/CDN inventory before accepting a
replacement backup or retiring the previous host. The current collector
backs up production only; compatibility/audit helpers are not yet bundled
automatically. Read those requirements before taking the next backup.

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

The API is available under `/api/v1/` through Nginx. The backend entrypoint
applies database migrations before becoming healthy; visit photo staging adds
the `0015_stagedvisitphoto` migration.

Visit photo uploads use a private staging table and shared media volume. The
`visit-photo-pruner` service removes expired uploads every hour after the
backend is healthy. Check `docker compose ps visit-photo-pruner` if temporary
media usage grows unexpectedly.

## Branch-aware deploy command

The globally installed `deploy-athlore` command selects the environment from
the current branch, regardless of the caller's working directory:

- `main` deploys production.
- `stage` deploys the isolated staging stack and, when needed, reloads only the
  shared production Nginx edge so all stage hostnames route correctly.
- Any other branch or detached `HEAD` is rejected to prevent deploying a
  feature branch to the wrong environment.

The checkout must be clean before deployment. The command publishes commits
from the selected branch when needed; it does not create commits or deploy
uncommitted files. Dedicated stage controls (`up-stage-athlore`,
`down-stage-athlore`, and `status-stage-athlore`) remain available.

The explicit `deploy-stage-athlore` command always publishes the local `stage`
branch and deploys the isolated stage checkout, even when the laptop checkout
is on `main`, another branch, or a detached commit. It does not switch the
laptop checkout or publish its current `HEAD` as stage. The checkout must still
be clean, and a missing, behind, or incorrectly tracked stage branch is rejected.

## Staging environment

Stage uses the same server and public IP, but runs as an isolated Compose
project (`athlore-stage`) with a separate PostgreSQL volume, media volume,
secrets, and uniquely tagged backend/frontend images. It does not copy or
connect to production data. Demo fixtures are disabled. Keep its source in a
separate checkout on the `stage` branch (for example `/root/athlore-stage`);
do not run the production `deploy.sh` from that checkout.

The three stage hostnames are routed by the production Nginx edge proxy over a
private Docker network. No extra host port or ParsPack Origin Rule is needed.
`deploy-stage-athlore` (and `deploy-athlore` while the local branch is `stage`)
builds the isolated stage stack, then updates and validates the shared gateway
configuration and reloads only the production Nginx process if the route
changed. If `origin/main` lacks the route, the laptop helper publishes the
available fast-forward deployment-only commits from its local `main` ref
without checking out that branch; it refuses unrelated or diverged `main`
changes. Stage deploy does not rebuild or restart the production application,
database, or media services. When stage is stopped, the gateway responds with
HTTP 503, `Cache-Control: no-store`, and a clear plain-text staging-offline
message.

Stage responses use `Cache-Control: no-store` at the shared gateway so a CDN
cannot retain another environment's HTML or an older stage build. Deployment
revalidates previously cached HTML, then checks the exact public URLs against
the bundle in the running stage frontend and verifies each API health endpoint.
It fails instead of reporting success if the CDN still serves an old bundle
or omits the no-store policy.

ParsPack DNS/CDN must send `stage.athlore.ir`, `stage.coach.athlore.ir`, and
`stage.student.athlore.ir` to the same origin as production and provide HTTPS
for all three names. The CDN must preserve the `Host` header and forward
`X-Forwarded-Proto: https`. Do not point these names at a different origin IP.

From the laptop, the following globally installed commands work from any
directory. They connect through the existing SSH host alias `athlore` and run
against the separate `/root/athlore-stage` checkout:

```bash
# Push the local stage branch if needed, create the remote checkout on first
# use, fast-forward it, build/restart the isolated stage stack, and update the
# shared Nginx route if needed (without restarting production app services).
deploy-stage-athlore

# Fast on/off controls. Starting does not rebuild images.
up-stage-athlore
down-stage-athlore
status-stage-athlore

# Optional: start stage and rebuild its images.
up-stage-athlore --build
```

The commands use `ATHLORE_LOCAL_ROOT` (default
`$HOME/Desktop/Tasks/Nobitex/athlore`), `ATHLORE_STAGE_SSH_HOST` (default
`athlore`), and `ATHLORE_STAGE_REMOTE_ROOT` (default
`/root/athlore-stage`) if you need to override their locations. The first
`deploy-stage-athlore` creates the isolated server checkout automatically; SSH
must be able to access the Git remote from the server. Stage deploy changes
only the generated production Nginx config needed for shared host routing; it
does not change the production Git checkout or production Compose app services.

The scripts can also be run directly on the server from the stage checkout's
`infra/deployment` directory:

```bash
./scripts/stage-deploy.sh
./scripts/stage-up.sh
./scripts/stage-down.sh
./scripts/stage-status.sh
```

The first stage command creates a private `.env.stage` with independently
generated secrets. Back it up securely; do not commit or copy it from
production. `stage-down.sh` runs Compose down without `--volumes`, so its DB
and uploads persist while the containers release CPU/RAM. Never use `docker
compose down -v` or `docker volume prune` to switch stage off. The shared edge
network is private/internal and is retained when either stack is stopped.

`stage-deploy.sh` refuses a non-stage branch, a dirty checkout, or a checkout
that does not end up exactly at `origin/stage`. Keep the stage checkout in a
different directory from `/root/athlore`; the production deploy script always
tracks `main` and must not be used to update Stage.

## Temporary production code login

The production Compose defaults and example enable the same temporary fixed login
code as stage (`1111`) and display it in the no-SMS delivery notice. This is not
secure for public use: anyone who knows an active account's phone can sign in.
Connect a real SMS provider and remove the fixed code before treating OTP as a
secure production authentication method.
