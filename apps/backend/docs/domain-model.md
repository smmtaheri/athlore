# Coach Assistant — Domain Model

**Status:** Design only (not implemented)  
**Companion docs:** `database-schema.md`, `api-contract.md`, `auth-and-permissions.md`, `frontend-integration-plan.md`  
**Base evidence:** `backend-current-state.md`, Frontend MVP types, product design docs  
**Date:** 2026-08-06

---

## 1. Canonical terminology

These terms are **authoritative** across all design documents. Do not invent synonyms in APIs or schema without updating this table.

| Term | Meaning |
|---|---|
| **User** | Authenticated account credentials (email + password). One person. |
| **Coach** / **CoachProfile** | Coaching tenant profile owned 1:1 by a User. All business data is scoped to a Coach. |
| **Student** | A trainee managed by exactly one Coach. Aggregate root for profile data. |
| **Visit** | A monthly check-in for a Student (weight, measurements, adherence, notes). |
| **BodyMeasurement** | Circumference / composition values recorded on a Visit (value object, not a separate aggregate). |
| **CoachRuleSet** | The Coach’s programming system: templates, level rules, injury rules, muscle priorities, exercise bank, general rules. |
| **ProgramTemplate** | Reusable split/volume template inside a CoachRuleSet. |
| **Program** | A **lineage** of related versions for one Student and one coaching intent (title/type). Aggregate root. |
| **Program Version** (`ProgramVersion`) | A numbered snapshot of program content under a Program. |
| **Draft** | A mutable Program Version (`status = draft`). |
| **Finalized** | An immutable Program Version (`status = finalized`). Historical content is frozen. |
| **Active Version** | The finalized version currently designated as the Student’s current program (`Program.active_version_id`). |
| **Duplicate** | Creates a **new Program** lineage by copying content from a source version into version 1 as a Draft. |
| **New Version** | Creates the **next** Program Version under the **same** Program lineage as a Draft, usually copied from a prior version. |
| **Generation Run** (`GenerationRun`) | A recorded attempt to generate program content (inputs, engine, seed, outcome). Provider-agnostic. |
| **PDF File** (`PdfFile`) | A generated (or pending) PDF artifact for a specific Program Version, with metadata and optional share link. |

Frontend legacy names mapped to this model:

| Frontend name | Domain term |
|---|---|
| `AuthUser` | User + CoachProfile display fields |
| `Student` | Student |
| `StudentVisit` | Visit |
| `CoachRules` | CoachRuleSet |
| `GeneratedProgram` | Program Version (full document) |
| `StudentProgramSummary` | Program list projection (Program + current/latest Version) |
| `StudentPdfFile` | PDF File |

---

## 2. Design goals and non-goals

### Goals

- Fit MVP + near-term beta without enterprise ceremony.
- Enforce Coach ownership on every business aggregate.
- Keep Program Drafts editable and Finalized Versions immutable.
- Treat training, nutrition, supplements, and PDF settings as one Program Version document.
- Keep generation engine swappable (rules engine today, AI later).
- Prefer clear aggregates over mirroring every TypeScript interface as a table.

### Non-goals (this design phase)

- Implementing Django models, migrations, or APIs.
- Building a form-builder or arbitrary schema engine.
- Multi-coach collaboration on one Student (one Student → one Coach).
- Real-time collaborative editing.

---

## 3. Aggregate roots

| Aggregate root | Owns / contains | Boundary rule |
|---|---|---|
| **User** (identity) | Credentials; links to CoachProfile | Auth bounded context |
| **CoachProfile** | Display/style settings; owns all tenant data by FK | Created at registration |
| **Student** | Goals, injuries, equipment, lifestyle, preferences, training background/conditions, summary denorms | Never shared across Coaches |
| **Visit** | Measurements, adherence, visit notes | Belongs to one Student (and thus one Coach) |
| **CoachRuleSet** | Templates, level/injury/muscle rules, exercise bank, general rules | Exactly one per Coach |
| **Program** | Lineage metadata; pointers to active/draft versions; ordered Versions | Belongs to one Student + Coach |
| **Generation Run** | Input snapshot, engine metadata, output linkage | Belongs to Coach; may attach to a Version |
| **PDF File** | File metadata, status, share token, storage key | Belongs to Coach; references Program Version |

**Program Version** is an **entity inside the Program aggregate**, not a separate root. All versioning operations go through the Program aggregate/service.

