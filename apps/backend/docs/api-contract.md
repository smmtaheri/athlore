# Coach Assistant — REST API Contract

**Status:** Design only (not implemented; not yet OpenAPI)  
**Base path:** `/api/v1/`  
**Companion:** `domain-model.md`, `auth-and-permissions.md`  
**Date:** 2026-08-06

---

## Canonical terms

See `domain-model.md`. API resource names:

| API resource | Domain |
|---|---|
| `/auth/*`, `/me` | User + CoachProfile |
| `/students` | Student |
| `/students/{id}/visits` | Visit |
| `/coach-rules` | CoachRuleSet |
| `/programs` | Program + Version projections |
| `/generation-runs` | Generation Run |
| `/pdf-files` | PDF File |

---

## 1. Cross-cutting conventions

### 1.1 Protocol

- HTTPS in staging/production
- JSON request/response (`Content-Type: application/json`)
- UTF-8; Persian strings allowed in text fields
- Timestamps: ISO-8601 UTC (`2026-07-31T00:00:00Z`)
- Dates: `YYYY-MM-DD`
- IDs: UUID strings

### 1.2 Authentication

- **Bearer JWT** access token on all endpoints except register/login/refresh and public PDF share
- Header: `Authorization: Bearer <access>`
- See `auth-and-permissions.md`

### 1.3 Ownership

Unless noted, every handler:

1. Resolves `request.coach` from the authenticated user
2. Filters querysets by `coach_id`
3. On create, forces `coach_id = request.coach.id`
4. Returns **404** (not 403) for cross-tenant IDs to avoid leakage

### 1.4 Pagination

List endpoints (unless noted) use limit/offset:

```json
{
  "count": 42,
  "next": "https://api.example.com/api/v1/students?limit=20&offset=20",
  "previous": null,
  "results": [ ]
}
```

| Param | Default | Max |
|---|---|---|
| `limit` | 20 | 100 |
| `offset` | 0 | — |

Students list may use `limit=5` from FE today — client chooses.

### 1.5 Error envelope

```json
{
  "error": {
    "code": "validation_error",
    "message": "ورودی نامعتبر است.",
    "details": {
      "full_name": ["این فیلد الزامی است."]
    }
  }
}
```

| HTTP | code (examples) |
|---|---|
| 400 | `validation_error`, `invalid_state_transition` |
| 401 | `authentication_required`, `token_expired` |
| 403 | `permission_denied` |
| 404 | `not_found` |
| 409 | `conflict` (e.g. duplicate visit date) |
| 429 | `rate_limited` |
| 500 | `internal_error` |

Messages may be Persian for user-facing validation to match FE.

### 1.6 Idempotency

| Operation | Expectation |
|---|---|
| GET | Safe, idempotent |
| PUT coach-rules | Idempotent replace |
| PATCH draft | Last-write-wins; optional `If-Match` / `updated_at` later |
| POST finalize / activate / duplicate / new-version | **Not** idempotent by default; clients should not retry blindly without Idempotency-Key |
| POST generate / PDF | Support optional header `Idempotency-Key` (P1/P2) |

### 1.7 Sorting

Common: `ordering=-updated_at` (prefix `-` for desc). Whitelist per resource.

---

## 2. Authentication

### POST `/api/v1/auth/register`

**Purpose:** Create User + CoachProfile + empty CoachRuleSet  
**Auth:** Anonymous  
**Ownership:** Creates caller’s tenant  

**Request:**

```json
{
  "email": "arman@example.com",
  "password": "Str0ng-Pass!",
  "full_name": "آرمان واعظی"
}
```

**Response `201`:**

```json
{
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "arman@example.com",
    "full_name": "آرمان واعظی",
    "created_at": "2026-08-06T12:00:00Z"
  },
  "coach": {
    "id": "22222222-2222-2222-2222-222222222222",
    "display_name": "آرمان واعظی",
    "control_mode": "balanced",
    "default_session_minutes": 60
  },
  "tokens": {
    "access": "<jwt>",
    "refresh": "<jwt>"
  }
}
```

**Errors:** 400 validation; 409 email taken  

### POST `/api/v1/auth/login`

**Request:** `{ "email", "password" }`  
**Response `200`:** same session shape as register (`user`, `coach`, `tokens`)  
**Errors:** 400; 401 invalid credentials (generic message)

### POST `/api/v1/auth/refresh`

**Request:** `{ "refresh": "<jwt>" }`  
**Response `200`:** `{ "access": "...", "refresh": "..." }` (rotation)  
**Errors:** 401 revoked/expired  

