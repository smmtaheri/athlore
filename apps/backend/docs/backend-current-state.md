# Coach Assistant Backend — Current-State Audit

**Audit date:** 2026-08-06  
**Backend commit audited:** `144520e` (`chore: initialize backend repository`)  
**Report path:** `coach-assistant-backend/docs/backend-current-state.md`  
**Scope:** Evidence-based inventory of the existing backend; no final domain design or implementation.

> **Packaging note (post-audit):** dependency management later migrated from Poetry to **uv** (`pyproject.toml` + `uv.lock`, Python 3.12). Historical `poetry …` commands in this audit should be read as of the audit date; use `uv sync --frozen` / `uv run …` today.

Labels used below:

- **Current implementation** — verified in code or by executing project commands
- **Confirmed absence** — searched and not found
- **Inference** — reasonable conclusion from evidence, not directly asserted by code
- **Recommendation** — suggested next work; not executed in this audit
- **Open question** — unresolved decision needed before design/implementation

---

## 1. Executive Summary

The backend is an early **Django 5.2 + Django REST Framework** prototype named **coach-copilot**, focused on coach-owned templates, rules, exercise preferences, a thin student profile, and **workout-only program generation** with history.

It is **not** an integration-ready Coach Assistant API. Relative to the finished Frontend MVP (localStorage, Persian RTL, full student forms, monthly visits, coach-rules sections, nutrition/supplements, program editing/versioning, mock PDF, mock auth), the backend covers only a **narrow experimental slice** of training-program generation.

**What exists and is runnable**

- Models: `Coach`, `Exercise`, `CoachExercisePreference`, `CoachTemplate`, `CoachRule`, `StudentProfile`, `GeneratedProgram`
- Anonymous CRUD (or read-only) HTTP APIs under `/api/`
- Deterministic-seeded weighted exercise planner in `programs/core/planner.py`
- One initial migration; local SQLite DB present and migrated
- Seed fixture `programs/fixtures/initial_data.json` (English demo coaches)
- Django admin registration for all models

**What is missing for Frontend integration (high level)**

- Real authentication, sessions/tokens, password hashing, coach–user binding
- Object-level ownership / permission enforcement (APIs are effectively public)
- Rich student profile matching Frontend/product forms
- Monthly visits and body measurements
- Structured coach-rules model matching Frontend (`levels`, `injuries`, `musclePriorities`, `exerciseBank`, `generalRules`)
- Editable program documents (training + nutrition + supplements), statuses, duplication, versioning, activation
- PDF generation and PDF file history
- Dashboard aggregation APIs
- Pagination, search/filter contracts, normalized error responses, OpenAPI, tests, CI, Docker, env-based secrets

**Verdict:** Treat this repository as a **reusable prototype of a training generator**, not as the production domain model. Preserve the planner ideas; redesign schema, auth, and API contract in a dedicated design phase before Frontend integration.

---

## 2. Audit Scope and Method

### In scope

- Entire `coach-assistant-backend` tree (source, config, fixtures, migration, README, lockfile)
- Comparison against `coach-assistant-frontend` repositories/types/routes (read-only)
- Product design docs under `coach-assistant-product/docs/design/` and references (read-only)
- Safe executable checks documented by the project or Django defaults

### Out of scope (explicitly not done)

- Implementing features, migrations, dependency updates, or Frontend changes
- Designing the final schema/API/auth as if already decided
- Destructive Git operations or discarding local untracked files

### Recovery from interrupted prior run

| Check | Result |
|---|---|
| `docs/backend-current-state.md` | **Confirmed absence** before this audit; empty `docs/` directory existed (created ~2026-08-04) with no report file |
| Backend Git status | Clean working tree; only commit `144520e` |
| Uncommitted source diffs | None |
| Frontend / Product Git status | Clean; not modified |
| Agent transcripts | Prior attempt failed early (proxy/socket error); no completed audit artifacts |
| Untracked local artifacts | `.venv/`, `db.sqlite3`, `__pycache__/`, `.idea/` (ignored); empty `docs/` |

**Current implementation note:** Local untracked `db.sqlite3` contains Persian demo data (coach «آرمان واعظی», student «محمد طاهری») that **differs** from committed English fixture `programs/fixtures/initial_data.json`. This audit did not modify that database beyond read/API probes.

### Method

1. Inventory repository files and Git history  
2. Read settings, models, serializers, views, URLs, planner, migration, fixtures, README, `pyproject.toml`, `poetry.lock`  
3. Map Frontend storage keys, types, repositories, generator, routes  
4. Scan product design docs for required capabilities  
5. Run Django system/migration/test/import/API smoke checks; record blockers for unavailable tools  

---

## 3. Technology Stack

