# P0 Backend Implementation Notes

**Date:** 2026-08-06  
**Scope:** Authentication, CoachProfile ownership, Student CRUD, Monthly Visits, standard errors, tests  
**Design basis:** `domain-model.md`, `database-schema.md`, `api-contract.md`, `auth-and-permissions.md`

---

## 1. What was implemented

| Area | Status |
|---|---|
| JWT register / login / refresh (rotation + blacklist) / logout | Done |
| `GET /api/v1/me/`, `PATCH /api/v1/me/coach/` | Done |
| CoachProfile + empty CoachRuleSet on register | Done |
| Student aggregate + list/search/filter/pagination | Done |
| Student archive | Done |
| Visits + measurements + latest + unique date | Done |
| Coach ownership (404 cross-tenant) | Done |
| Standardized error envelope | Done |
| Automated tests | Done (17) |
| Legacy anonymous `/api/` routes | **Unmounted** (code retained in `programs/`) |
| `seed_demo_data` management command | Done (optional, not auto-run) |

---

## 2. Endpoints (actual)

Prefix: `/api/v1/`

| Method | Path | Auth |
|---|---|---|
| POST | `/auth/register/` | Anonymous |
| POST | `/auth/login/` | Anonymous |
| POST | `/auth/refresh/` | Anonymous (valid refresh) |
| POST | `/auth/logout/` | Bearer |
| GET | `/me/` | Bearer + CoachProfile |
| PATCH | `/me/coach/` | Bearer + CoachProfile |
| GET/POST | `/students/` | Bearer + CoachProfile |
| GET/PATCH | `/students/{uuid}/` | Bearer + CoachProfile |
| POST | `/students/{uuid}/archive/` | Bearer + CoachProfile |
| GET/POST | `/students/{uuid}/visits/` | Bearer + CoachProfile |
| GET | `/students/{uuid}/visits/latest/` | Bearer + CoachProfile |
| GET/PATCH/DELETE | `/students/{uuid}/visits/{uuid}/` | Bearer + CoachProfile |

Trailing slashes match Django `APPEND_SLASH` defaults.

---

## 3. Authentication behavior

- Package: `djangorestframework-simplejwt` + `token_blacklist`
- Access ~30 minutes, refresh ~7 days (env-tunable)
- Refresh rotation enabled; previous refresh blacklisted; the absolute refresh session window is seven days
- Logout blacklists the provided refresh token
- Passwords hashed via Django; never returned
- Email normalized to lowercase; stored as both `User.email` and `User.username`
- Deactivated users (`is_active=False`) cannot log in

---

## 4. Ownership enforcement

- DRF default permission: `IsAuthenticated`
- Product views use `IsAuthenticatedCoach` (requires `user.coach_profile`)
- Querysets filter by `coach_id`
- Lookups via `get_owned_object` / service helpers → **404** for other coaches
- Client-supplied `coach` / `coach_id` ignored on create
- Nested visits require parent student ownership first

---

## 5. Models and migrations

**New apps:** `accounts`, `students`, `common` (utilities, no models)

| Model | Notes |
|---|---|
| `CoachProfile` | UUID PK, OneToOne to Django User |
| `CoachRuleSet` | Empty shell 1:1 coach (rules API deferred) |
| `Student` | UUID PK; JSON value objects for goals/injuries/etc. |
| `Visit` | UUID PK; measurement columns; unique `(student, visit_date)` |

**Migrations added:**

- `accounts/migrations/0001_initial.py`
- `students/migrations/0001_initial.py`

**Preserved:** `programs/migrations/0001_initial.py` (prototype tables remain for later generator salvage).

---

## 6. Legacy prototype handling

- Old anonymous routes under `/api/` are **not mounted** in `coach_copilot/urls.py`.
- `programs` app remains installed so historical migrations and `planner.py` still import.
- Prototype `Coach` / `StudentProfile` tables are **not** used by `/api/v1/`.
- No automatic data migration from prototype rows (unsafe / ambiguous). Cleanup deferred.

---

## 7. Dependencies added

| Package | Why |
|---|---|
| `djangorestframework-simplejwt` | JWT access/refresh, rotation, blacklist logout per auth design |
| `django-cors-headers` | Allowlisted CORS for Vite SPA (`localhost:5173`); covered by OPTIONS tests |

Pinned via `pyproject.toml` + `uv.lock`.

## 7b. Environment variables

See `.env.example`:

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Secret (≥32 chars recommended for JWT HMAC) |
| `DJANGO_DEBUG` | `true`/`false` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated |
| `DJANGO_DB_NAME` | SQLite path override (use temp file for experiments) |
| `CORS_ALLOWED_ORIGINS` | Frontend origins |
| `JWT_ACCESS_MINUTES` / `JWT_REFRESH_DAYS` | Token lifetimes |

---

## 8. Local setup

```bash
cd coach-assistant-backend
uv sync --frozen
# or: python -m venv .venv && source .venv/bin/activate && pip install -e .
export DJANGO_DB_NAME=/tmp/coach_assistant_dev.sqlite3   # do not reuse drifted local db.sqlite3
python manage.py migrate
python manage.py seed_demo_data   # optional
python manage.py runserver 0.0.0.0:8000
```

**Important:** Do not migrate or overwrite the existing workspace `db.sqlite3` that contains unrelated Persian demo data. Point `DJANGO_DB_NAME` at a fresh file.

---

## 9. Test / QA commands

```bash
uv lock --check
python manage.py check
python manage.py check --deploy
DJANGO_DB_NAME=/tmp/coach_assistant_migrate_check.sqlite3 python manage.py migrate --noinput
python manage.py makemigrations --check --dry-run
python manage.py test accounts students
```

---

## 10. Deviations from design documents

| Design preference | Implementation | Reason |
|---|---|---|
| Custom User with UUID PK | Django default `auth.User` (integer PK); CoachProfile UUID | Changing `AUTH_USER_MODEL` after existing auth migrations is unsafe; preserves forward-migrate from `programs.0001_initial` |
| User.id UUID in API examples | `user.id` is stringified integer PK | Consequence of default User |
| Coach rules full schema | Only empty `CoachRuleSet` row | Explicitly deferred past P0 |
| OpenAPI | Not added | Deferred in design / milestone |
| Postgres | SQLite default for local/tests; Postgres still recommended for shared staging | Milestone did not add Docker/Postgres |

---

## 11. Manual smoke-flow result

Executed via Django `APIClient` against the test runner DB flow (see QA appendix / smoke script):

1. Register Coach A — **pass**
2. Authenticate / tokens — **pass**
3. `GET /me/` — **pass**
4. Create Student A — **pass**
5. List students — **pass**
6. Update Student A — **pass**
7. Create two visits — **pass**
8. Latest visit — **pass**
9. Register Coach B — **pass**
10. Coach B cannot see Student A — **pass** (404 / empty list)
11. Coach B cannot access visits — **pass** (404)
12. Logout / blacklist refresh — **pass**
13. Revoked refresh cannot refresh — **pass**

Automated suite: **19 tests OK**.

---

## 12. Known limitations

- No program/rules/PDF/dashboard APIs
- Default User integer IDs (not UUID)
- SQLite locally; production should use Postgres per design
- Prototype `programs_*` tables still present after migrate
- No rate limiting middleware yet
- Password reset not implemented (P2 in auth design)
- OpenAPI not configured

---

## 13. Deferred scope (next milestones)

Coach rules API, templates, exercise bank, program generation/editing/versioning, nutrition, supplements, PDF, dashboard, Frontend API swap, CI/CD, deployment, AI engines.
