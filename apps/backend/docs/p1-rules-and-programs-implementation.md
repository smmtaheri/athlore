# P1 — Coach Rules & Programs Implementation

**Status:** Implemented  
**Date:** 2026-08-06  
**Depends on:** P0 (`docs/p0-backend-implementation.md`)  
**Design companions:** `domain-model.md`, `database-schema.md`, `api-contract.md`

---

## Summary

P1 moves coach rules, exercise bank, and the program aggregate (draft / finalize / new-version / duplicate / generate) out of Frontend-only localStorage into the Django backend under `/api/v1/`.

No AI providers, no real PDF files, no dashboard aggregation, no Frontend wiring.

---

## Architecture decisions applied

| Decision | Choice |
|---|---|
| Rule storage | Normalized child tables under `CoachRuleSet` (1:1 per coach) |
| Program content | JSON documents on `ProgramVersion` (`training`, `nutrition`, `supplements`, `pdf_settings`) |
| Versioning | Immutable finalized rows; edits only on `status=draft` |
| New Version | Same `Program` lineage; `version_number = max+1`; deep-copied draft |
| Duplicate | New `Program` lineage; version 1 draft; `copied_from_program_id` provenance |
| Generator | Synchronous deterministic `rules_v1` service (provider-independent boundary) |
| Legacy `programs` app | Remains installed for migration history / prototype planner; **HTTP routes stay unmounted** |
| Exercise delete | Soft-archive (`is_archived`) so historical name snapshots stay meaningful |
| Template delete | Soft-archive |
| Ownership | Cross-tenant → **404** (same as P0) |

---

## Models

### `accounts` (additive migration `0002_p1_rules_and_programs`)

- `CoachRuleSet` (existing shell) + children:
  - `ProgramTemplate`
  - `LevelRule`
  - `InjuryRule`
  - `MusclePriority`
  - `ExerciseBankGroup`
  - `GeneralRule`
- `Exercise` (coach-owned bank)
- `CoachExercisePreference` (preferred / prohibited / suitable levels)

### `programming` (new app, migration `0001_p1_rules_and_programs`)

- `Program` — lineage, student+coach ownership, archive, active version pointer
- `ProgramVersion` — draft/finalized/archived; JSON sections; provenance FKs
- `GenerationRun` — request, input/output snapshots, warnings, engine version

Legacy prototype models in `programs` are **not** used by `/api/v1/`.

---

## Draft / finalized / version semantics

1. **Draft update** — `PATCH /programs/{id}/versions/{version_id}/` only when `status=draft`. Finalized JSON is never silently mutated.
2. **Finalize** — `POST .../finalize/` sets `finalized` + `finalized_at` + actor. Repeated finalize on the same version is **idempotent 200**.
3. **New Version** — same Program; archives any open draft; creates next `version_number` draft deep-copied from the source version.
4. **Duplicate** — new Program for the same (owned) student; version 1 draft deep-copy; sets `copied_from_program_id`; does not share mutable nested JSON with the source.
5. **Archive** — soft `archived_at` on Program; list `status=archived`.
6. **Activate** — `POST .../activate/` with finalized `version_id` sets `active_version` and student summary title.

---

## Deterministic generator (`rules_v1`)

**Location:** `programming/services/generator.py`

**Inputs (from DB, not trusted client coach payloads):** student, latest visit (optional warning), owned template, coach rule set children, exercise preferences.

**Behavior:**

- Same normalized input → same exercise name selection / day split structure
- Injury rules applied; neck injury excludes **پرس سرشانه سنگین** and **شراگ سنگین**
- Preferred bank exercises favored; prohibited / bank-forbidden excluded
- Weak / priority muscles receive extra sets (and optional extra exercises from muscle priority rules)
- Template `split` titles respected; main compounds sorted early; abs late when general rule says so
- Stores `GenerationRun.input_snapshot`, `output_snapshot`, `warnings`, `engine=rules_v1`
- Does **not** mutate coach configuration
- **Not medically validated** — response includes `not_medical_advice` in generator metadata / warnings channel

**Missing visit:** warning `missing_latest_visit` (still generates).  
**Missing candidates:** warning `missing_exercise_candidates:{muscle}` with deterministic fallback name.  
**Archived student/template:** `400` with `archived_student` / `archived_template`.  
**Cross-coach IDs:** `404`.

---

## API endpoints

### Coach rules

| Method | Path |
|---|---|
| GET/PUT/PATCH | `/api/v1/coach-rules/` |
| GET/POST | `/api/v1/coach-rules/templates/` |
| GET/PATCH/DELETE | `/api/v1/coach-rules/templates/{uuid}/` |
| GET/POST | `/api/v1/program-templates/` *(alias)* |
| GET/PATCH/DELETE | `/api/v1/program-templates/{uuid}/` |
| GET/POST | `/api/v1/exercises/` |
| GET/PATCH/DELETE | `/api/v1/exercises/{uuid}/` *(DELETE = archive)* |