| Area | Finding | Evidence | Label |
|---|---|---|---|
| Language | Python; project declares `requires-python = ">=3.11"`; local venv is **3.12.9** | `pyproject.toml`; `.venv/pyvenv.cfg` | Current implementation |
| Framework | Django **5.2.14** (constraint `Django>=5.0,<6.0`) | `poetry.lock`; `pip`/import in venv | Current implementation |
| API | Django REST Framework **3.17.1** (`>=3.15,<4.0`) | `poetry.lock`; `INSTALLED_APPS` | Current implementation |
| Packaging | Poetry lockfile present; minimal `pyproject.toml` with `[tool.setuptools] py-modules = []` | `pyproject.toml`, `poetry.lock` | Current implementation |
| Database | SQLite via `django.db.backends.sqlite3` → `BASE_DIR / db.sqlite3` | `coach_copilot/settings.py` | Current implementation |
| ORM | Django ORM | `programs/models.py` | Current implementation |
| Migrations | Django migrations; one app migration `0001_initial` | `programs/migrations/0001_initial.py` | Current implementation |
| Auth (HTTP) | DRF defaults: `SessionAuthentication`, `BasicAuthentication`; permission default **`AllowAny`** | DRF settings inspection at runtime | Current implementation |
| Auth (product) | No login/register/JWT/token models for coaches | Code search; no auth app/views | Confirmed absence |
| Validation | DRF `ModelSerializer` with `fields = "__all__"` only | `programs/serializers.py` | Current implementation |
| Service layer | Planner functions only; no dedicated services package | `programs/core/planner.py` | Current implementation |
| DI | None beyond Django/DRF | — | Confirmed absence |
| OpenAPI | No `drf-spectacular` / schema views | Code/deps | Confirmed absence |
| Tests | No test modules; `manage.py test` → 0 tests | Runtime | Confirmed absence |
| Lint/format | No project config for ruff/black/flake8/mypy | No config files; tools not in project deps | Confirmed absence |
| Docker/Compose | None | Glob | Confirmed absence |
| CI | No `.github/` workflows | Glob | Confirmed absence |
| Jobs/queues | None | Code | Confirmed absence |
| File/media storage | No `MEDIA_*`, no file fields | `settings.py`, models | Confirmed absence |
| CORS | `django-cors-headers` not installed; no CORS settings | deps/settings | Confirmed absence |
| Env files | `.env` gitignored; **no** `.env.example`; secrets hardcoded in settings | `.gitignore`, `settings.py` | Current implementation / Confirmed absence |

Project display name in README is **“Coach Copilot Custom”**, not “Coach Assistant” — naming drift from the product workspace.

---

## 4. Repository Structure

```text
coach-assistant-backend/
├── manage.py
├── pyproject.toml
├── poetry.lock
├── README.md
├── .gitignore
├── coach_copilot/          # Django project package
│   ├── settings.py
│   ├── urls.py             # admin + /api/
│   ├── asgi.py
│   └── wsgi.py
├── programs/               # Sole Django app
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   ├── urls.py
│   ├── admin.py
│   ├── apps.py
│   ├── core/planner.py     # Generation engine
│   ├── fixtures/initial_data.json
│   └── migrations/0001_initial.py
└── docs/                   # Audit docs (this report)
```

**Confirmed absence:** No separate `users`, `students`, `auth`, `pdf`, `nutrition`, or `dashboard` apps. No `tests/` package. No `requirements.txt` (Poetry only).

**Local-only (ignored, not in Git):** `.venv/`, `db.sqlite3`, `__pycache__/`, `.idea/`.

---

## 5. Runtime and Configuration

| Topic | Detail | Label |
|---|---|---|
| Settings module | `coach_copilot.settings` | Current implementation |
| `SECRET_KEY` | Hardcoded string `"dev-only-secret-key"` | Current implementation — **security risk** |
| `DEBUG` | `True` | Current implementation |
| `ALLOWED_HOSTS` | `["*"]` | Current implementation |
| Database | SQLite file next to project root | Current implementation |
| i18n | `LANGUAGE_CODE = "en-us"`, `TIME_ZONE = "UTC"` | Current implementation — product UI is Persian RTL |
| Static | `STATIC_URL = "static/"` only | Current implementation |
| REST_FRAMEWORK | JSON renderer/parser only; no pagination, auth, or exception overrides | Current implementation |
| Env var loading | None (`os.environ` unused in settings except `manage.py` settings module) | Confirmed absence |
| Documented setup | README uses `pip install -e .` and path `coach_copilot_custom` (stale path name) | Current implementation / Inference: README copied from earlier folder name |

**Local development workflow (from README, adjusted to this repo path):**

```bash
cd coach-assistant-backend
python -m venv .venv && source .venv/bin/activate
pip install -e .   # or: poetry install
python manage.py migrate
python manage.py loaddata programs/fixtures/initial_data.json
python manage.py runserver 0.0.0.0:8000
```

**Recommendation:** Document Poetry-first install, fix stale directory name, add `.env.example`, and never commit real secrets.

---

## 6. Existing Domain Model

### 6.1 Concept matrix

