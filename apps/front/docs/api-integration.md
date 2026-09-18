# Frontend API Integration (P2)

**Status:** Implemented  
**Date:** 2026-08-06  
**Backend companions:** `p0-backend-implementation.md`, `p1-rules-and-programs-implementation.md`, `p2-dashboard-and-integration-support.md`

---

## Local development setup

1. Backend (temporary DB recommended):

```bash
cd coach-assistant-backend
DJANGO_DB_NAME=/tmp/coach_p2.sqlite3 .venv/bin/python manage.py migrate
DJANGO_DB_NAME=/tmp/coach_p2.sqlite3 .venv/bin/python manage.py runserver 127.0.0.1:8000
```

2. Frontend:

```bash
cd coach-assistant-frontend
cp .env.example .env.local   # optional
pnpm dev
```

Default `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1` (CORS allows Vite `localhost:5173`).

Set `VITE_USE_MOCK_API=true` only for offline fixture mode. **Unit tests** (`vitest` `MODE=test`) automatically use localStorage repositories.

---

## Architecture

| Layer            | Location                                                            |
| ---------------- | ------------------------------------------------------------------- |
| Config           | `src/app/config/appConfig.ts`                                       |
| API client       | `src/shared/api/client.ts`                                          |
| Session (v3)     | `src/shared/api/session.ts` — key `coach-assistant.auth.session.v3` |
| Errors           | `src/shared/api/errors.ts`                                          |
| Auth API repo    | `src/shared/api/authApi.ts`                                         |
| Domain API repos | `src/shared/api/repositories.ts`                                    |
| DTO adapters     | `src/shared/adapters/apiAdapters.ts`                                |

Feature repositories keep the same exported names (`studentsRepository`, …). When `appConfig.useMockRepositories` is false they delegate to API implementations.

---

## Token lifecycle

1. Login/register stores the short-lived access session in the tab session and keeps the refresh token in the HttpOnly refresh cookie (with an in-memory fallback only for the current tab).
2. Authenticated requests send `Authorization: Bearer <access>`.
3. A new tab bootstraps through `POST /auth/refresh/` and `GET /me/` using the HttpOnly cookie, so the coach is not asked to log in again.
4. On `401`, **one** shared refresh (`POST /auth/refresh/`) runs; concurrent callers await it.
5. Original request retries **once** with the new access token.
6. Refresh failure clears session and AuthContext becomes anonymous (routes redirect to Login).
7. Logout calls `POST /auth/logout/` and clears the local session plus the HttpOnly cookie.
8. Tokens are never logged or placed in URLs.

The default access lifetime is 30 minutes and the default refresh-cookie lifetime is 7 days. Both remain environment-configurable through `JWT_ACCESS_MINUTES` and `JWT_REFRESH_DAYS`.

Legacy key `coach-assistant.auth.v1` is **not** deleted automatically and is unused in API mode.

---

## Repository replacement map

| Domain             | Legacy key                              | Active source                                          |
| ------------------ | --------------------------------------- | ------------------------------------------------------ |
| Auth               | `coach-assistant.auth.v1`               | API session v2                                         |
| Students           | `coach-assistant.students.v1`           | `/students/`                                           |
| Visits             | `coach-assistant.student-visits.v1`     | `/students/{id}/visits/`                               |
| Coach rules        | `coach-assistant.coach-rules.v1`        | `/coach-rules/`                                        |
| Program summaries  | `coach-assistant.student-programs.v1`   | `/programs/` + student nested                          |
| Generated programs | `coach-assistant.generated-programs.v1` | `/programs/` detail + generate                         |
| Dashboard          | client calc                             | `/dashboard/`                                          |
| PDF API            | `coach-assistant.student-pdf-files.v1`  | **Retired from active API mode (P3)** — mock/test only |

No silent API→localStorage fallback after failures.

---

## Program generation

Normal runtime calls `POST /programs/generate/` (`rules_v1`). The Frontend `programGenerator.ts` remains for unit tests / mock mode only and is not used when `programsRepository.generate` exists.

---

## PDF mock boundary

- PDF **settings** persist on Program versions via Backend.
- «Create PDF» writes a **local mock metadata** record and clearly states no real server file exists.
- Dashboard API always reports `readyPdfFiles: 0`.

---

## Tests

- `src/shared/api/client.test.ts` — token attachment, error envelope, shared refresh, refresh failure, network errors
- `src/shared/adapters/apiAdapters.test.ts` — DTO mapping including PDF count honesty
- Existing feature tests continue against localStorage repositories via `MODE=test`

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

---

## Full-stack smoke (temporary DB)

1. Migrate temp Backend DB; runserver on `:8000`.
2. Run Vite with `VITE_API_BASE_URL` pointing at Backend.
3. Register Coach A → create student/visit → put coach rules → generate → edit draft → finalize → new version → duplicate → list/history → dashboard → logout.
4. Register Coach B → confirm isolation.
5. Confirm `/api/` anonymous routes 404.

Report `FULL-STACK SMOKE OK` only when the scripted HTTP flow (and browser checks if available) succeed.

---

## Known limitations

- No React Query / global cache library — pages refetch on mount / reload keys.
- Student list server pagination uses `limit/offset`; mock mode still filters client-side.
- PDF files remain mock-only.
- Nutrition/supplement document shapes are adapted best-effort to existing UI types.