### Programs

| Method | Path |
|---|---|
| GET/POST | `/api/v1/programs/` |
| POST | `/api/v1/programs/generate/` |
| GET/PATCH/DELETE | `/api/v1/programs/{uuid}/` |
| POST | `/api/v1/programs/{uuid}/archive/` |
| POST | `/api/v1/programs/{uuid}/activate/` |
| GET | `/api/v1/programs/{uuid}/versions/` |
| GET/PATCH | `/api/v1/programs/{uuid}/versions/{version_id}/` |
| POST | `/api/v1/programs/{uuid}/versions/{version_id}/finalize/` |
| POST | `/api/v1/programs/{uuid}/versions/{version_id}/new-version/` |
| POST | `/api/v1/programs/{uuid}/versions/{version_id}/duplicate/` |
| GET | `/api/v1/students/{student_id}/programs/` |
| GET | `/api/v1/generation-runs/` |
| GET | `/api/v1/generation-runs/{run_id}/` |

List filters: `search`, `student_id`, `program_type`, `status` (`draft`/`ready`/`active`/`archived`/`finalized`), `pdf_status` (placeholder; only `none` matches), created/updated date ranges, `ordering`, limit/offset pagination.

---

## Validation / error codes (P1 additions)

| Code | Typical HTTP |
|---|---|
| `invalid_state_transition` | 400 |
| `immutable_version` | 400 |
| `archived_student` | 400 |
| `archived_template` | 400 |
| `generation_failed` | 422 |
| `conflict` / `duplicate_version_number` | 409 |
| `not_found` | 404 (incl. cross-coach) |
| `validation_error` | 400 |
| `authentication_required` | 401 |

---

## Seed command

```bash
python manage.py seed_demo_data [--email ...] [--password ...]
```

Idempotent; **never** auto-run on migrate/startup. Seeds Arman-style rules, templates, injuries, bank groups, reference exercises/preferences, Mohammad Taheri, and a monthly visit. Development credentials only.

---

## Environment / dependencies

No new uv packages for P1. Continues to use Django 5.2, DRF, SimpleJWT, corsheaders from P0.

---

## Prototype / legacy handling

- `programs` app stays in `INSTALLED_APPS` so `programs.0001_initial` remains applicable.
- No anonymous `/api/` routes remounted.
- No destructive conversion of prototype rows.
- Future cleanup: drop or freeze prototype models after a dedicated cleanup milestone.

---

## Concurrency note

Version allocation uses `select_for_update` + `Max(version_number)` inside a transaction. SQLite has limited concurrent write behavior versus PostgreSQL; a dedicated multi-writer race test is deferred to Postgres CI. Unique constraint `uniq_program_version_number` remains the last line of defense.

---

## QA commands

```bash
uv lock --check
DJANGO_DB_NAME=/tmp/coach_p1_qa.sqlite3 python manage.py check
DJANGO_DB_NAME=/tmp/coach_p1_qa.sqlite3 python manage.py check --deploy
DJANGO_DB_NAME=/tmp/coach_p1_qa.sqlite3 python manage.py makemigrations --check --dry-run
DJANGO_DB_NAME=/tmp/coach_p1_qa.sqlite3 python manage.py migrate --noinput
DJANGO_DB_NAME=/tmp/coach_p1_qa.sqlite3 python manage.py test
```

Do **not** point verification at the developer’s long-lived `db.sqlite3`.

No project formatter/linter/type-checker is configured beyond Django/uv checks.

---

## Frontend integration implications

- Replace localStorage coach-rules / programs repositories with `/api/v1/` adapters.
- Aggregate `GET/PUT /coach-rules/` matches the Coach Rules screen document shape (snake_case).
- Nested training JSON keeps FE-friendly camelCase keys inside documents (`targetMuscles`, etc.) for easier migration.
- Auth remains Bearer JWT from P0.
- Do not mount generation until rules + student + visit exist for the coach.

---

## Known limitations

- Deterministic generator is a rules engine, not AI and not clinical advice.
- PDF settings persist only; no file rendering/storage.
- `pdf_status` list filter is a placeholder (`none`).
- Nutrition/supplement sections are structured templates, not personalized macro engines.
- SQLite local smoke cannot fully prove Postgres concurrency.

---

## Deferred scope

AI generation, async workers, real PDF, share links, dashboard aggregation, Frontend adapters, CI/CD, payments, student login, messaging.