### POST `/api/v1/auth/logout`

**Auth:** Bearer  
**Request:** `{ "refresh": "<jwt>" }`  
**Purpose:** Revoke refresh token  
**Response `204`**

### GET `/api/v1/me`

**Auth:** Bearer  
**Response `200`:** `{ "user", "coach" }`  

### PATCH `/api/v1/me/coach`

**Auth:** Bearer (owner)  
**Request (partial):** `{ "display_name", "style_notes", "control_mode", "default_session_minutes" }`  
**Response `200`:** coach object  

---

## 3. Dashboard

### GET `/api/v1/dashboard`

**Purpose:** Aggregates for `/dashboard`  
**Auth:** Bearer · **Ownership:** coach scope  

**Response `200`:**

```json
{
  "total_students": 6,
  "active_students": 5,
  "this_month_visits": 4,
  "draft_programs": 2,
  "final_programs": 3,
  "ready_pdf_files": 0,
  "pdf_files_ready": 0,
  "pdf_files_pending": 0,
  "pdf_files_failed": 0,
  "pdf_generation_available": true,
  "latest_visits": [ /* VisitListItem max 5 */ ],
  "latest_programs": [ /* ProgramSummary max 5 */ ],
  "overdue_visits": [ /* StudentListItem */ ],
  "follow_up_students": [ /* StudentListItem */ ],
  "today_tasks": [ "پیگیری ویزیت محمد طاهری" ]
}
```

**Notes:** Overdue rule default = active students with no visit in **35 days** (`summary_last_visit_date`). PDF counts are coach-scoped live aggregates from `PdfArtifact` (deleted excluded); see `docs/p3-pdf-artifacts-implementation.md`.  
**Pagination:** embedded caps, not full paginator.

---

## 4. Students

### GET `/api/v1/students`

**Query:** `search`, `status`, `level`, `goal`, `limit`, `offset`, `ordering`  
**Auth / ownership:** coach  

**Response:** paginated `StudentListItem`:

```json
{
  "id": "aaaaaaaa-....",
  "full_name": "محمد طاهری",
  "status": "active",
  "age": 27,
  "gender": "male",
  "goals": { "primary_goal": "hypertrophy", "secondary_goal": "..." },
  "training_background": { "level": "intermediate" },
  "summary": {
    "current_program_title": "برنامه کامل عضله‌سازی",
    "last_visit_date": "2026-07-15",
    "medical_note": "گردن درد خفیف"
  },
  "updated_at": "2026-07-31T00:00:00Z"
}
```

**Filter mapping:** `level` → `training_background.level`; `goal` → `goals.primary_goal`; `search` → full_name, phone, summary title.

### POST `/api/v1/students`

**Request:** full Student write DTO (FE `StudentInput` analogue, snake_case):

```json
{
  "full_name": "محمد طاهری",
  "age": 27,
  "gender": "male",
  "height_cm": 182,
  "weight_kg": 86,
  "phone_number": "0912...",
  "status": "active",
  "coach_notes": "...",
  "goals": {
    "primary_goal": "hypertrophy",
    "secondary_goal": "چربی‌سوزی ملایم",
    "muscle_priorities": ["chest", "shoulders"],
    "weak_muscles": ["upper_chest"],
    "strong_muscles": ["legs"]
  },
  "injuries": {
    "has_injury": true,
    "injury_type": "mild_neck",
    "aggravating_movements": ["heavy_shoulder_press"],
    "disallowed_exercises": ["heavy_shrug"]
  },
  "equipment": {
    "has_barbell": true,
    "has_dumbbell": true,
    "has_machines": true,
    "has_cable": true,
    "has_full_gym": true
  },
  "lifestyle": { "occupation": "...", "sleep_quality": "...", "stress_level": "...", "daily_activity_level": "..." },
  "preferences": { "favorite_exercises": "...", "intensity_preference": "...", "disliked_training_styles": "...", "variety_preference": "..." },
  "training_background": {
    "level": "intermediate",
    "training_experience": "...",
    "basic_movement_familiarity": "...",
    "has_free_weight_experience": true
  },
  "training_conditions": {
    "training_days_per_week": 4,
    "session_duration_minutes": 75,
    "training_preference": "...",
    "cardio_interest": "...",
    "heavy_training_interest": "..."
  },
  "summary": {
    "current_program_title": "",
    "last_visit_date": null,
    "medical_note": "گردن درد خفیف"
  }
}
```

**Response `201`:** full `Student`  
**Validation:** required identity fields; level/goal enums; Persian messages  

### GET `/api/v1/students/{student_id}`