| Product / search concept | Backend status | Exact name | Path | Reuse verdict |
|---|---|---|---|---|
| User | Absent (Django `auth.User` available but unused by domain) | — | Django built-in only | Replace for product auth |
| Coach / CoachProfile | Exists (thin) | `Coach` | `programs/models.py` | Needs major modification |
| Student / StudentProfile | Exists (thin) | `StudentProfile` | `programs/models.py` | Needs major modification / likely replace shape |
| MonthlyVisit / Visit / Measurement | Absent | — | — | Absent — must add |
| Injury / Limitation (structured) | Partial: `StudentProfile.injuries` JSON list of strings | — | models | Needs redesign |
| CoachRules (Frontend aggregate) | Partial: `CoachRule` + prefs + templates | `CoachRule` | models | Different shape — refactor |
| ProgramTemplate | Exists | `CoachTemplate` | models | Reusable idea; field mismatch |
| LevelRule / InjuryRule / MusclePriority | Absent as entities | Partially encoded as `CoachRule.kind` | planner | Replace or map carefully |
| Exercise / ExerciseBank | Global `Exercise` + per-coach prefs | `Exercise`, `CoachExercisePreference` | models | Partial reuse |
| TrainingProgram / days / prescriptions | Only inside `GeneratedProgram.payload` JSON | payload keys `days` | planner | Needs first-class editable model |
| NutritionProgram / Meal | Absent | — | — | Absent |
| SupplementPlan | Absent | — | — | Absent |
| Program / GeneratedProgram / Version | `GeneratedProgram` append-only history; no version field | `GeneratedProgram` | models | Related but insufficient |
| PDFFile | Absent | — | — | Absent |
| Authentication / Session / Token | Absent for coaches | — | — | Absent |

### 6.2 Model details

#### `Coach` — Current implementation

**Fields:** `name`, `email` (optional), `style_notes`, `control_mode` (`strict`|`balanced`|`creative`), `default_session_minutes`  
**Relationships:** 1→N templates, rules, preferences, students; N GeneratedPrograms  
**Validation:** CharField choices on `control_mode` only  
**Business logic:** `control_mode` influences variation in planner  
**Tests:** None  
**Reuse:** Keep as conceptual owner; must link to authenticated User and expand profile fields.

#### `Exercise` — Current implementation

**Fields:** `name`, `primary_muscle`, `secondary_muscles` (JSON), `equipment`, `level`, `movement_pattern`, `risk_tags` (JSON), `is_active`  
**Constraints:** `unique_together (name, primary_muscle)`  
**Scope:** Global catalog (not coach-owned)  
**Reuse:** Good starting catalog idea; Frontend bank is coach-scoped groups with favorite/beginner/professional/forbidden lists — mismatch.

#### `CoachExercisePreference` — Current implementation

**Fields:** `coach`, `exercise`, `weight` (0–100 intent), `allowed_levels`, `blocked_for_injuries`, `notes`  
**Constraints:** unique `(coach, exercise)`  
**Reuse:** Useful for generator weighting; does not replace Frontend exercise-bank UX.

#### `CoachTemplate` — Current implementation

**Fields:** `coach`, `name`, `goal`, `level`, `days_per_week`, `is_active`, `priority`, `split` (JSON days), `volume` (JSON), `rules` (JSON), `notes`  
**Reuse:** Conceptually aligned with Frontend `ProgramTemplate`, but Frontend has richer fields (`intensity`, `restTime`, `musclePriorityOrder`, `specialRules`, `mainGoal`, etc.).

#### `CoachRule` — Current implementation

**Fields:** `coach`, `code` (slug), `name`, `kind`, `params` (JSON), `priority`, `is_active`  
**Kinds documented:** `exclude_exercises`, `block_risk_tags`, `extra_sets_for_muscles`, `cap_sets`, `prefer_equipment`, `note`  
**Reuse:** Flexible rule engine idea is valuable; **not** the same as Frontend’s typed sections (level/injury/muscle/general).

#### `StudentProfile` — Current implementation

**Fields:** `coach`, `name`, `goal`, `level`, `days_per_week`, `session_minutes`, `focus_muscles`, `injuries`, `available_equipment`, `disliked_exercises`, `notes`  
**Missing vs Frontend `Student`:** demographics (age, gender, height, weight, phone), status, structured goals/muscles, lifestyle, preferences, training background/conditions, summary fields, timestamps, string IDs, etc.  
**Reuse:** Too thin for product forms — treat as generator input DTO, not the student aggregate.

#### `GeneratedProgram` — Current implementation

**Fields:** `coach`, `student`, `template` (nullable SET_NULL), `seed`, `signature`, `payload` (JSON), `created_at`  
**Ordering:** `-created_at`  
**Payload shape (from planner):** coach/student/template summaries, optional `template_selection`, `seed`, `signature`, `notes`, `days[]` with exercises (`exercise_id`, `name`, `muscle`, `equipment`, `sets`, `reps`, `rest_seconds`), `debug`  
**Missing:** title, status, version, nutrition, supplements, pdfSettings, editable document lifecycle, duplicate/new-version semantics  
**API:** Read-only ViewSet (list/retrieve only)  
**Reuse:** History/signature/seed ideas reusable; document model must be redesigned for Frontend.

### 6.3 Planner business logic — Current implementation

**File:** `programs/core/planner.py`

- Template matching by goal/level/days/focus/injury exclusions and priority score  
- Rule aggregation into excluded names, blocked risk tags, extra/cap sets, preferred equipment, notes  
- Hardcoded injury→risk mapping for `neck_pain`/`shoulder_pain` → `overhead`, `low_back_pain` → `spine_load`  
- Weighted random exercise selection with recent-program penalty  
- Optional persist to `GeneratedProgram`  
- Seedable RNG for repeatability when `seed` provided  

**Inference:** This is the most valuable existing backend asset for a future generation service, but its I/O contracts do not match the Frontend generator (`GeneratedProgram` with training/nutrition/supplements).

---

## 7. Existing APIs

