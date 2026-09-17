# Coach Assistant — Authentication and Permissions

**Status:** Design only (not implemented)  
**Companion:** `domain-model.md`, `api-contract.md`  
**Date:** 2026-08-06

---

## Canonical terms

Coach = authenticated tenant via **User** + **CoachProfile**. All Students, Visits, CoachRuleSets, Programs, Program Versions, Generation Runs, and PDF Files are owned by exactly one Coach.

---

## 1. Identity model

```text
User (credentials)
  └── 1:1 CoachProfile (tenant)
        ├── CoachRuleSet
        ├── Students → Visits
        ├── Programs → Program Versions
        ├── Generation Runs
        └── PDF Files
```

| Decision | **One User registers as one Coach.** No Student login in MVP. |
|---|---|
| **Rationale** | Product is a coach panel. |
| **Alternatives** | Multi-profile users; student portal — Later. |
| **Consequences** | Registration always provisions CoachProfile + empty CoachRuleSet. |

Admin/staff use Django `is_staff` / `is_superuser` for break-glass support (see §9).

---

## 2. Registration and passwords

### Registration

- Endpoint: `POST /api/v1/auth/register`
- Creates User (email + password) + CoachProfile (`display_name` from `full_name`) + CoachRuleSet
- Email stored **normalized** (trim + lower-case); uniqueness case-insensitive
- On success, issue access + refresh tokens (same as login)

### Password policy (MVP)

| Rule | Value |
|---|---|
| Minimum length | 8 |
| Complexity | At least one letter and one number (tune with product) |
| Storage | **Django password hashers only** (PBKDF2/Argon2 via Django defaults) |
| Transmission | HTTPS only |

Never log raw passwords. Never return password hashes in APIs.

### Login identifier

- **Email + password** (matches Frontend mock)
- Generic error on failure: do not reveal whether email exists

### Password reset

- **P2:** email reset tokens (signed, single-use, short TTL)
- Out of P0/P1 critical path but design-compatible (Django token patterns)

### Account deactivation

- `User.is_active = false` blocks auth
- Tenant data retained; soft-archive optional
- Reactivate via admin or future self-serve

---

## 3. JWT versus session — decision

| | |
|---|---|
| **Decision** | **JWT access + rotating refresh tokens** for the SPA (Vite on separate origin). |
| **Rationale** | Frontend already models `token` sessions; cross-origin cookie sessions need careful CSRF + cookie flags; SimpleJWT is common with DRF. |
| **Alternatives** | SessionAuthentication + CSRF cookies — viable if FE and API share a site and cookie domain. |
| **Consequences** | Must implement refresh rotation, logout revocation, CORS allowlist; do **not** store long-lived access tokens only. |

### Token lifetimes (recommended defaults)

| Token | Lifetime | Storage (FE) |
|---|---|---|
| Access | **15–30 minutes** | Memory or sessionStorage preferred over localStorage long-term |
| Refresh | **7–14 days** | Secure storage; httpOnly cookie **optional enhancement** (P2) |

MVP may keep refresh in FE memory/localStorage with documented XSS risk mitigation (CSP later).

### Refresh rotation

- Each refresh returns **new** access + **new** refresh
- Old refresh **revoked** (jti blacklist / server-side refresh store)
- Reuse of revoked refresh → revoke family (theft detection) — **Recommendation** for beta

### Logout / revocation

- `POST /auth/logout` with refresh token → revoke
- Access token remains valid until expiry (short TTL); optional access blacklist Later

### CSRF

- Bearer tokens in `Authorization` header → **CSRF not applicable** to JWT header auth
- If future cookie-based refresh is added → SameSite + CSRF for cookie endpoints

### CORS

- Allow explicit FE origins only (`https://app…`, `http://localhost:5173`)
- `Allow-Credentials` only if cookies used
- Never `Access-Control-Allow-Origin: *` with credentials

---

## 4. Authentication flow (MVP)

```text
Register/Login → { access, refresh, user, coach }
API calls → Authorization: Bearer access
401 token_expired → Refresh → retry once
Logout → revoke refresh → clear FE session
```

`GET /me` restores coach context on app load (replaces mocking `getSession`).

---

## 5. Ownership enforcement strategy

Ownership is **mandatory** at every layer. Views alone are insufficient.

### 5.1 Querysets

```text
Student.objects.filter(coach_id=request.coach.id)
Visit.objects.filter(coach_id=request.coach.id)
Program.objects.filter(coach_id=request.coach.id)
...
```

Default managers or repository helpers **must** require `coach_id` (no unbound `.all()` in app services).

### 5.2 Object lookup

- `get_for_coach(coach, id)` → object or raise NotFound
- Cross-tenant UUID → **404**

### 5.3 Service layer

- All state transitions (finalize, activate, duplicate, generate, PDF) accept `coach` as first parameter
- Services assert `entity.coach_id == coach.id` before mutation
- Serializers/views contain **no** business rules beyond parse/auth

### 5.4 Create operations

