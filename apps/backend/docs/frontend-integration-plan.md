# Coach Assistant — Frontend Integration Plan

**Status:** Design only (no Frontend or Backend code changes in this phase)  
**Companion:** `api-contract.md`, `domain-model.md`, `auth-and-permissions.md`, `backend-current-state.md`  
**Date:** 2026-08-06

---

## Canonical terms

Use `domain-model.md` terms. Mapping from Frontend names is repeated in §2 for implementers.

---

## 1. Goals

- Replace localStorage repositories with `/api/v1` clients **incrementally**
- Keep the app usable during transition (feature flags / adapters)
- Preserve Persian UX and existing routes
- Avoid big-bang rewrite of all features in one PR
- Treat Backend as system of record once a domain is “API-backed”

---

## 2. Current Frontend inventory

### 2.1 Storage keys

| Key | Repository file |
|---|---|
| `coach-assistant.auth.v1` | `src/features/auth/services/authRepository.ts` |
| `coach-assistant.students.v1` | `src/features/students/services/studentsRepository.ts` |
| `coach-assistant.student-visits.v1` | `src/features/students/services/studentVisitsRepository.ts` |
| `coach-assistant.student-programs.v1` | `src/features/students/services/studentProgramsRepository.ts` |
| `coach-assistant.generated-programs.v1` | `src/features/programs/services/programsRepository.ts` |
| `coach-assistant.coach-rules.v1` | `src/features/coach-rules/services/coachRulesRepository.ts` |
| `coach-assistant.student-pdf-files.v1` | `src/features/students/services/studentPdfFilesRepository.ts` |

### 2.2 Dual program stores (important)

| Store | Role today |
|---|---|
| `student-programs` | List/summary, activate, duplicate |
| `generated-programs` | Full editable document |

**Backend target:** single Program resource with summary vs detail projections (`api-contract.md`). FE should collapse to one `programsRepository` talking to API.

---

## 3. Per-repository integration map

### 3.1 Auth — `authRepository`