Base mount: `coach_copilot/urls.py` → `path("api/", include("programs.urls"))`.  
Also: Django Admin at `/admin/`.

Router: DRF `DefaultRouter` in `programs/urls.py`.  
Custom: `POST /api/templates/match/`, `POST /api/programs/generate/`.

**Authentication:** None required (`AllowAny`).  
**Permissions / ownership:** Not enforced; optional `coach_id` / `student_id` query filters only.  
**Pagination:** None — unbounded lists.  
**Search:** None.  
**OpenAPI:** None.  
**Test coverage:** None.

### Endpoint summary

| Method | Path | Purpose | Request | Response | Status |
|---|---|---|---|---|---|
| GET | `/api/` | API root links | — | URL map | Implemented |
| * | `/api/coaches/` | Coach CRUD | `CoachSerializer` | Coach JSON | ModelViewSet full |
| * | `/api/coaches/{pk}/` | Coach detail CRUD | same | same | Implemented |
| * | `/api/exercises/` | Exercise CRUD | `ExerciseSerializer` | Exercise JSON | Full |
| * | `/api/exercises/{pk}/` | Detail | same | same | Full |
| * | `/api/exercise-preferences/` | Pref CRUD; `?coach_id=` | Pref serializer | Pref JSON | Full |
| * | `/api/exercise-preferences/{pk}/` | Detail | same | same | Full |
| * | `/api/templates/` | Template CRUD; `?coach_id=` | Template serializer | Template JSON | Full |
| * | `/api/templates/{pk}/` | Detail | same | same | Full |
| POST | `/api/templates/match/` | Score templates for student | `{student_id}` | `template_id`, name, score, reasons, alternatives | Implemented; 400 if missing id; **500** if student missing |
| * | `/api/rules/` | Rule CRUD; `?coach_id=` | Rule serializer | Rule JSON | Full |
| * | `/api/rules/{pk}/` | Detail | same | same | Full |
| * | `/api/students/` | Student CRUD; `?coach_id=` | Student serializer | Student JSON | Full |
| * | `/api/students/{pk}/` | Detail | same | same | Full |
| GET | `/api/programs/` | List generated; `?student_id=` / `?coach_id=` | — | GeneratedProgram JSON | Read-only |
| GET | `/api/programs/{pk}/` | Retrieve | — | same | Read-only |
| POST | `/api/programs/generate/` | Build (+ optionally save) program | `{student_id, template_id?, seed?, save?}` | Planner payload | Implemented; **500** if student missing |
| * | `/admin/` | Django admin | session login | HTML | Stock Django |

`*` = standard ViewSet routes including POST/PUT/PATCH/DELETE where ModelViewSet applies.

**Error behavior (verified):**

- Missing `student_id` on match/generate → `400` `{"error":"student_id is required"}`  
- Unknown `student_id` → uncaught `DoesNotExist` → **HTML 500** in DEBUG  
- Serializer validation = DRF defaults only  
- No standardized `{code, message, details}` contract for Frontend

**Confirmed absence:** Auth endpoints, visit endpoints, PDF endpoints, dashboard endpoints, program update/duplicate/version endpoints, nutrition/supplement endpoints.

See **Appendix: Endpoint Inventory** for method-level detail.

---

## 8. Authentication and Permissions

| Question | Answer | Label |
|---|---|---|
| Registration API? | No | Confirmed absence |
| Login API? | No | Confirmed absence |
| Sessions / JWT / OAuth / API tokens for coaches? | No product auth; DRF Session/Basic available but unused by domain | Confirmed absence / Current implementation |
| Password hashing? | Only if using Django admin/User — not wired to `Coach` | Confirmed absence for coaches |
| Refresh / revocation? | No | Confirmed absence |
| Coach ↔ User relation? | None; `Coach` is standalone | Confirmed absence |
| Student scoped to coach? | FK `StudentProfile.coach` exists; **not** enforced by auth | Current implementation / gap |
| Object-level ownership? | No | Confirmed absence |
| Anonymous access? | **Yes — all API endpoints AllowAny** | Current implementation — **critical risk** |
| Admin behavior? | Django admin only; models registered without custom ModelAdmin | Current implementation |
| Frontend routes needing auth | All app routes except `/login` and `/register` (ProtectedRoute) | Frontend evidence |
| Missing permission boundaries | Entire coach tenant isolation, student ownership, program/PDF ownership | Confirmed absence |

**Recommendation (not executed):** Introduce authenticated coach identity and deny anonymous API access before any real data migration from Frontend.

---

## 9. Database and Migrations

| Topic | Detail | Label |
|---|---|---|
| Engine | SQLite | Current implementation |
| Connection | `BASE_DIR / "db.sqlite3"` | Current implementation |
| App tables | `programs_coach`, `programs_exercise`, `programs_coachexercisepreference`, `programs_coachtemplate`, `programs_coachrule`, `programs_studentprofile`, `programs_generatedprogram` (+ Django auth/admin/sessions/contenttypes) | Migration + runtime |
| Migration history | `programs.0001_initial` only; generated by Django 5.2.14 on 2026-05-07 | Current implementation |
| Consistency | `migrate --check` OK; `makemigrations --check --dry-run` → no changes | QA |
| Seed data | `programs/fixtures/initial_data.json` — 2 coaches, 14 exercises, 3 templates, 3 rules, 4 prefs, 2 students | Current implementation |
| Local DB drift | Untracked DB has Persian Arman/Mohammad-style data; counts differ from fixture | Inference from runtime counts/API |
| Constraints | Unique together on exercise name+muscle; coach+rule code; coach+exercise pref | Current implementation |
| FKs / cascades | CASCADE from Coach to children; GeneratedProgram.template SET_NULL | Current implementation |
| Timestamps | Only `GeneratedProgram.created_at`; no `updated_at` / soft delete anywhere | Current implementation / Confirmed absence |
| Versioning strategy | New `GeneratedProgram` rows; no version column | Current implementation |
| File storage refs | None | Confirmed absence |