---

## 4. What belongs inside the Program aggregate

### Inside Program (lineage)

- `id`, `coach_id`, `student_id`
- `title`, `program_type` (`complete` \| `workout` \| `nutrition` \| `supplement`)
- `active_version_id` (optional)
- `archived_at` (optional soft archive of whole lineage)
- Audit timestamps

### Inside each Program Version

- `version_number` (monotonic integer per Program, starting at 1)
- `status` (`draft` \| `finalized` \| `archived`)
- **Content document** (logical sections):
  - `training` (optional) — days, exercises, notes
  - `nutrition` (optional) — water, meals, foods, notes
  - `supplements` (optional) — items, medical note, summary
  - `pdf_settings` — export toggles and styling
- Provenance: `source_version_id`, `generation_run_id`, `copied_from_program_id` (for duplicates’ first version)
- Lifecycle timestamps: `created_at`, `updated_at`, `finalized_at`

### Outside the Program aggregate

- Student profile fields (read as generation **inputs**, not stored as mutable program identity)
- CoachRuleSet (generation input)
- Visit (generation input; latest visit may be snapshotted on Generation Run)
- PDF File rows (artifacts derived from a Version)
- Generation Run rows (audit of how a Version’s first content was produced)

---

## 5. Program lifecycle, versioning, and operations

### Version statuses

```text
        create / generate / duplicate / new-version
                        │
                        ▼
                     draft  ←── update content (mutable)
                        │
                   finalize
                        │
                        ▼
                   finalized  ←── immutable content
                        │
                    archive
                        │
                        ▼
                    archived
```

| Status | Mutable content? | Meaning |
|---|---|---|
| `draft` | Yes | Work in progress; coach may edit training/nutrition/supplements/pdf settings |
| `finalized` | **No** | Frozen historical document; may be set Active |
| `archived` | No | Hidden from default lists; retained for history |

### Program-level “active”

- `Program.active_version_id` points to at most one **finalized** Version.
- Setting active:

  1. Target Version must be `finalized` and belong to the Program.
  2. Previous active Version remains `finalized` (not deleted); only the pointer moves.
- Frontend `status: "active"` on list rows = this Program’s active version is that row’s version (or the Program is marked current for the Student).
- Frontend `ready` ≈ finalized but not active.
- Frontend `expired` = **Open question** (see §12); until decided, map to `archived` or a boolean `is_expired` on Program — **Recommendation:** derive expiry later from `date_range_end`; do not add a fifth version status in P1.

### Operations (precise)

| Operation | Result |
|---|---|
| **Create empty draft** | New Program + Version 1 `draft` (optional empty sections by `program_type`) |
| **Generate** | New Generation Run; usually new Program + Version 1 `draft` filled from engine output (or fill existing empty draft) |
| **Update draft** | Patch Version content where `status = draft` only |
| **Finalize** | `draft` → `finalized`; set `finalized_at`; content becomes immutable |
| **Activate** | Set `Program.active_version_id` to a finalized Version |
| **New Version** | Same Program; `version_number = max+1`; new `draft` copied from chosen source Version; source unchanged |
| **Duplicate** | **New** Program for same Student; Version 1 `draft` deep-copied from source Version; title suffix e.g. “کپی”; not linked as same lineage |
| **Archive Program** | Soft-archive lineage; versions retained |
| **Delete** | Soft-delete preferred for Programs with finalized history; hard delete only drafts with no PDF (policy in API doc) |

### Distinctions (required clarity)

| Concept | Is it a new Program? | Is content mutable? | Shares version sequence? |
|---|---|---|---|
| Draft | No (version under Program) | Yes | Yes |
| Finalized Version | No | No | Yes |
| New Version | No | New draft yes | Yes (n+1) |
| Duplicate | **Yes** | New draft yes | **No** (starts at 1) |
| Generation Run | No (audit record) | N/A | May create/fill a Version |
| PDF File | No (artifact) | Metadata yes; bytes immutable once ready | Tied to one Version |

---

## 6. Concept catalog

Priority legend: **P0** first safe integration · **P1** Backend MVP · **P2** before beta · **Later** after beta.

Prototype column refers to `coach-assistant-backend` at `144520e`.

### 6.1 User

