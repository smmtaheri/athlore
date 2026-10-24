# PDF and Browser E2E Integration (P3)

## PDF API repository

- Factory: `src/shared/api/pdfRepository.ts` → `createApiStudentPdfFilesRepository()`
- Feature switch: `studentPdfFilesRepository` uses API unless `MODE=test` or `VITE_USE_MOCK_API=true`
- Adapters: `pdfFileFromApi`, dashboard PDF counts in `dashboardFromApi`
- Downloads: `apiDownload` in `src/shared/api/client.ts` (Blob + `Content-Disposition`, refresh-aware)

## Retired localStorage key

`coach-assistant.student-pdf-files.v1` is **retired from active API mode**.

- Mock/test mode may still use it
- No silent fallback after API failure
- Legacy browser data is not auto-deleted

## UI behavior

- **Student PDF tab:** list/status/rename/regenerate/share/revoke/delete/download (ready only)
- **Program PDF settings:** save settings via draft API; Create PDF requires explicit finalization confirmation when draft
- **Unified program delivery:** one Program Version may contain separate training, nutrition, and supplement PDFs. The coach chooses Athlore generation or a private staged upload per included section; uploaded files are replaceable/removable before finalization. The student sees ready files under the same program, in training → nutrition → supplement order.
- **Legacy compatibility:** artifacts without section metadata remain listed and downloadable using their existing program type; no migration rewrites or removes their files.
- **Share:** raw URL shown/copied only at create; after refresh show active-link messaging
- **Dashboard:** real `readyPdfFiles` + capability hint when available

## Playwright

- Config: `playwright.config.ts` — Desktop 1440 + Mobile Chromium
- Stack launcher: `e2e/scripts/start-stack.mjs` — temp Backend DB + media, migrate, runserver, Vite with `VITE_API_BASE_URL`
- Spec: `e2e/p3-critical-flow.spec.ts`
- Commands:
  - `pnpm test:e2e`
  - `pnpm test:e2e:ui`
  - `pnpm test:e2e:headed`

Never touches `coach-assistant-backend/db.sqlite3`.

## Artifacts (gitignored)

- `e2e/visit-composer.spec.ts` exercises the unified visit form on desktop/mobile:
  profile-prefilled executable settings, one canonical weight/date, collapsed optional
  photos, conditional muscle details and deselection, null unassessed observations,
  exact visit linkage into program generation, historical/private-note preservation,
  duplicate-date feedback in the viewport, and horizontal-overflow checks. It uses the
  same disposable mocked-SMS stack and never sends messages on shared Stage.

- `artifacts/ui-review/p3-pdf-e2e/` — review screenshots + Persian PDF page PNGs
- `artifacts/playwright-report/` — HTML report
- Failure: screenshot / video / trace per Playwright config

## SMS safety for browser E2E

- Agent-run QA/E2E must not send real SMS unless the user explicitly authorizes
  that delivery test, including its recipients and scope. Permission for an
  earlier one-message test is not continuing permission for later QA runs.
- This rule covers all three notification types: login OTP, visit-finalized
  acknowledgement (once implemented), and program-ready notification. All must
  use the shared `common.sms.send_template_sms` transport so the isolated
  `SMS_BACKEND=mock` applies to every template, including future additions.
- Never disable SMS globally on shared Stage to make agent tests safe. Do not
  edit its `.env`, Compose runtime, or provider settings. Mock only the disposable
  test processes. Browser-only mocks do not stop server-side notifications.
  If a deployed-Stage action could send an SMS and no isolated backend is
  available, do not perform that action; report the limitation and request
  explicit delivery-test authorization. Read-only Stage checks are still allowed.
- Shared Stage intentionally uses real Najva delivery for OTP and
  program-ready notifications. Automated no-SMS E2E must run against an
  isolated disposable backend, database, and media volume—not the shared Stage
  Compose service or database.
- `pnpm test:e2e` starts a disposable SQLite database and media directory and
  forces `DB_ENGINE=sqlite`, `SMS_BACKEND=mock`, `LOGIN_OTP_PROVIDER=najva`,
  `LOGIN_OTP_MOCK_CODE=111111`, and program-ready notifications on. The OTP
  challenge lifecycle and one-time verification still run, but no SMS HTTPS
  connection can be opened. Playwright also forces its API requests to this
  local stack and never reuses an existing server. The fixed code must never be
  enabled on shared Stage or production. Password login remains a separate,
  unchanged path.
- The isolated `login-code-flow.spec.ts` enters fixed code `111111` for both
  coach and student roles. It does not configure or represent the deployed
  shared Stage backend.
- Program-ready SMS E2E checks on the isolated stack should assert the
  notification record and mock result, not handset receipt. Publishing on
  shared Stage can send a real SMS. Backend regression tests assert that the
  HTTPS connection is never constructed in mock mode.
- The transport regression test in `apps/backend/common/tests.py` checks all
  three template names without constructing an HTTPS connection. This is not
  evidence that the new visit notification trigger is already implemented.
- The detailed request → visit → program → student PDF flow and its mandatory
  stage checklist are in
  [`product-flows/program-request-to-delivery.md`](./product-flows/program-request-to-delivery.md).

## Known limitations

Structured template coverage: `e2e/structured-templates.spec.ts` creates catalog
movements and a coach recipe on the disposable mocked-SMS stack, edits a typed
template through the coach UI on desktop/mobile, saves and reopens it, and then
generates a real backend program to verify the exact fixed movements, rounds,
rest and grouping. The template editor exposes text only for names/descriptions;
day muscles, movements, execution methods, repetitions/time, RIR and rest have typed controls.
Coaches add a movement first; selecting a grouped system opens its companion
movement selectors automatically. Internal execution blocks remain unchanged in
the API and are not exposed as a separate concept in the editor.
Legacy templates remain explicitly marked until the coach converts and reviews
them. Conversion preserves old prose as non-executable description. Unknown
legacy day labels require explicit muscle selection before saving.

- Critical E2E uses UI register + API helpers for student/rules/program setup, then UI for finalize/PDF/share
- Share token never stored in localStorage
- Async PDF polling UI not required while Backend is synchronous