**No migrations were created by this audit.**

---

## 10. Tests and Quality Tooling

| Tooling | Status | Evidence |
|---|---|---|
| Unit/API tests | **Absent** — `manage.py test` ran 0 tests | QA |
| pytest | Not a project dependency; shim exists on machine for other Python versions | Confirmed absence in project |
| Coverage | No config | Confirmed absence |
| Ruff / Black | Not configured; shims fail under current pyenv (installed only for 3.10.16) | Blocked / Confirmed absence |
| mypy / flake8 | Not present in project | Confirmed absence |
| Pre-commit | None | Confirmed absence |
| CI | None | Confirmed absence |
| Poetry check | `poetry check` → “All set!” | QA |
| Type checking | Python untyped; no py.typed / mypy | Confirmed absence |

---

## 11. QA Execution Results

Environment: project `.venv` Python **3.12.9**, Django **5.2.14**, DRF **3.17.1**.

| Command | Exit | Outcome |
|---|---|---|
| `.venv/bin/python --version` | 0 | Python 3.12.9 |
| `.venv/bin/python -c "import django, rest_framework; ..."` | 0 | Django 5.2.14, DRF 3.17.1 |
| `.venv/bin/python manage.py check` | 0 | No issues |
| `.venv/bin/python manage.py migrate --check` | 0 | Migrations applied |
| `.venv/bin/python manage.py showmigrations` | 0 | `programs.0001_initial` applied |
| `.venv/bin/python manage.py makemigrations --check --dry-run` | 0 | No changes detected |
| `.venv/bin/python manage.py check --deploy` | 0 (6 warnings) | W004 HSTS, W008 SSL redirect, W009 weak SECRET_KEY, W012/W016 secure cookies, W018 DEBUG |
| `.venv/bin/python manage.py test` | 0 | **NO TESTS RAN** (0 found) |
| `poetry check` | 0 | All set |
| Django test client GET `/api/coaches/`, `/api/students/`, `/api/programs/`, `/admin/login/` | 0 | All HTTP 200 |
| POST generate/match with bad student | — | HTML **500** on missing student; **400** when `student_id` omitted on match |
| `ruff check` / `black --check` | N/A | **Could not run meaningfully** — pyenv reports tools only for Python 3.10.16; not project dependencies |
| Docker / Compose / migrate against Postgres | N/A | **No Docker/Compose in repo** |
| Long-running `runserver` | Not started | Bounded Client smoke used instead |

**Local DB snapshot during QA (untracked; not fixture):** coaches=1, students=1, exercises=12, templates=1, rules=3, prefs=12, programs=1.

**Did not run:** `loaddata` (would modify DB), dependency upgrades, network installs.

---

## 12. Frontend State and Expected Operations

Frontend is a complete MVP using **localStorage**, fixtures, and a client-side generator. No HTTP client to this backend was found.

### Storage keys (Current implementation in Frontend)

| Key | Repository |
|---|---|
| `coach-assistant.auth.v1` | `src/features/auth/services/authRepository.ts` |
| `coach-assistant.students.v1` | `src/features/students/services/studentsRepository.ts` |
| `coach-assistant.student-visits.v1` | `src/features/students/services/studentVisitsRepository.ts` |
| `coach-assistant.student-programs.v1` | `src/features/students/services/studentProgramsRepository.ts` |
| `coach-assistant.student-pdf-files.v1` | `src/features/students/services/studentPdfFilesRepository.ts` |
| `coach-assistant.generated-programs.v1` | `src/features/programs/services/programsRepository.ts` |
| `coach-assistant.coach-rules.v1` | `src/features/coach-rules/services/coachRulesRepository.ts` |

### Entity / operation inventory (expected by UI)

| Domain | Ops needed | Notes |
|---|---|---|
| Auth | login, register, logout, session restore | Mock token `mock-token-{id}`; sample user `arman@example.com` |
| Students | list (search/filter/page size 5), get, create, update | No delete in FE repo |
| Visits | list by student, get, create, update, delete | Rich measurement/adherence fields |
| Coach rules | get aggregate, save aggregate | Sectioned document, not free-form rule kinds only |
| Programs (full) | list/filter, get, create, update, duplicate, createVersion, delete | Includes training/nutrition/supplements/pdfSettings |
| Program summaries | list by student, activate, duplicate, remove, upsert | Dual store with full programs |
| PDF files | list by student, create mock, rename, regenerate, delete, share link | Metadata only today |
| Dashboard | aggregate metrics from other stores | `dashboardMetrics.ts` |
| Generator | deterministic-ish from student + visit + coach rules | `programGenerator.ts`; UI apply-* flags currently unused by generator |