| | |
|---|---|
| **Purpose** | Authentication identity |
| **Ownership** | Self; creates CoachProfile |
| **Important fields** | email (unique, normalized), password hash, is_active, date_joined |
| **Relations** | 1:1 CoachProfile |
| **Invariants** | Email unique; password never stored plaintext |
| **Lifecycle** | register → active → (deactivate) |
| **Mutable** | email (careful), password; not id |
| **Priority** | P0 |
| **Prototype** | Django `auth.User` unused by domain → **reuse Django User**, wire to CoachProfile |

### 6.2 CoachProfile

| | |
|---|---|
| **Purpose** | Tenant and coaching persona |
| **Ownership** | User |
| **Important fields** | display_name, style_notes, control_mode (`strict`\|`balanced`\|`creative`), default_session_minutes, locale defaults |
| **Relations** | 1:1 User; 1:N Students, Programs, Visits (via students), PDF Files; 1:1 CoachRuleSet |
| **Invariants** | Exactly one CoachProfile per coach User |
| **Lifecycle** | Created on register; updatable |
| **Priority** | P0 |
| **Prototype** | `Coach` → **change** (add User FK; keep useful fields; rename conceptually to CoachProfile) |

### 6.3 Student

| | |
|---|---|
| **Purpose** | Coach’s trainee record and intake form |
| **Ownership** | CoachProfile |
| **Important fields** | full_name, age, gender, height_cm, weight_kg, phone_number?, status (`active`\|`inactive`), coach_notes; nested value objects below |
| **Relations** | N Visits; N Programs; N PDF Files (via programs/versions) |
| **Invariants** | `coach_id` always set; list filters scoped to coach |
| **Lifecycle** | create → update → archive/inactive (hard delete discouraged if history exists) |
| **Mutable** | Profile fields yes; id no |
| **Priority** | P0 |
| **Prototype** | `StudentProfile` → **replace shape** (keep coach FK idea only) |

#### Value objects on Student (not separate roots)

| Concept | Role | Storage intent | Priority |
|---|---|---|---|
| **StudentGoal** | primary/secondary goals, weak/strong/priority muscles | JSON object on Student | P0 |
| **StudentPreference** | intensity, variety, favorites, disliked styles | JSON on Student | P0 |
| **StudentInjury** | has_injury, type, aggravating moves, disallowed exercises | JSON on Student | P0 |
| **StudentLimitation** | Overlaps injury + training conditions constraints | Represented inside injury + training_conditions; no separate root in MVP | P0 (as fields) |
| Training background / conditions / equipment / lifestyle | Intake sections | JSON objects on Student | P0 |
| List summary denorms | current_program_title, last_visit_date, medical_note | Cached/denormalized fields updated by services | P0 |

**Decision:** Keep these as **structured value objects** on the Student aggregate (JSON with schema validation), not independent tables.  
**Rationale:** Fixed product forms; always loaded with Student; avoids join explosion.  
**Alternative:** Fully normalized child tables — rejected for MVP complexity.  
**Consequence:** Querying “all students with neck injury” uses JSON containment or a generated column later if needed.

### 6.4 Visit (MonthlyVisit)

| | |
|---|---|
| **Purpose** | Monthly progress check-in |
| **Ownership** | Student → Coach |
| **Important fields** | visit_date, current_weight_kg, previous_weight_kg, body_fat_percentage?, energy/sleep/stress levels, adherence percents, feedback/assessment/notes, injury flags |
| **Relations** | Contains BodyMeasurement values |
| **Invariants** | Student must belong to acting Coach; visit_date required |
| **Lifecycle** | create → update → delete (allowed if no legal hold; see open questions) |
| **Priority** | P0 |
| **Prototype** | Absent → **new** |

#### BodyMeasurement

Value object on Visit: waist/chest/arm/thigh/hip cm (optional decimals). Not a separate aggregate. Priority P0.

### 6.5 CoachRuleSet

| | |
|---|---|
| **Purpose** | Coach’s programming system (Frontend `/coach-rules`) |
| **Ownership** | CoachProfile (1:1) |
| **Contains** | ProgramTemplate[], LevelRule[], InjuryRule[], MusclePriority[], ExerciseBankGroup[], GeneralRules |
| **Invariants** | One active rule set per Coach; section schemas validated on save |
| **Lifecycle** | Auto-created empty/default on register; full replace or section updates |
| **Mutable** | Yes (whole document / sections) |
| **Priority** | P1 |
| **Prototype** | Partial: `CoachTemplate`, `CoachRule`, `CoachExercisePreference` → **replace with structured CoachRuleSet**; salvage rule-kind ideas into generator adapters |

