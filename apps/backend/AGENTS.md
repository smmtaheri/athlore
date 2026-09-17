# Athlore Backend — Agent Instructions

This repository is the Django / DRF API for Athlore.

## Stack

- **Language:** Python 3.12
- **Framework:** Django 5.2 + Django REST Framework
- **Auth:** JWT (`djangorestframework-simplejwt`)
- **DB:** PostgreSQL in deploy; SQLite allowed for local/temp QA via `DJANGO_DB_NAME`
- **PDF:** WeasyPrint (`delivery/`)
- **Deps:** `uv` + `uv.lock` (not Poetry)
- **Lint/format:** Ruff
- **Tests:** `manage.py test` / pytest-django; coverage via `coverage`

### Main apps

| App | Role |
|---|---|
| `accounts` | Coach profile, rules, templates, exercise bank, nutrition/supplement templates |
| `students` | Students, visits, measurements |
| `programming` | Program aggregate, generation (`rules_v1`), versions |
| `delivery` | PDF artifacts, share links, render |
| `common` | Errors, permissions, phone helpers |

Canonical docs live under `docs/` (API contract, domain model, phase notes). Read them before changing contracts.

**Product flows (Persian, coach/team):** canonical copy lives in the frontend repo at `docs/product-flows/` (sibling clone `apps/front`). Read those before changing Visit or Body Check behavior; do not duplicate the flow text into this backend repo.

Demo fixtures: `python manage.py seed_demo_fixtures` (see `accounts/demo_fixtures.py`). Production auto-load only with `LOAD_DEMO_FIXTURES=true`.

---

## Operating rules (mandatory)

### Analyze vs change

- **Analyze / explain / review:** read-only. Do not edit files, commit, or run mutating commands unless the user explicitly asks to apply a fix.
- **Implement / fix / add:** make the smallest change that satisfies the request.
- Do **not** change anything until the user explicitly asks for a change.

### Scope

- Stay inside the requested scope. No drive-by refactors, unrelated files, or “while we’re here” cleanups.
- No extra fallback paths, alternate code paths, or speculative abstractions unless the user explicitly asked for them.
- Business logic must have **one clear success path**. Failures must raise/return **explicit errors** — never silent swallows or quiet fallbacks that hide broken state.

### Code quality

- Prefer simple, readable code over clever abstractions.
- Avoid over-engineering; grow complexity only when the current design is clearly insufficient.
- Follow existing patterns in the touched modules.
- Match naming, layering, and error-envelope conventions already used in the API.

### Language

- **All agent docs, engineering docs, code comments, and commit messages must be English.**
- Do not add Persian comments or Persian engineering documentation.
- User-facing Persian strings (coach UI copy, exercise names, PDF body text, domain labels) are product content — change them only when the task is about that product copy, not “for consistency with English docs.”

### Docs and comments

- Before coding, read the relevant `docs/` and existing module docs to get context.
- After a change: update comments/docs **only when they would otherwise be wrong or misleading**. Do not rewrite docs for style alone.

### Git

- After every meaningful change set, **create a git commit** when the user asks (or when AGENTS says to after an implement task they requested).
- **Commit message format:** [Conventional Commits](https://www.conventionalcommits.org/) in English.
  - Examples: `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `test: …`, `chore: …`
  - Optional scope: `feat(students): …`, `fix(generator): …`
  - Subject: imperative, concise; focus on **why** when useful. Body optional for detail.
- Separate concerns when possible (e.g. behavior vs docs).
- Never update git config, never force-push protected branches, never commit secrets (`.env`, credentials).
- **Never `git push` (or otherwise publish commits) unless the user explicitly asks.**
- **Never deploy to any environment** (including `deploy-athlore`, `deploy.sh`, Compose on the server, or manual production commands) unless the user explicitly asks.
- Keep commits scoped to backend changes when the task only affects the backend.

### QA (default)

Unless the user explicitly says to skip QA / go fast / bypass checks, run:

```bash
uv run ruff check .
uv run ruff format --check .
uv run python -m compileall -q .
uv run python manage.py check
uv run python manage.py makemigrations --check
# Prefer PostgreSQL for full suites when available; temp SQLite only for narrow local checks
uv run python manage.py test
```

For focused work, at least run Ruff + the tests for the touched app.

### Protected / sensitive

- Do not touch product-owned `db.sqlite3` used as protected local data; use temp DB paths for experiments.
- Do not invent nutrition/supplement quantities that OCR left review-required.
- Generator / PDF changes need regression coverage for Arman-style acceptance when touching that path.

### Commits for this repo only

Commit inside this backend repository only. Do not mix frontend/deploy/product changes into this repo’s commits.
