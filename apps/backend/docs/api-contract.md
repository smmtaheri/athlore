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

Exercise catalog writes (`POST /exercises/`, `PATCH /exercises/<id>/`) return
`exercise_duplicate` for an existing coach/name/primary-muscle combination and
`exercise_validation_error` for recognized input errors. Their Persian `message`
identifies the correction needed; `details` contains localized field messages.
The duplicate rule includes archived exercises and also covers database uniqueness
conflicts during editing or concurrent creation. Duplicate aliases (within the same
exercise or another exercise owned by the coach) are localized `aliases` validation
errors, with failed create/edit changes rolled back. Existing access checks are unchanged.

Unclassified exercise validation failures return HTTP 400 with
`exercise_save_unknown`; unexpected application/database failures use the same code
with HTTP 500. Both include `details.error_id` (32 hexadecimal characters). Search
backend container logs for that reference under `accounts.exercise_errors`; the log
records the method, path, user ID, exception and validation details without logging
the request body. Do not expose internal exception text to the coach. Once a new
cause is diagnosed, add it to the recognized error mapping and regression tests.
Network/CDN failures that do not reach the application cannot receive this server
reference; the UI instead asks for the failure time and retains browser diagnostics.

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

### POST `/api/v1/auth/phone-login`

Both coach and student login resolve existing accounts through the role profile's `phone_number`;
login never creates an account or rewrites internal usernames, IDs, passwords, or domain ownership.
The request uses `{ "phone_number", "role": "coach" | "student", "method": "password", "password" }`
or the configured code method. National `9…`, `09…`, `989…`, and `+989…` inputs normalize to the
same stored number. Invalid credentials return a generic `401`.

Legacy `/api/v1/auth/login/` and `/api/v1/student/login/` always return `410` with
`phone_login_required`, a phone-login instruction, and no tokens. Existing sessions are unaffected.
Student activation requires only `initial_password`; the server allocates an internal username for
new accounts and preserves existing usernames. The old portal username-edit route is retired with
the same explicit error. First activation/reset still requires password change before normal portal
access or code login. No account migration or database schema change is needed.

### POST `/api/v1/auth/request-code/`

With `LOGIN_OTP_PROVIDER=najva` (stage Compose), this endpoint sends a random
six-digit code through Najva. Configuration requires `NAJVA_API_KEY`,
`NAJVA_SENDER` (default `100005676`), and the approved template name
`NAJVA_TEMPLATE` (default `athlore_otp`, using the `%token` placeholder). The
API key never reaches the browser. There is no automatic static-code fallback.
Successful acknowledgement returns `delivery_mode: sms`, a generic message,
`expires_in_seconds: 300` and `retry_after_seconds: 60`, without the code.
Only existing active accounts that completed student password setup are eligible
for paid delivery; other accounts receive the same acknowledgement without SMS.
Missing configuration/provider errors return explicit sanitized 503 errors.
Codes are hashed in shared database state, scoped to phone and role, expire in
five minutes, and are consumed once. Five wrong guesses exhaust a challenge;
resending invalidates its predecessor. Requests are throttled by phone/role
and connection IP, including failed sends. Password login is independent.

The following static-provider behavior is retained for the existing production
configuration and isolated tests; it is disabled unconditionally in stage Compose.

Anonymous request: `{ "phone_number": "9121234567", "role": "coach" | "student" }`.
The phone is normalized with the same rules as phone login. Invalid input returns
400. When `LOGIN_OTP_ENABLED` is false or `LOGIN_OTP_STATIC_CODE` is empty, this
endpoint returns 403 with code `otp_unavailable` and offers password login.

The current delivery adapter is a temporary fixed-code stub: HTTP 200 returns
`{ "delivery_mode": "test", "message": "..." }`. The message explicitly states
that no SMS was sent and shows the configured test code. This request does not
look up account existence, create users, issue tokens or change the session.
Replace `request_phone_login_code` with the real delivery provider before public
use; delivery throttling and expiring, single-use challenges belong there. The
fixed code is currently enabled on production as well as stage, so anyone who
knows an active account's phone number can log in with it.