#### Nested concepts

| Concept | Purpose | Priority | Prototype |
|---|---|---|---|
| ProgramTemplate | Reusable split template | P1 | `CoachTemplate` — change fields to match product |
| LevelRule | Beginner/intermediate/advanced constraints | P1 | Absent as entity — new |
| InjuryRule | Forbidden/alternative exercises by injury | P1 | Partial via `CoachRule.kind` — replace |
| MusclePriority | Extra volume/order for weak muscles | P1 | Partial via `extra_sets_for_muscles` — replace |
| Exercise / bank groups | Coach-facing exercise organization | P1 | Global `Exercise` + prefs — change to coach-scoped bank for MVP |
| CoachExercisePreference | Weights / blocks per exercise | P1 / Later | Exists — optional merge into bank groups for MVP |

**Decision (MVP):** Model CoachRuleSet as an aggregate with **normalized child tables** for templates and rules (see schema doc), exposed to Frontend primarily via **one aggregate GET/PUT** plus optional nested template CRUD.  
**Rationale:** FE saves one document; generator benefits from queryable templates.  
**Alternative:** Single JSON blob — simpler but weaker querying. Hybrid chosen.

### 6.6 Exercise (catalog)

| | |
|---|---|
| **Purpose** | Canonical exercise identity for generator safety tags |
| **Ownership** | Platform global catalog **or** coach-private entries |
| **MVP stance** | Prefer **coach-scoped exercise bank** matching FE; optional global seed later |
| **Priority** | P1 |
| **Prototype** | Global `Exercise` → **change** (add coach_id nullable for global vs private) |

### 6.7 Program and Program Version

See §4–§5. Priority **P1**. Prototype `GeneratedProgram` → **replace** with Program + ProgramVersion; keep seed/signature ideas on Generation Run.

Logical nested content (entities within Version document):

| Concept | Purpose |
|---|---|
| TrainingProgram | Collection of TrainingDays |
| TrainingDay | Ordered day with target muscles and prescriptions |
| ExercisePrescription | sets, reps, rest, RPE, notes, order |
| NutritionProgram | water, meals, notes |
| Meal | Ordered meal with foods |
| SupplementPlan | items + medical note |
| ProgramPdfSettings | Export options |

**Decision:** Persist these as **versioned JSON documents** with a versioned JSON Schema enforced in the service layer (not as dozens of ORM rows) for P1.  
**Rationale:** Exact historical fidelity, FE already edits a document, listing never filters by inner exercise name in MVP.  
**Alternative:** Fully normalized day/exercise tables — better for analytics, heavier for versioning/copy. Revisit in Later if analytics require it.

### 6.8 Generation Run

| | |
|---|---|
| **Purpose** | Provider-independent record of generation |
| **Ownership** | Coach |
| **Important fields** | engine (`rules_v1` \| `frontend_import` \| `ai_*`), seed, input_snapshot (student/visit/rules/request), output_summary, status, error, resulting_version_id |
| **Invariants** | Does not mutate Finalized Versions; creates/fills Drafts only |
| **Priority** | P1 |
| **Prototype** | Implicit in planner + `GeneratedProgram` → **new** explicit entity |

### 6.9 PDF File

| | |
|---|---|
| **Purpose** | Export artifact history for a Student |
| **Ownership** | Coach; linked to Student + Program Version |
| **Important fields** | status (`pending`\|`generating`\|`ready`\|`failed`), file_name, content_type/program_type, storage_key, size_bytes, share_token_hash, version_label |
| **Lifecycle** | request → generating → ready \| failed; regenerate spawns new attempt or resets; revoke share |
| **Priority** | P2 (metadata API may stub earlier) |
| **Prototype** | Absent → **new** |

### 6.10 Audit timestamps

Every aggregate root and Program Version includes `created_at`, `updated_at` (UTC). Finalized Versions also `finalized_at`. Soft-archive uses `archived_at`. Priority P0 for roots introduced in P0.

---

## 7. Bounded contexts (logical)

```text
Identity          → User, auth tokens
Tenant            → CoachProfile
Student Mgmt      → Student, Visit
Coaching System   → CoachRuleSet (+ templates/rules/bank)
Programming       → Program, Program Version (ProgramVersion), Generation Run (GenerationRun)
Delivery          → PDF File (PdfFile)
```