**Response `200`:** full Student · **404** if other coach  

### PATCH `/api/v1/students/{student_id}`

Partial update · **200** Student  

### POST `/api/v1/students/{student_id}/archive`

Sets `status=inactive` and/or `archived_at` · **200**  
(FE has no delete; archive is the API equivalent.)

---

## 5. Visits

### GET `/api/v1/students/{student_id}/visits`

Paginated list, default `ordering=-visit_date`  
**Ownership:** student must belong to coach  

### GET `/api/v1/students/{student_id}/visits/latest`

**200** Visit or **404** if none  

### POST `/api/v1/students/{student_id}/visits`

**Request:**

```json
{
  "visit_date": "2026-07-15",
  "current_weight_kg": 85.5,
  "previous_weight_kg": 86.0,
  "body_fat_percentage": 18.5,
  "measurements": {
    "waist_cm": 84,
    "chest_cm": 102,
    "arm_cm": 36,
    "thigh_cm": 58,
    "hip_cm": 96
  },
  "adherence": {
    "overall_percent": 80,
    "training_percent": 85,
    "nutrition_percent": 75,
    "supplements_percent": 70
  },
  "daily_energy_level": "good",
  "sleep_quality": "medium",
  "stress_level": "medium",
  "body_feeling": "...",
  "student_feedback": "...",
  "coach_assessment": "...",
  "coach_notes": "...",
  "has_new_injury": false,
  "new_injury_notes": "",
  "next_cycle_goal": "...",
  "training_condition_changes": ""
}
```

**201** Visit · **409** if unique visit_date conflict  
Side effect: update Student `summary_last_visit_date`

### GET/PATCH/DELETE `/api/v1/students/{student_id}/visits/{visit_id}`

- PATCH: mutable fields  
- DELETE: allowed in MVP; **Open question** if linked generation snapshots exist (snapshots remain in Generation Run)

---

## 6. Coach rules

### Decision: hybrid API

| Approach | Role |
|---|---|
| **Aggregate** `GET/PUT /coach-rules` | Matches FE `get`/`save` of whole CoachRules document |
| **Nested resources** (optional P1+) | ` /coach-rules/templates` CRUD for generator UIs |

**Decision:** Ship **aggregate first**; add nested template routes if generation UI needs them.  
**Rationale:** FE already treats rules as one document; reduces chatty saves.  
**Alternative:** Only nested REST — more HTTP round-trips for current UI.  
**Consequence:** PUT replaces sections transactionally.

### GET `/api/v1/coach-rules`

**200:**

```json
{
  "updated_at": "2026-07-31T00:00:00Z",
  "templates": [ /* ProgramTemplate */ ],
  "levels": [ /* LevelRule; id = level key */ ],
  "injuries": [ /* InjuryRule */ ],
  "muscle_priorities": [ /* MusclePriority */ ],
  "exercise_bank": [ /* ExerciseBankGroup */ ],
  "general_rules": {
    "extra_notes": "...",
    "items": [ /* GeneralCoachRule */ ]
  }
}
```

Auto-create empty defaults if missing.

### PUT `/api/v1/coach-rules`

Full replace body (same shape) · **200** · validates section schemas · ownership coach  

### PATCH `/api/v1/coach-rules` (optional)

Partial section update: `{ "templates": [...] }` only · **200**