Both login pages use: phone → select code login → request code → successful
acknowledgement → show code input → verify with `/auth/phone-login/` using
`{ "phone_number", "role", "method": "code", "code" }`. Resending clears the
old input only after success. Changing the phone or login method resets the UI
to the request step. Password login and student first-login password setup are
unchanged. A failed delivery never opens the code field or signs the user in.

Production currently uses the temporary static code (`1111`) until an SMS
provider is connected. This is temporary and insecure: anyone who knows an
active account's phone number can sign in. Replace it with expiring,
single-use provider challenges before public OTP use.

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

### Visit photos

- Coach staging: `POST /api/v1/students/{student_id}/visits/photo-staging/` (multipart `session_id`, `pose`, `file`, optional `visit_id`).
- Student staging: `POST /api/v1/me/visits/{visit_id}/photo-staging/` (multipart `session_id`, `pose`, `file`).
- Discard own staged upload: `DELETE /api/v1/visits/photos/staged/{staged_photo_id}/`.
- Commit staged photos for an existing visit: `POST /api/v1/students/{student_id}/visits/{visit_id}/photos/commit/` or `POST /api/v1/me/visits/{visit_id}/photos/commit/` with `session_id`.
- Coach create/update and student answer PATCH also accept optional `staged_photo_session_id`; successful staged photos are attached during that explicit save. Responses include `photo_issues` for expired or occupied poses. Uploading a staged photo never creates a Visit.
- Staged files are private, scoped to actor/student/visit/session, replaceable until commit, and expire after 24 hours. The deployment prunes expired stages hourly.
- Coach collection: `GET/POST /api/v1/students/{student_id}/visits/{visit_id}/photos/`
- Student collection: `GET/POST /api/v1/me/visits/{visit_id}/photos/`
- Private download: `GET /api/v1/visits/photos/{photo_id}/download/`
- Upload uses multipart fields `file` and `pose`; `pose` is one of `back`, `front`, `right_side`, or `left_side`.
- A visit has at most one photo per pose across coach and student uploads. A filled slot is immutable; a second upload returns **409** (`visit_photo_pose_taken`).
- Photo uploads do not change visit status. Students may add a photo to any visible non-draft visit while their central writable access is active; coach uploads are scoped to their own student and visit.
- Existing photos without a pose remain visible as unassigned historical photos.

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
  "apply_exercise_catalog": true,
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

Program creation, generation, and lineage updates accept `date_range_start` and
`date_range_end` as ISO dates (`YYYY-MM-DD`) or `null`. Invalid dates and an end
before the start return field-specific `400` errors before changes are saved.
Successful responses serialize supplied dates as ISO strings, including the
initial draft response used to attach uploaded PDF sections. The upload-only
draft endpoint continues to require both dates.

### PATCH `/api/v1/programs/{program_id}/versions/{version_id}`

**Allowed only if** `status=draft` and version’s Program is owned.  
Body may include `training`, `nutrition`, `supplements`, `pdf_settings` (partial section replace).  
**400** `invalid_state_transition` if `finalized` or `archived` — **finalized content cannot be mutated**.

### POST `/api/v1/programs/{program_id}/versions/{version_id}/finalize`

`draft` → `finalized` · sets `finalized_at` · content becomes immutable · **200** version  
Idempotent if already finalized by same id → **200** same  

When `PROGRAM_READY_SMS_ENABLED=true` (stage only by default), the first successful
finalization schedules one Najva message **after the database transaction commits**.
Both generated and uploaded programs use this path; three PDF sections still
produce one message, not one per file. Drafts/staging, activation and repeated
finalize requests do not send messages. The existing response contract is unchanged.
Only active students with an enabled, active portal account and a visible program
are notified. `NAJVA_PROGRAM_READY_TEMPLATE` defaults to `athlore_program_ready`;
`token20` receives the first whitespace-delimited name (maximum 20 characters),
or the generic salutation `ورزشکار` for missing/overlong legacy names.