Services own transitions; API adapters must not embed business rules in serializers/views.

---

## 8. Invariants across aggregates

1. Every Student, Visit, CoachRuleSet, Program, Generation Run, PDF File has `coach_id` equal to the authenticated Coach (directly or via parent).
2. A Visit’s Student must share the same `coach_id`.
3. A Program’s Student must share the same `coach_id`.
4. Only Draft Versions accept content updates.
5. Finalize is irreversible for content (archive does not unlock mutation).
6. Activate requires Finalized Version of the same Program.
7. New Version increments `version_number` without gaps preference (allow gaps only on failed tx — prefer transactional max+1).
8. Duplicate never mutates the source Program.
9. Generation Run engines are named strings; domain does not import vendor SDKs.
10. PDF share links do not grant coach-panel write access; they are read-only artifact access with token.

---

## 9. Prototype migration stance (domain level)

| Prototype model | Stance |
|---|---|
| `Coach` | Evolve → CoachProfile + User link |
| `StudentProfile` | Replace with Student aggregate |
| `CoachTemplate` | Evolve fields → ProgramTemplate under CoachRuleSet |
| `CoachRule` | Replace with typed rule entities / sections |
| `CoachExercisePreference` / `Exercise` | Re-home into coach exercise bank design |
| `GeneratedProgram` | Replace with Program + ProgramVersion + GenerationRun |
| `planner.py` | Reuse as `rules_v1` engine behind Generation Run |

Local untracked `db.sqlite3` Persian rows are **not** part of the domain definition.

---

## 10. Major decisions

### D1 — Program lineage vs single mutable document

- **Decision:** Program (lineage) + Program Versions.
- **Rationale:** Supports New Version and immutable history without copying entire FE dual-store confusion.
- **Alternatives:** Single row overwrite; append-only blob list without lineage.
- **Consequences:** API must expose lineage operations; FE summary/detail unify onto one resource.

### D2 — Content as JSON documents on Version

- **Decision:** training/nutrition/supplements/pdf_settings as structured JSON on Version.
- **Rationale:** Historical exactness + FE document editor.
- **Alternatives:** Normalized tables per exercise/meal.
- **Consequences:** DB constraints limited; service-layer schema validation mandatory.

### D3 — Student value objects as JSON

- **Decision:** goals/injuries/equipment/etc. JSON on Student.
- **Rationale:** Fixed forms, always loaded together.
- **Alternatives:** Child tables per section.
- **Consequences:** Indexing specific injury types deferred.

### D4 — Generation provider independence

- **Decision:** Generation Run + engine interface; no AI vendor in domain model.
- **Rationale:** Swap `rules_v1` / future AI without schema break.
- **Alternatives:** Hardcode planner into Program create.
- **Consequences:** Extra entity; clearer audit.

---

## 11. Priority map (domain delivery)

| Priority | Deliver |
|---|---|
| P0 | User, CoachProfile, Student (+ value objects), Visit (+ measurements), ownership invariants, timestamps |
| P1 | CoachRuleSet + nested rules/templates/bank, Program + Version lifecycle, Generation Run, Dashboard reads |
| P2 | PDF File + share links + real generation pipeline |
| Later | Analytics-normalized exercise tables, multi-device sessions advanced, passwordless auth, staff impersonation |

---

## 12. Open questions

| ID | Question | Impact |
|---|---|---|
| DM-Q1 | Exact semantics of Frontend `expired` vs `archived` | List filters and activate rules |
| DM-Q2 | Is Visit delete allowed after a Program was generated from it? | Referential / audit policy |
| DM-Q3 | Soft-delete vs inactive-only for Students | GDPR / recovery |
| DM-Q4 | Global exercise catalog vs coach-only bank long-term | Sharing and seeding |
| DM-Q5 | Whether `control_mode` stays on CoachProfile or moves into CoachRuleSet | Generator knobs |
| DM-Q6 | Product `ذخیره موقت` (temp save) — partial Student/Visit drafts with weaker validation? | Validation strictness |

---

## 13. Related documents

- Schema: `database-schema.md`
- HTTP API: `api-contract.md`
- AuthZ: `auth-and-permissions.md`
- FE migration: `frontend-integration-plan.md`