- Ignore client-supplied `coach_id`
- Set from `request.coach`
- For nested creates (visit under student): verify student ownership first

### 5.5 Nested resources

- Path `/students/{student_id}/visits/...` → load student for coach, then visit for student+coach
- Never trust `student_id` in body alone without ownership check

### 5.6 Duplicate / New Version

- Source Program/Version must be owned
- New Program inherits same `coach_id` and `student_id`
- Cannot duplicate into another coach’s student

### 5.7 PDF download and share links

| Access mode | Rule |
|---|---|
| Authenticated download | Coach owner only (`pdf.coach_id`) |
| Public share URL | Valid unexpired unrevoked token hash; **read-only**; no listing of other files; rate limited |
| Regenerated token | Old token revoked |

Share tokens: high-entropy; store **hash only**; optional expiry default 7–30 days.

---

## 6. Permission matrix

| Resource | Anonymous | Coach owner | Other coach | Admin (staff) |
|---|---|---|---|---|
| Register / Login / Refresh | Allow | — | — | — |
| Logout / Me | Deny | Allow | — | Allow (self) |
| Dashboard | Deny | Own aggregates | Deny (404/empty) | Optional all-tenant Later |
| Students CRUD/archive | Deny | Own | 404 | Read/write break-glass |
| Visits | Deny | Own via student | 404 | Break-glass |
| CoachRuleSet | Deny | Own | 404 | Break-glass |
| Programs / Versions | Deny | Own | 404 | Break-glass |
| Generation Runs | Deny | Own | 404 | Break-glass |
| Generate | Deny | Own student | 404 | Break-glass |
| PDF metadata / download | Deny | Own | 404 | Break-glass |
| PDF share link create/revoke | Deny | Own | 404 | Break-glass |
| Public PDF share GET | Allow if token valid | — | — | — |
| Django Admin HTML | Deny | Deny unless staff | Deny | Allow |

“Other coach” never receives 403 with existence hints for private IDs — use **404**.

---

## 7. Rate limiting and brute-force protection

| Endpoint class | Recommendation |
|---|---|
| Login / register / refresh | Strict rate limit per IP + per email (e.g. 5–10/min) |
| Public PDF share | Per IP rate limit |
| Authenticated APIs | Standard per-user limits |
| Generate / PDF generate | Lower quota (CPU/cost) |

Lockout: progressive delay or temporary block after N failures — implement with cache/Redis in beta.

---

## 8. Sensitive student data

Students include medical-ish notes, injuries, body measurements, phone numbers.

Requirements:

- Encrypt connections (TLS)
- Restrict admin access; audit admin views Later
- No student payloads in application error trackers without scrubbing
- Backups access-controlled
- Share links expose PDF content only, not full API student records

---

## 9. Admin and future staff

| Role | MVP |
|---|---|
| Django Admin | Staff users manage Users/Coaches for support; must be audited |
| Support impersonation | **Later** — not in MVP |
| Read-only support role | Later |

Admin must not weaken API AllowAny. Prototype `AllowAny` is **removed**.

---

## 10. Audit logging

**P1 minimum:** log auth events (login success/fail, logout, refresh reuse) and privileged mutations (finalize, activate, PDF share create) with `coach_id`, `user_id`, object ids, timestamp — no secrets.

**P2:** immutable audit table for compliance-sensitive fields.

---

## 11. Enforcement checklist (implementation)

- [ ] DRF default permission **IsAuthenticated** (not AllowAny)
- [ ] Custom `CoachContext` middleware/auth that attaches `request.coach`
- [ ] No ModelViewSet with unbound queryset
- [ ] Tests: coach A cannot read coach B student/program/visit/pdf by UUID
- [ ] Tests: finalize immutability; duplicate ownership
- [ ] Tests: share link without auth; revoked token fails
- [ ] CORS allowlist configured
- [ ] Secrets from environment

---

## 12. Major decisions

### AUTH1 — JWT for SPA

See §3.

### AUTH2 — 404 for cross-tenant

See §5.2 / matrix.

### AUTH3 — Coach provisioned at register

- **Decision:** Always create CoachProfile.  
- **Rationale:** Product has no non-coach users in MVP.

### AUTH4 — Share links are capability URLs

- **Decision:** Tokenized read-only public access separate from coach auth.  
- **Rationale:** Matches FE share UX without exposing JWT.

---

## 13. Open questions

| ID | Question |
|---|---|
| AUTH-Q1 | Refresh in httpOnly cookie vs FE-managed storage for beta |
| AUTH-Q2 | Email verification required before API use? |
| AUTH-Q3 | Phone-based login later (product login screens mention phone/email) |
| AUTH-Q4 | Max concurrent refresh sessions per user |

---

## 14. Prototype gap

Current backend: `AllowAny`, hardcoded `SECRET_KEY`, no User↔Coach link.  
This design **replaces** that posture entirely before any Frontend integration with real data.

---

## 15. Related documents

`domain-model.md` · `database-schema.md` · `api-contract.md` · `frontend-integration-plan.md`
