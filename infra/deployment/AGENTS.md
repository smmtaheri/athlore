# Athlore Deploy — Agent Instructions

This repository owns Docker Compose / Nginx / Helm-style deployment for Athlore.

## Stack

- **Compose:** `compose.yaml` (Postgres, backend, frontend, nginx)
- **Backend image:** builds from sibling `../../apps/backend` (uv, Gunicorn)
- **Frontend image:** builds from sibling `../../apps/front` (pnpm build → static)
- **Edge:** Nginx reverse proxy behind the ParsPack CDN; HTTP origin only
- **Secrets:** `.env` (never commit real secrets; use `.env.example`)

Athlore is a monorepo. Deployment files live here; application code lives in
the sibling `apps/backend` and `apps/front` directories.

---

## Operating rules (mandatory)

### Analyze vs change

- **Analyze:** read-only unless the user asks you to change compose/env/scripts.
- Do not edit application source in sibling folders from a deploy-only task unless the user explicitly expands scope.

### Scope

- Stay on deploy/ops concerns: compose, nginx, env examples, scripts, healthchecks.
- No extra fallback services or speculative infra unless requested.
- Failures must be visible (healthchecks, non-zero exits). Do not hide misconfiguration.

### Language

- **Docs, comments, commit messages: English only.**
- Do not add Persian comments or Persian ops documentation.

### Docs and comments

- Read `README.md` / `docs/` here before changing ports, env vars, or networking.
- Update env examples when you add/rename variables. Do not invent undocumented secrets.

### Git

- After meaningful deploy changes, **commit** when the user asks (or after an implement task they requested), in the monorepo.
- **Commit message format:** [Conventional Commits](https://www.conventionalcommits.org/) in English.
  - Examples: `feat: …`, `fix: …`, `docs: …`, `chore: …`
  - Optional scope: `feat(compose): …`, `fix(deploy): …`
- Never commit `.env` with real passwords.
- **Never `git push` (or otherwise publish commits) unless the user explicitly asks.**
  Exception for operators: the laptop helper `deploy-athlore` (via `scripts/athlore-deploy-local.sh`) pushes the Athlore monorepo as part of a deploy the user requested.
- **Never deploy to any environment** (including `deploy-athlore`, `scripts/deploy.sh`, `up.sh` against production, or manual server Compose) unless the user explicitly asks.

### Runtime .env (source of truth)

- On the production host, **`/root/athlore/infra/deployment/.env` is the runtime source of truth** for domain, TLS, CSRF, CORS, and API base URL.
- `deploy-athlore` / `scripts/deploy.sh` may **create** `.env` only when it does not exist, or fill **blank** secrets/defaults.
- They must **never overwrite** an existing non-empty `PUBLIC_DOMAIN`, `COACH_DOMAIN`, `STUDENT_DOMAIN`, `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`, or `PUBLIC_API_BASE_URL`.
- `.env.production.example` is documentation/template only — never store production secrets in Git.
- Before Compose up, `scripts/validate-env.sh` prints the effective non-secret domain settings and fails if any canonical domain is missing from `DJANGO_ALLOWED_HOSTS`.

### QA (default)

Unless the user says to skip:

- Validate compose syntax (`docker compose config`)
- After image/code deploys: confirm backend health and that intended containers restarted
- Prefer rebuilding only the services that changed

### Demo fixtures

- Backend entrypoint may load demo fixtures when `DJANGO_DEBUG=true` or `LOAD_DEMO_FIXTURES=true`.
- Production must not load fixed demo passwords unless explicitly opted in with the documented flags.
