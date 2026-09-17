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

## Known limitations

- Critical E2E uses UI register + API helpers for student/rules/program setup, then UI for finalize/PDF/share
- Share token never stored in localStorage
- Async PDF polling UI not required while Backend is synchronous