### Routes expecting eventual authenticated API

`/dashboard`, `/students/**`, `/programs/**`, `/coach-rules`, plus placeholders `/visits`, `/settings`. Public: `/login`, `/register`.

---

## 13. Frontend–Backend Gap Analysis

| Product capability | Frontend status | Backend status | Required work | Priority |
|---|---|---|---|---|
| Authentication | Mock localStorage session | Absent product auth; AllowAny APIs | Design auth; register/login; hash passwords; secure session/JWT; protect routes | P0 |
| Coach profile | Implicit via mock user + rules | Thin `Coach` model/API | Link User↔Coach; expand profile; scope all data | P0 |
| Student CRUD | Full rich form + list filters/pagination | Thin `StudentProfile` CRUD | Redesign student schema + list/search/filter/page APIs | P0 |
| Student profile | Multi-tab overview | Same thin model | Align detail DTO with FE/product fields | P0 |
| Monthly visits | Full CRUD-ish visits repo | Absent | New visit aggregate + endpoints | P0 |
| Measurements | Inside visits | Absent | Part of visit schema | P0 |
| Injury and limitations | Structured on student + injury rules | String JSON + risk tags | Structured injuries + rule engine mapping | P1 |
| Coach rules | Sectioned CoachRules document | `CoachRule`/`Template`/prefs different model | Map or redesign to FE sections | P1 |
| Program templates | In coach-rules | `CoachTemplate` CRUD | Field alignment + coach scoping under auth | P1 |
| Exercise bank | Grouped lists in coach-rules | Global `Exercise` + prefs | Coach-scoped bank API matching FE | P1 |
| Program generation | FE deterministic generator (training+nutrition+supplements) | Workout-only planner API | Contract design; decide FE vs BE generator ownership | P1 |
| Program editing | Full edit of days/meals/supplements | Read-only generated history | Writable program document API | P1 |
| Program versioning | createVersion + duplicate + activate | Append-only GeneratedProgram | Explicit version graph + statuses | P1 |
| Nutrition programs | Editable in FE | Absent | Model + API | P1 |
| Supplement plans | Editable in FE | Absent | Model + API | P1 |
| Programs list and filtering | Client search/filters | List by coach/student id only | Search/filter/status/type/date APIs | P1 |
| PDF generation | Mock metadata only | Absent | Real PDF pipeline (later); metadata API earlier | P2 |
| PDF file history | Mock CRUD + share token | Absent | File metadata + storage + share | P2 |
| Dashboard aggregation | Client-side metrics | Absent | Aggregate endpoint or FE composition from lists | P1 |
| Permissions and coach ownership | Single mock coach assumed | FK exists; no enforcement | Object permissions everywhere | P0 |
| Frontend migration from localStorage | N/A (source of truth today) | No import adapters | Migration/adapter plan after API contract | P1 |
| API error contract | FE expects catchable repo errors / UI states | Inconsistent 400/HTML 500 | Normalize JSON errors; handle DoesNotExist | P0 |
| API documentation | None | None | OpenAPI once contract stabilizes | P2 |
| End-to-end testing | FE unit/UI tests exist | Backend tests absent | API tests + eventual e2e | P1 |

### Mismatch taxonomy (examples)

| Type | Example |
|---|---|
| Naming mismatch | FE `Student.fullName` vs BE `StudentProfile.name`; FE program `id` string slugs vs BE integer PKs |
| Field mismatch | FE student demographics/lifestyle vs BE generator-oriented subset |
| Type mismatch | FE program `version` number vs summary `version` string; BE has no version |
| Missing relation | Visit→Student; PDF→Program; User→Coach |
| Missing endpoint | Auth, visits, PDF, program PATCH/duplicate/version, dashboard |
| Missing validation | Mass-assignment `__all__`; no Persian business rules server-side |
| Missing permission | All APIs public |
| Missing state transition | draft/editing/finalized/delivered; PDF ready/generating/failed |
| Missing versioning behavior | FE createVersion/duplicate/activate |
| Missing file/PDF behavior | Entire subsystem |
| Temporary frontend-only behavior | Mock auth, mock PDF, localStorage persistence, FE generator |

---

## 14. Data Migration and Adapter Considerations

**Current implementation:** No migration path from Frontend localStorage to backend exists.

**Recommendation (design phase):**

1. Freeze an API contract that can represent FE entities (even if backend storage differs).  
2. Build a one-shot importer for the seven localStorage keys (dev/demo only).  
3. Map FE string IDs (`mohammad-taheri`) ↔ backend PKs (UUIDs recommended).  
4. Do **not** assume `StudentProfile` columns are a 1:1 dump of TypeScript interfaces — product forms (`Student.docx`) and design docs must drive the aggregate.  
5. Treat committed English fixture and local Persian SQLite as **throwaway demos**, not production seed of record. Align future seeds with Arman Vaezi / Mohammad Taheri product fixtures.  
6. Dual FE program stores (summary + full document) should become one backend resource with list/detail projections.

---

## 15. Security and Technical Risks