### Optional nested

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/coach-rules/templates` | List/create templates |
| GET/PATCH/DELETE | `/api/v1/coach-rules/templates/{id}` | Template CRUD |

Same ownership rules.

---

## 7. Programs

Programs expose **summary** on list and **full document** on detail (unifies FE dual stores).

### ProgramSummary (list item)

```json
{
  "id": "prog-uuid",
  "student_id": "stu-uuid",
  "student_name": "محمد طاهری",
  "title": "برنامه کامل عضله‌سازی",
  "program_type": "complete",
  "status": "active",
  "version": 2,
  "version_label": "2",
  "is_current": true,
  "date_range": "۱ مرداد – ۱ شهریور ۱۴۰۵",
  "updated_at": "2026-07-31T00:00:00Z",
  "created_at": "2026-07-01T00:00:00Z"
}
```

**Status projection for FE compatibility:**

| Computed `status` | Rule |
|---|---|
| `draft` | Latest relevant version is draft (or program has open draft and not active) |
| `ready` | Has finalized version; not active |
| `active` | `active_version_id` set and points to this summarized version |
| `archived` | Program `archived_at` set |

Exact list projection algorithm must be documented in service code; FE adapters map `version` number ↔ display string.

### GET `/api/v1/programs`

**Query:** `search`, `student_id`, `program_type`, `status`, `date_from`, `date_to`, pagination, ordering  
**Auth:** Bearer · **Ownership:** filter `coach_id = request.coach.id`

### GET `/api/v1/students/{student_id}/programs`

Student-scoped list (profile tab).  
**Ownership:** student must belong to coach; then programs for that student + coach.

### POST `/api/v1/programs`

**Purpose:** Create empty Program + Version 1 `draft` without running a generator (manual start).  
**Auth:** Bearer · **Ownership:** `student_id` must belong to coach; `coach_id` forced server-side.  

**Request:**

```json
{
  "student_id": "stu-uuid",
  "title": "برنامه دستی",
  "program_type": "complete",
  "date_range": ""
}
```

**Response `201`:** ProgramDetail with empty/default sections per `program_type`.  
**Errors:** 400 validation; 404 student  

### GET `/api/v1/programs/{program_id}`

**Auth:** Bearer · **Ownership:** program.coach_id must match; else **404**  

**Full ProgramDetail:**

```json
{
  "id": "prog-uuid",
  "student_id": "stu-uuid",
  "title": "...",
  "program_type": "complete",
  "active_version_id": "ver-uuid",
  "date_range": "...",
  "created_at": "...",
  "updated_at": "...",
  "current": {
    "id": "ver-uuid",
    "version": 2,
    "status": "draft",
    "training": { "summary": "", "days": [] },
    "nutrition": { "daily_water": "", "meals": [], "notes": "" },
    "supplements": { "items": [], "medical_note": "", "summary": "" },
    "pdf_settings": {
      "include_training": true,
      "include_nutrition": true,
      "include_supplements": true,
      "include_coach_name": true,
      "include_student_name": true,
      "include_coach_notes": false,
      "file_title": "...",
      "contact_info": "",
      "page_size": "A4",
      "style": "modern"
    },
    "finalized_at": null,
    "updated_at": "..."
  },
  "versions": [
    { "id": "...", "version": 1, "status": "finalized", "finalized_at": "..." }
  ]
}
```

**Section representation decision:** Aggregate document under `current` (and fetch historical via version id).  
**Rationale:** Matches FE editor; one round-trip.  
**Alternative:** `/programs/{id}/training` subresources — unnecessary chatty for MVP.

### GET `/api/v1/programs/{program_id}/versions/{version_id}`

Full historical version document (content immutable if `finalized` / `archived`).  
**Ownership:** via parent Program coach_id.

### POST `/api/v1/programs/generate`

**Purpose:** Create Generation Run; create Program + Draft Version with engine output  
**Auth:** Bearer · **Ownership:** `student_id` and optional `template_id` must belong to coach; never accept client `coach_id`  

**Request:**

```json
{
  "student_id": "stu-uuid",
  "title": "برنامه چهار روزه",
  "program_type": "complete",
  "template_id": "tmpl-uuid",
  "days_per_week": 4,
  "duration_weeks": 4,
  "goal": "hypertrophy",
  "level": "intermediate",
  "muscle_priorities": ["chest"],
  "custom_instructions": "",
  "apply_injury_rules": true,
  "apply_level_rules": true,
  "apply_muscle_priority_rules": true,
  "apply_exercise_bank": true,
  "apply_general_rules": true,
  "engine": "rules_v1",
  "seed": null
}
```

**Response `201`:**

```json
{
  "generation_run_id": "run-uuid",
  "program": { /* ProgramDetail with draft current */ }
}
```

**Errors:** 400 validation; 404 student/template; 422 engine failure mapped to `generation_failed`  
**State:** always creates **Draft**, never Finalized  

### PATCH `/api/v1/programs/{program_id}`

Update lineage fields: `title`, `date_range*` only.  
**Ownership:** program owned by coach.

### PATCH `/api/v1/programs/{program_id}/versions/{version_id}`

**Allowed only if** `status=draft` and version’s Program is owned.  
Body may include `training`, `nutrition`, `supplements`, `pdf_settings` (partial section replace).  
**400** `invalid_state_transition` if `finalized` or `archived` — **finalized content cannot be mutated**.

### POST `/api/v1/programs/{program_id}/versions/{version_id}/finalize`

`draft` → `finalized` · sets `finalized_at` · content becomes immutable · **200** version  
Idempotent if already finalized by same id → **200** same  
**Ownership:** owned program/version.

### POST `/api/v1/programs/{program_id}/activate`

**Body:** `{ "version_id": "..." }`  
Version must be **finalized** and belong to this Program · sets `active_version_id` · updates Student summary title · **200** ProgramSummary  
**Ownership:** owned program.

### POST `/api/v1/programs/{program_id}/versions/{version_id}/new-version`

**Semantics:** **New Version** — same Program lineage; `version_number = max+1`; new **Draft** deep-copied from source; source Version unchanged (including if finalized).  
**201** ProgramDetail focusing new draft · **Ownership:** owned source.

### POST `/api/v1/programs/{program_id}/versions/{version_id}/duplicate`

**Semantics:** **Duplicate** — **new Program** for same Student + coach; Version 1 **Draft** deep-copy; sets `copied_from_program_id` on new Version; source lineage untouched.  
**201** new ProgramDetail · **Ownership:** owned source; cannot target another coach’s student.

### POST `/api/v1/programs/{program_id}/archive`

Soft-archive lineage · **200** · **Ownership:** owned program.

### DELETE `/api/v1/programs/{program_id}`

Allowed only if no finalized versions and no ready PDFs; else **409** — use archive · **Ownership:** owned program.

### GET `/api/v1/generation-runs`

**Purpose:** Optional audit list of Generation Runs for the coach.  
**Query:** `student_id`, `program_id`, pagination, `ordering=-created_at`  
**Auth:** Bearer · **Ownership:** `coach_id = request.coach.id`

### GET `/api/v1/generation-runs/{run_id}`

**200** run detail including `request`, `input_snapshot` summary, `status`, `resulting_version_id` · **404** if other coach.

---

### GET `/api/v1/students/{student_id}/pdf-files/`

Paginated PDF metadata list.  
**Ownership:** student owned by coach.

### GET|POST `/api/v1/programs/{program_id}/pdf-files/`

List program PDF history, or create from a finalized version (`program_version_id` optional when exactly one finalized/active version applies).

### POST `/api/v1/programs/{program_id}/versions/{version_id}/pdf-files/`

Create PDF from a specific **finalized** version (draft → `version_not_finalized`).

**201:** artifact metadata (`status` typically `ready` for synchronous MVP).

### GET|PATCH|DELETE `/api/v1/pdf-files/{pdf_id}/`

Detail · rename (`file_name`) · soft-delete.

### GET `/api/v1/pdf-files/{pdf_id}/download/`

Authenticated streaming PDF download.

### POST `/api/v1/pdf-files/{pdf_id}/regenerate/`

Creates a **new** artifact for the same version; history preserved.

### POST|DELETE `/api/v1/pdf-files/{pdf_id}/share/`

Create (returns raw token once) · revoke active links.

### GET `/api/v1/shared/pdf/{token}/`

Anonymous download authorized only by secure bearer token (hash stored). Invalid/expired/revoked → **404**.

---

## 9. Resource ↔ Frontend capability coverage

| FE capability | API |
|---|---|
| Login/Register/Logout | `/auth/*` |
| Dashboard | `/dashboard` |
| Student CRUD/list | `/students` |
| Visits | `/students/{id}/visits` |
| Coach rules page | `/coach-rules` |
| Programs list/filter | `/programs` |
| Generate | `/programs/generate` |
| Manual empty draft | `POST /programs` |
| Edit preview | PATCH version |
| Finalize / activate | finalize + activate |
| Duplicate / new version | dedicated POSTs |
| Generation audit | `/generation-runs` |
| PDF tab | `/pdf-files` + student nested list |

---

## 10. Major decisions

### API1 — `/api/v1` versioning

- **Decision:** Explicit version prefix.  
- **Rationale:** Safe evolution beside prototype `/api/`.  
- **Consequence:** Prototype routes deprecated/removed in implementation.

### API2 — Program aggregate document

- **Decision:** Detail returns full sections; list returns summaries.  
- **Rationale:** Replace FE dual localStorage stores.  

### API3 — Snake_case JSON

- **Decision:** Wire format snake_case; FE adapter maps camelCase.  
- **Alternative:** camelCase in API — rejected to stay Pythonic/DRF-default.  

### API4 — 404 for cross-tenant

- **Decision:** Hide existence.  
- **Rationale:** Student privacy.

---

## 11. Open questions

| ID | Question |
|---|---|
| API-Q1 | Allow PDF from Draft or only Finalized? |
| API-Q2 | Idempotency-Key mandatory for generate? |
| API-Q3 | Exact overdue-visit threshold for dashboard |
| API-Q4 | Temp-save endpoints with relaxed validation? |

---

## 12. Related documents

`domain-model.md` · `database-schema.md` · `auth-and-permissions.md` · `frontend-integration-plan.md`