Provider failures never roll back publication or hide the program. A persistent
`ProgramReadySms` row records pending/sending/sent/failed/skipped status per version,
the provider message ID on acceptance, and a sanitized error code. `sent` means
Najva accepted the message, not confirmed handset delivery. There is no automatic
retry: a timeout may mean the provider accepted the SMS. Repeated publication does
not retry failed/uncertain sends. Staff can inspect status in Django admin; no
new coach/student screens are added. This sends synchronously after commit with
a 20-second provider timeout; it is not a background queue.
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

For one categorized output, POST accepts `delivery_outputs: "section"` and required `section: "workout" | "nutrition" | "supplement"`. The server applies the matching content flags and returns the artifact with `section` and `program_date_range` metadata. Existing artifacts may have no section and remain valid.

### POST `/api/v1/programs/{program_id}/versions/{version_id}/pdf-files/`

Create PDF from a specific **finalized** version (draft → `version_not_finalized`).

**201:** artifact metadata (`status` typically `ready` for synchronous MVP).

### POST `/api/v1/program-pdfs/staging/`

Multipart coach upload before finalization: `file` and optional `section` (`workout|nutrition|supplement`). Returns a private staged-file ID; it is not visible to the student until the associated version is finalized.

### POST `/api/v1/programs/{program_id}/versions/{version_id}/staged-pdf/`

Associate a staged upload with a draft using `staged_pdf_id` and optional `section`. One staged file per categorized section is retained; replacing a section discards its previous staged file. A finalized version promotes the selected uploads as individual PDF artifacts. Missing/expired uploads configured for delivery prevent finalization.

`pdf_settings.deliverySections` may set each section to `generated`, `uploaded`, or `omitted`. Omitted sections are not delivered; a complete program can therefore deliver any non-empty subset of its three sections.

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

### Program request flow

`ProgramRequest` is the shared work item between a student and coach. A program reaching its
end date only creates a dashboard reminder; it never creates a request automatically.

- `GET /api/v1/me/program-request-defaults/` returns editable initial values from the student
  profile and most recently fulfilled request.
- `GET|POST /api/v1/me/program-requests/` lists the student’s requests or submits a request.
  At least one of `workout`, `nutrition`, or `supplement` is required. The request captures
  weekly training sessions, training environment, goal, injury/limitation updates, schedule,
  sleep, and nutrition notes. A partial unique constraint allows at most one open request per
  student; retries return the existing request instead of creating duplicates.
- Student responses intentionally omit coach-only request notes and the coach-facing profile
  snapshot. Visit private notes are not copied into a request or exposed through this API.
- `GET /api/v1/program-requests/?status=open|all|<status>` is coach-scoped. The dashboard
  includes open/unread request counts plus program period reminders.
- `GET /api/v1/program-requests/{id}/` marks that request read. `POST
  /api/v1/program-requests/mark-read/` marks the coach’s open queue read. `POST
  /api/v1/program-requests/{id}/start/` accepts `assessment_mode` (`online`, `in_person`,
  `none`) and optional `visit_id`.
- A coach may start an online/in-person Visit from a request, or go straight to program work
  without a new Visit. When a specific Visit is attached, generation uses that Visit, never a
  different “latest” one. Creating a program from an explicit existing Visit also connects it
  to the student’s open request or creates the associated in-person request once.
- A request becomes fulfilled only when every requested section is active/finalized and has a
  ready, student-accessible PDF. Publishing one requested section does not replace unrelated
  active sections or fulfill the remaining request sections.
- Dashboard period reminders are derived from the current active program by section: ended,
  ending within seven days, or missing an end date. Reminders do not send a request or modify a
  program automatically.

---

## 9. Resource ↔ Frontend capability coverage

| FE capability | API |
|---|---|
| Login/Register/Logout | `/auth/*` |
| Dashboard | `/dashboard` |
| Student program request | `/me/program-request-defaults`, `/me/program-requests` |
| Coach program request queue | `/program-requests`, `/program-requests/{id}/start` |
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