| Risk | Path / name | Severity | Remediation (recommendation) |
|---|---|---|---|
| Hardcoded weak `SECRET_KEY` | `coach_copilot/settings.py` → `SECRET_KEY` | High | Load from env; rotate; never commit real secrets |
| `DEBUG = True` | `settings.py` | High for any shared deploy | Env-gated; False in prod |
| `ALLOWED_HOSTS = ["*"]` | `settings.py` | High | Explicit hosts |
| Anonymous full CRUD + generate | DRF `AllowAny` default | **Critical** | Authenticate; IsAuthenticated + object ownership |
| Mass assignment | serializers `fields = "__all__"` | High | Explicit fields; read-only ownership FKs |
| Uncaught DoesNotExist → 500 HTML | `programs/views.py` match/generate | Medium | get_object_or_404 / DRF exception handler |
| Unbounded list endpoints | All list ViewSets | Medium | Pagination |
| No CORS policy yet | deps | Medium when FE connects | Explicit allowed origins (avoid `*`-with-credentials) |
| Deploy check warnings | `check --deploy` W004/W008/W009/W012/W016/W018 | High for prod | HTTPS, HSTS, secure cookies |
| SQLite as only DB | settings | Medium for multi-user | Postgres for real deploy |
| Business logic in views + planner coupling | `views.py`, `planner.py` | Medium | Service layer; tested use-cases |
| No tests | — | High | API + planner tests before integration |
| README stale path / pip install story | `README.md` | Low | Align with Poetry + actual folder name |
| Local DB ≠ fixture | untracked `db.sqlite3` | Low/process | Document; avoid relying on local drift |

**No actual secret values are reproduced beyond the already-public placeholder name `SECRET_KEY` / nature of the hardcoded string.**

---

## 16. Reusable Components

Worth carrying forward (with modification):

1. **`programs/core/planner.py`** — template scoring, rule-state folding, weighted selection, seed/signature concepts  
2. **Coach-owned template + rule + preference idea** — correct multi-tenant direction once auth exists  
3. **`GeneratedProgram` history with seed/signature** — useful audit/debug for generation  
4. **Global exercise catalog fields** (`risk_tags`, `equipment`, `level`) — align with injury safety  
5. **DRF project skeleton** — `coach_copilot` + `programs` app structure, admin hooks, JSON API baseline  
6. **Fixture approach** — keep, but replace content with product fixtures  

---

## 17. Components to Refactor, Replace, or Remove

| Component | Action | Why |
|---|---|---|
| `StudentProfile` as product student | Replace/expand heavily | Too thin vs FE/product |
| `CoachRule` as sole coach-rules system | Refactor | FE needs typed sections, not only kind/params |
| `GeneratedProgram` as editable program | Replace with document+version model | Read-only payload ≠ FE editor |
| AllowAny public CRUD | Replace | Unsafe |
| Hardcoded settings secrets | Replace | Insecure |
| README “Coach Copilot” framing | Refactor docs | Product is Coach Assistant |
| English demo fixture as product seed | Replace | Product fixtures are Arman/Mohammad |
| Thin serializers `__all__` | Refactor | Validation/ownership |
| Dual conceptual naming coach-copilot vs coach-assistant | Align | Confusion across repos |

**Do not delete planner logic blindly** — extract and re-home under a future generation service after contract design.

---

## 18. Missing Product Capabilities

Confirmed absent (or only trivially approximated) relative to product + Frontend MVP:

- Coach authentication and multi-coach isolation  
- Rich student intake (identity, goals, lifestyle, equipment, preferences, status)  
- Monthly visits and measurements  
- Coach rules sections parity (levels, injuries, muscle priorities, exercise bank, general rules)  
- Nutrition and supplement program generation/editing  
- Program lifecycle (draft → edit → finalize → deliver), duplication, versioning, activation  
- PDF generation, storage, share links, history UI backend  
- Dashboard aggregates and overdue-visit logic  
- Persian-aware validation messages / locale  
- API docs, automated tests, CI, containerization, env-based configuration  
- File/media handling  

---

## 19. Recommended Backend Implementation Order

**Recommendation only — not executed.**

1. **P0 — Security & tenancy foundation:** env-based settings; auth (register/login); Coach↔User; default deny; ownership filters; normalized errors.  
2. **P0 — Student + Visit domain:** schema driven by product/FE (not by current `StudentProfile`); CRUD + list filters/pagination.  
3. **P0 — API error/pagination contracts** usable by Frontend loading/error states.  
4. **P1 — Coach rules & exercise bank** aligned to FE sections; migrate useful `CoachTemplate`/`CoachRule`/prefs ideas.  
5. **P1 — Program document model** (training/nutrition/supplements), list/detail, update, duplicate, version, status transitions.  
6. **P1 — Generation service:** either wrap/adapt `planner.py` for training section or redefine; keep deterministic seeds; add nutrition/supplement strategy intentionally.  
7. **P1 — Dashboard aggregation** (or documented FE composition rules).  
8. **P1 — Test suite + OpenAPI draft** against the agreed contract.  
9. **P2 — PDF metadata + async generation + share links.**  
10. **P2 — localStorage migration tooling** for demos.  
11. **P3 — Hardening:** Postgres, CI, Docker, deploy security, performance.

Stop after step 1–3 design agreement before coding large schema commits — this audit feeds that design phase.

---

## 20. Open Questions

