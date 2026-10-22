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

- `artifacts/ui-review/p3-pdf-e2e/` — review screenshots + Persian PDF page PNGs
- `artifacts/playwright-report/` — HTML report
- Failure: screenshot / video / trace per Playwright config

## Stage SMS safety for browser E2E

- The stage Compose stack forces the backend SMS adapter to `mock`; OTP and
  program-ready notification flows must never contact Najva or deliver a real
  message. Do not use a real handset delivery as an E2E assertion.
- For stage OTP browser checks, request a code and enter the fixed test code
  `111111`. The backend still exercises the challenge lifecycle and one-time
  verification. Password login remains a separate, unchanged path.
- The isolated local `login-code-flow.spec.ts` harness still uses its own
  static test code (`1111`); it does not configure or represent the deployed
  stage backend.
- Program-ready SMS E2E checks should assert the notification record and the
  mock adapter result, not handset receipt. Backend regression tests must also
  assert that the SMS HTTPS connection is never constructed in mock mode.
- The detailed request → visit → program → student PDF flow and its mandatory
  stage checklist are in
  [`product-flows/program-request-to-delivery.md`](./product-flows/program-request-to-delivery.md).

## Known limitations

- Critical E2E uses UI register + API helpers for student/rules/program setup, then UI for finalize/PDF/share
- Share token never stored in localStorage
- Async PDF polling UI not required while Backend is synchronous
