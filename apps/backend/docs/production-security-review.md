# Production Security Review — Coach Assistant Backend

**Date:** 2026-08-06  
**Scope:** Authentication, authorization, PDF/WeasyPrint, share links, Django production settings, containers/Nginx (deploy), dependency posture.

Status values: `fixed` | `accepted` | `deferred` | `not applicable`

---

## Findings

### SEC-001 — Refresh token in `localStorage` (XSS-exfiltrable)
| | |
|---|---|
| **Severity** | High |
| **Evidence** | Frontend historically stored `refreshToken` in `coach-assistant.auth.session.v2` |
| **Affected** | `frontend/src/shared/api/session.ts`, Backend auth views |
| **Remediation** | HttpOnly `Secure` `SameSite=Lax` cookie `coach_assistant_refresh` on `/api/v1/auth/`; FE keeps access token in `sessionStorage` / memory only |
| **Verification** | Login sets cookie; refresh/logout read cookie; FE tests assert refresh not in localStorage |
| **Status** | **fixed** |

### SEC-002 — WeasyPrint external URL / file SSRF
| | |
|---|---|
| **Severity** | High |
| **Evidence** | `HTML(..., base_url="/")` allowed broad file URL resolution |
| **Affected** | `delivery/services/render.py`, `export_pdfs.py` |
| **Remediation** | `LocalFontUrlFetcher` denies http/https/data and non-allowlisted files; only local font paths |
| **Verification** | Unit/smoke PDF generation; fetcher raises on `https://` |
| **Status** | **fixed** |

### SEC-003 — Public registration
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | Registration endpoint existed |
| **Remediation** | `PUBLIC_REGISTRATION_ENABLED=false` by default; Compose sets false |
| **Status** | **fixed** (prior milestone) |

### SEC-004 — DEBUG / SECRET_KEY / ALLOWED_HOSTS in production
| | |
|---|---|
| **Severity** | High if misconfigured |
| **Evidence** | Env-driven settings |
| **Remediation** | Compose defaults `DJANGO_DEBUG=false`; require `DJANGO_SECRET_KEY`; strict `DJANGO_ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` |
| **Verification** | `manage.py check --deploy` under production env |
| **Status** | **fixed** (config + docs); operator must supply strong secret |

### SEC-005 — PDF share token storage
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | Hash-only storage, revoke, expiry in delivery share service |
| **Remediation** | Keep hash-only; Cache-Control no-store on downloads; Nginx rate-limit share endpoints |
| **Status** | **fixed** / reinforced in Nginx |

### SEC-006 — Brute-force login
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | No app-level lockout |
| **Remediation** | Nginx rate limit on `/api/v1/auth/login/` and refresh |
| **Status** | **fixed** at edge; app-level lockout **deferred** |

### SEC-007 — Django Admin exposure
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | `/admin/` proxied by Nginx |
| **Remediation** | Prefer management commands; document that `/admin/` should be blocked or IP-restricted in hardened deployments |
| **Status** | **accepted** with documentation; default Compose still proxies `/admin/` for break-glass |

### SEC-008 — Inactive coach login
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | `deactivate_coach` sets `user.is_active=False` |
| **Remediation** | JWT auth rejects inactive users |
| **Status** | **fixed** (Django default + prior commands) |

### SEC-009 — Cross-tenant IDOR
| | |
|---|---|
| **Severity** | Critical if broken |
| **Evidence** | Ownership filters on students/programs/PDFs; Coach B gets 404 |
| **Verification** | Existing ownership tests + generation/PDF tests |
| **Status** | **fixed** (regression-tested) |

### SEC-010 — CSRF with cookie refresh
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | Cookie auth on refresh/logout |
| **Remediation** | SameSite=Lax; SPA same-origin via Nginx; CSRF trusted origins for HTTPS domain; Bearer access token still primary for API mutations |
| **Status** | **accepted** (SameSite + same-origin); full double-submit CSRF for cookie-only APIs **deferred** if moving fully cookie-based |

### SEC-011 — Container hardening
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | Deploy Compose: no-new-privileges, read_only where practical, internal network, pinned tags |
| **Status** | **fixed** in deploy repo |

### SEC-012 — Dependency vulnerabilities
| | |
|---|---|
| **Severity** | Variable |
| **Remediation** | `pip-audit` via Python 3.12 container against locked production deps; `pnpm audit --prod` |
| **Verification** | Django upgraded to **5.2.17**; WeasyPrint upgraded to **68.1** (SSRF redirect fix). Remaining: `PYSEC-2026-3412` / CVE-2026-49452 (CSS injection via `presentational_hints=True`) — **accepted/mitigated** because Coach Assistant never enables `presentational_hints` and HTML is escaped coach-owned content with a deny-all external URL fetcher. |
| **Status** | **fixed** (Django + WeasyPrint SSRF) / **accepted** (presentational_hints CVE with mitigation) |

### SEC-013 — Logging of secrets / health data
| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | Access logs may include paths with UUIDs; tokens not intentionally logged |
| **Status** | **accepted** with operator guidance: do not enable DEBUG request body logging in production |

### SEC-014 — HSTS
| | |
|---|---|
| **Severity** | Low until HTTPS live |
| **Remediation** | Enable `DJANGO_SECURE_HSTS_SECONDS` and Nginx HSTS only after TLS validated |
| **Status** | **deferred** until real certificate on operator domain |

---

## Django `check --deploy`

Run with production-like env (`DEBUG=false`, strong `SECRET_KEY`, HTTPS origins). Resolve applicable warnings; the direct Nginx TLS edge and Django `SECURE_PROXY_SSL_HEADER` are the production enforcement path.

---

## Residual risks (honest)

1. No application-layer account lockout beyond Nginx rate limits.
2. Admin UI still reachable unless operator removes the Nginx `/admin/` location.
3. Real Let’s Encrypt issuance requires operator DNS — not validated in CI/local without a public domain.
4. Access token remains in `sessionStorage` (XSS window smaller than localStorage refresh, but not zero).