| ID | Question | Why it matters |
|---|---|---|
| Q1 | Is the backend the system of record for generation, or does FE keep a client generator calling BE only for persistence? | Architecture of `planner.py` vs FE `programGenerator.ts` |
| Q2 | UUID/string public IDs vs integer PKs? | FE uses slug ids today |
| Q3 | Single program aggregate vs separate training/nutrition/supplement resources? | API and versioning shape |
| Q4 | How should Frontend coach-rules sections map to `CoachRule.kind` vs normalized tables? | Migration of prototype rules |
| Q5 | Draft/autosave semantics for students and visits (`ذخیره موقت` in product open questions) | Persistence and validation |
| Q6 | Auth mechanism (session cookie vs JWT) for Vite SPA on separate origin? | CORS + CSRF design |
| Q7 | Real PDF engine and storage backend? | Not needed for first API integration, needed before beta |
| Q8 | Should injury rules be data-driven only, or keep planner hardcoding? | Safety consistency |
| Q9 | Multi-coach admin / staff roles needed in MVP? | Permission model scope |
| Q10 | Source of truth for exercise names language (Persian UI vs English catalog in BE fixture)? | i18n of bank |

---

## 21. Appendix: Endpoint Inventory

Legend: Auth = required authentication (currently none). Status = implementation quality.

### Coaches

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET | `/api/coaches/` | No | Unbounded list | None |
| POST | `/api/coaches/` | No | Create | None |
| GET | `/api/coaches/{pk}/` | No | Retrieve | None |
| PUT/PATCH | `/api/coaches/{pk}/` | No | Update | None |
| DELETE | `/api/coaches/{pk}/` | No | Delete | None |

### Exercises

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET/POST | `/api/exercises/` | No | Global catalog CRUD | None |
| GET/PUT/PATCH/DELETE | `/api/exercises/{pk}/` | No | | None |

### Exercise preferences

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET/POST | `/api/exercise-preferences/` | No | Optional `?coach_id=` | None |
| GET/PUT/PATCH/DELETE | `/api/exercise-preferences/{pk}/` | No | | None |

### Templates

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET/POST | `/api/templates/` | No | Optional `?coach_id=` | None |
| GET/PUT/PATCH/DELETE | `/api/templates/{pk}/` | No | | None |
| POST | `/api/templates/match/` | No | Body `{student_id}`; 400/500 behaviors above | None |

### Rules

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET/POST | `/api/rules/` | No | Optional `?coach_id=` | None |
| GET/PUT/PATCH/DELETE | `/api/rules/{pk}/` | No | | None |

### Students

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET/POST | `/api/students/` | No | Optional `?coach_id=`; thin schema | None |
| GET/PUT/PATCH/DELETE | `/api/students/{pk}/` | No | | None |

### Programs

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET | `/api/programs/` | No | Read-only; `?student_id=` / `?coach_id=` | None |
| GET | `/api/programs/{pk}/` | No | Read-only | None |
| POST | `/api/programs/generate/` | No | Body `{student_id, template_id?, seed?, save?}` returns planner payload; may persist | None |

### Other

| Method | Path | Auth | Notes | Tests |
|---|---|---|---|---|
| GET | `/api/` | No | DRF root | None |
| * | `/admin/` | Django staff | HTML admin | None |

Format-suffix variants (`.json`) are also registered by `DefaultRouter`.

---

## 22. Appendix: Relevant File Map

| Path | Role |
|---|---|
| `pyproject.toml` | Dependencies / Python version |
| `poetry.lock` | Locked Django 5.2.14, DRF 3.17.1 |
| `README.md` | Prototype API cookbook (stale naming) |
| `.gitignore` | Ignores venv, sqlite, env, caches |
| `manage.py` | Django entry |
| `coach_copilot/settings.py` | Runtime config / security defaults |
| `coach_copilot/urls.py` | Root URLConf |
| `programs/models.py` | Domain models |
| `programs/serializers.py` | DRF serializers |
| `programs/views.py` | ViewSets + generate/match |
| `programs/urls.py` | API routes |
| `programs/admin.py` | Admin registration |
| `programs/core/planner.py` | Generator |
| `programs/fixtures/initial_data.json` | Demo seed |
| `programs/migrations/0001_initial.py` | Schema |
| `docs/backend-current-state.md` | This audit |

Frontend references (read-only):  
`coach-assistant-frontend/src/features/**`, `src/app/router/routes.tsx`.

Product references (read-only):  
`coach-assistant-product/docs/design/**`, `references/Student.docx`, `references/Coach.docx`.

---

## 23. Appendix: Commands Executed

```text
# Discovery
git -C coach-assistant-backend status --short
git -C coach-assistant-backend log --oneline -10
git -C coach-assistant-frontend status --short
git -C coach-assistant-product status --short

# QA (venv python)
.venv/bin/python --version
.venv/bin/python -c "import django, rest_framework; print(django.get_version(), rest_framework.VERSION)"
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate --check
.venv/bin/python manage.py showmigrations
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py check --deploy
.venv/bin/python manage.py test
poetry check
# Django test Client smoke: GET /api/coaches|students|programs, /admin/login/
# Error probes: POST /api/templates/match/, /api/programs/generate/
# Attempted: ruff/black (unavailable for active Python via pyenv)
```

All secret-like values in command output were redacted/not copied into this report beyond noting that `SECRET_KEY` is a hardcoded non-production placeholder.

---

*End of audit report.*