| | |
|---|---|
| **Responsibility** | Mock login/register/logout/session |
| **API** | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/me` |
| **Direct map** | email, full_name/password → user; token → access |
| **Adapters** | Persist `{ access, refresh }` instead of `mock-token-*`; load coach from `/me` |
| **Disappear** | Hardcoded `arman@example.com` special-case; passwordless acceptance of any password |
| **Errors** | Map 401 → login form error; network → Persian retry |
| **Loading** | Keep AuthContext `loading \| authenticated \| anonymous` |
| **Cache** | Session only; refresh on 401 once |

### 3.2 Students — `studentsRepository`

| | |
|---|---|
| **Responsibility** | CRUD + list (client filter/page) |
| **API** | `/students` GET/POST, `/students/{id}` GET/PATCH, archive POST |
| **Direct map** | Most Student fields (camelCase ↔ snake_case) |
| **Adapters** | Pagination: move filter/search to query params; pageSize 5 via `limit` |
| **Disappear** | `reset()` fixture helper in production builds |
| **Errors** | 404 → notFound UI; 400 → field errors |
| **Cache** | Invalidate list on create/update; detail on patch |

### 3.3 Visits — `studentVisitsRepository`

| | |
|---|---|
| **Responsibility** | Per-student visit CRUD |
| **API** | `/students/{id}/visits` … + `/latest` |
| **Direct map** | Visit fields; measurements/adherence nested objects |
| **Adapters** | Snake_case; optional flatten measurements in transport per API examples |
| **Disappear** | Global `list()` of all visits if unused |
| **Errors** | 409 duplicate visit_date |
| **Cache** | Invalidate student summary last visit |

### 3.4 Coach rules — `coachRulesRepository`

| | |
|---|---|
| **Responsibility** | get/save entire CoachRules |
| **API** | `GET/PUT /coach-rules` |
| **Direct map** | templates, levels, injuries, musclePriorities, exerciseBank, generalRules |
| **Adapters** | `musclePriorities` ↔ `muscle_priorities`; level `id` stays beginner/… |
| **Disappear** | Local `updatedAt` only — use server `updated_at` |
| **Errors** | 400 section validation |
| **Cache** | Single document; dirty-form warning already in UI |

### 3.5 Programs — `programsRepository` + `studentProgramsRepository`

| | |
|---|---|
| **Responsibility** | Full doc vs summary dual write |
| **API** | `/programs`, `POST /programs` (empty draft), `/programs/generate`, version PATCH/finalize/new-version/duplicate, activate, archive |
| **Direct map** | training/nutrition/supplements/pdfSettings document |
| **Adapters** | Unify repositories; map status projection; `version` number vs FE summary string; `create` empty vs generate |
| **Disappear** | Dual localStorage sync bugs; fixture fallback `createGeneratedProgramFromSummary` |
| **Errors** | `invalid_state_transition` on editing finalized |
| **Cache** | List + detail tags; invalidate on finalize/activate |

### 3.6 PDF — `studentPdfFilesRepository`

| | |
|---|---|
| **Responsibility** | Mock metadata + share URL string |
| **API** | student pdf list; create via version; regenerate; rename; share; delete |
| **Direct map** | fileName, status, programId, version label |
| **Adapters** | `size` string ← format `size_bytes`; poll generating; real download URL |
| **Disappear** | Fake `1.6 MB`; `coach-assistant.local` hardcoded host |
| **Errors** | failed status + message |
| **Cache** | Poll until ready/failed |

### 3.7 Dashboard — `dashboardMetrics.ts`

| | |
|---|---|
| **Responsibility** | Client aggregate from all repos |
| **API** | `GET /dashboard` |
| **Adapters** | Prefer server aggregates when flag on; fallback compose from API lists during transition |
| **Disappear** | Pure client calculation once dashboard API trusted |

### 3.8 Generator — `programGenerator.ts`

| | |
|---|---|
| **Responsibility** | Deterministic FE generation |
| **API** | `POST /programs/generate` with `engine` |
| **Transition** | Phase A: FE still generates, POST document as draft create; Phase B: server `rules_v1`; Phase C: optional AI engine |
| **Disappear** | Client generator when server engine accepted |

---

## 4. localStorage data handling — recommendation

| Option | Verdict |
|---|---|
| Keep forever as parallel source of truth | Reject — split brain |
| One-time import API for demos | **Optional tool** for developers |
| Clear on API activation | Acceptable for beta testers with warning |
| Mock fallback behind flag | **Recommended during development** |

### Decision: staged dual-run with feature flags

```text
VITE_API_URL=...
VITE_DATA_SOURCE=mock | api | hybrid
```

| Mode | Behavior |
|---|---|
| `mock` | Current localStorage (default until backend ready) |
| `hybrid` | Auth+Students from API; other domains mock (per phase) |
| `api` | All integrated domains use API; ignore local domain keys |

**One-time import:** Dev-only endpoint or script `POST /api/v1/dev/import-local` (disabled in prod) accepting exported JSON of the seven keys — maps string ids to new UUIDs, assigns to current coach.

**Local backend DB warning:** Untracked Persian `db.sqlite3` ≠ committed fixtures ≠ FE fixtures. Do not assume they align. Seed Backend from product fixtures (Arman / Mohammad) separately from FE localStorage import.

**Clear on API activation (end-user beta):** On first successful `api` mode login, show Persian notice: local demo data will not sync automatically; offer “ادامه با حساب سرور” vs stay on mock.

---

## 5. Recommended integration order

### Phase 0 — Backend prerequisites (no FE change)

- Env-based settings, Postgres, custom User, JWT, CoachProfile
- Error envelope + pagination
- Remove AllowAny
- **Acceptance:** coach A/B isolation tests green

### Phase 1 — Authentication

| | |
|---|---|
| **Backend prerequisite** | register/login/refresh/logout/me |
| **Replace** | `authRepository` |
| **Flag** | `hybrid` auth-only |
| **Data migration** | None (mock users discarded) |
| **Risks** | Token storage XSS; refresh bugs |
| **Acceptance** | Login/register/logout/refresh persistence; protected routes; no mock password accept |

### Phase 2 — Current coach profile

| | |
|---|---|
| **Backend** | `GET/PATCH /me/coach` |
| **FE** | Display name on shell/PDF settings defaults |
| **Acceptance** | Name from server after refresh |

### Phase 3 — Students

| | |
|---|---|
| **Backend** | Student CRUD + list filters/pagination |
| **Replace** | `studentsRepository` |
| **Risks** | Field naming adapters; pagination UX |
| **Acceptance** | List/search/filter/create/edit/profile load; ownership isolation |

### Phase 4 — Visits

| | |
|---|---|
| **Backend** | Visit endpoints + latest |
| **Replace** | `studentVisitsRepository` |
| **Acceptance** | Create/edit/list; lastVisitDate denorm updates; dashboard overdue inputs available |

### Phase 5 — Coach rules

| | |
|---|---|
| **Backend** | CoachRuleSet aggregate GET/PUT |
| **Replace** | `coachRulesRepository` |
| **Acceptance** | Load/save all sections; reload persistence |

### Phase 6 — Program list / detail

| | |
|---|---|
| **Backend** | Program list/detail (read) + archive |
| **Replace** | Merge read paths of both program repos |
| **Acceptance** | Programs page + student programs tab from API |

### Phase 7 — Program draft editing

| | |
|---|---|
| **Backend** | PATCH draft; reject finalized mutations |
| **Replace** | `programsRepository.update` |
| **Acceptance** | Preview editor saves; finalize locked |

### Phase 8 — Program generation + versioning ops

| | |
|---|---|
| **Backend** | generate, finalize, activate, duplicate, new-version |
| **Replace** | generator + version/duplicate/activate flows |
| **Transition** | Start with server persistence of FE-generated payload if engine incomplete; switch `engine=rules_v1` when ready |
| **Acceptance** | Same input → stable seed behavior documented; duplicate ≠ new version; history immutable |

### Phase 9 — Dashboard

| | |
|---|---|
| **Backend** | `/dashboard` |
| **Replace** | `calculateDashboardMetrics` usage |
| **Acceptance** | Counts match server data; no dependency on localStorage |

### Phase 10 — PDF

| | |
|---|---|
| **Backend** | PDF jobs + share + download |
| **Replace** | `studentPdfFilesRepository` |
| **Acceptance** | generating→ready poll; rename; share; auth download; public token |

---

## 6. Adapter layer sketch (FE)

Keep UI/types largely camelCase. Introduce:

```text
src/shared/api/httpClient.ts       # auth header, refresh, error envelope
src/shared/api/mappers/*.ts        # snake ↔ camel
src/features/*/services/*Repository.ts  # swap impl by flag
```

Do not scatter `fetch` inside pages.

---

## 7. Testing strategy during migration

| Layer | Action |
|---|---|
| FE unit tests | Mock httpClient; keep Persian validation tests |
| FE integration | Flag `mock` CI job + optional API contract smoke Later |
| Backend | Ownership + state transition tests before each FE phase |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Dual-store program divergence | Collapse repositories in Phase 6 before editing |
| ID format change (slug → UUID) | Break mock deep links; use server ids only in api mode |
| Partial hybrid inconsistency | Document which domains are live per flag version |
| PDF still mock while programs live | Explicit UI badge “PDF آزمایشی” until Phase 10 |
| Generator parity FE vs BE | Golden-file tests on seeds; feature flag engine |

---

## 9. Major decisions

### FEI1 — Feature-flagged repository swap

- **Decision:** `mock | hybrid | api` rather than hard cut.  
- **Rationale:** FE MVP already ships; Backend lands domain-by-domain.

### FEI2 — Auth first

- **Decision:** No real student data on API without auth.  
- **Rationale:** Prototype AllowAny is unsafe.

### FEI3 — Unify program stores at API boundary

- **Decision:** One programs API client.  
- **Rationale:** Domain model has one Program aggregate.

### FEI4 — Server becomes generation SoR at Phase 8

- **Decision:** Prefer Backend `Generation Run`; FE generator temporary bridge only.  
- **Rationale:** Provider-independent engines; auditability.

---

## 10. Open questions

| ID | Question |
|---|---|
| FEI-Q1 | Ship hybrid in production or only local/staging? |
| FEI-Q2 | Offer user-facing localStorage export/import? |
| FEI-Q3 | Keep FE generator as offline fallback forever? |
| FEI-Q4 | CamelCase API to reduce mappers? (Currently rejected in api-contract) |

---

## 11. Related documents

`domain-model.md` · `database-schema.md` · `api-contract.md` · `auth-and-permissions.md` · `backend-current-state.md`
