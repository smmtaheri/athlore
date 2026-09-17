# Athlore Frontend — Agent Instructions

This repository is the React SPA for Athlore (coach-facing UI).

## Stack

- **Language:** TypeScript
- **UI:** React 19 + React Router 8
- **Build:** Vite 6+
- **Package manager:** **pnpm** + `pnpm-lock.yaml` (Corepack)
- **Lint:** ESLint (`pnpm lint`, max-warnings 0)
- **Format:** Prettier (`pnpm format:check`)
- **Types:** `pnpm typecheck` (`tsc -b`)
- **Unit tests:** Vitest + Testing Library (`pnpm test`)
- **E2E:** Playwright (`pnpm test:e2e`)
- **Fonts/icons:** Vazirmatn, lucide-react

### Layout (high level)

- `src/features/` — feature modules (programs, students, coach-rules, dashboard, …)
- `src/shared/` — API client, adapters, UI primitives
- `src/app/` — routing/shell/config
- `e2e/` — Playwright flows
- `docs/` — integration and QA notes
- `docs/product-flows/` — **canonical Persian product flows** (Visit, Body Check, …); read before changing those UX paths; do not duplicate elsewhere

API base is configured via env (see `.env.example`). Prefer adapters in `src/shared/adapters/` when mapping API DTOs ↔ UI types.

---

## Operating rules (mandatory)

### Analyze vs change

- **Analyze / explain / review:** read-only. No edits, commits, or mutating git/fs unless the user asks to apply changes.
- **Implement / fix / add:** smallest change that meets the request.
- Do **not** change code until explicitly asked.

### Scope

- Stay in scope. No unrelated refactors or drive-by UI redesigns.
- No extra fallback/alternate flows unless explicitly requested.
- Happy path must be obvious; errors must surface to the user (toast/feedback). Do not silently ignore failed API calls.

### Code quality

- Simple, readable React/TS. Follow existing feature patterns.
- Avoid over-engineering (no new state libraries, abstractions, or design-system rewrites unless asked).
- Prefer existing UI components under `src/components` / feature modules.
- For visual work: follow product design docs/images when the task is UI; do not invent a new brand system casually.

### Language

- **Agent docs, engineering docs, code comments, and commit messages: English only.**
- Do not add Persian comments or Persian engineering docs.
- **User-visible UI copy may remain Persian** (product language). Only change Persian UI strings when the task is about that copy.

### Docs and comments

- Read relevant `docs/` and nearby tests before changing flows (programs, PDF, students).
- **Product behavior flows (Persian):** [`docs/product-flows/`](docs/product-flows/) is the canonical coach/team reference for Visit and Body Check. Prefer it over inventing UX steps. These are product docs, not English engineering docs.
- Update comments/docs only when the change makes them inaccurate. No cosmetic doc churn.

### Git

- After every meaningful change set, **commit** when the user asks (or after an implement task they requested).
- **Commit message format:** [Conventional Commits](https://www.conventionalcommits.org/) in English.
  - Examples: `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `test: …`, `chore: …`
  - Optional scope: `feat(students): …`, `fix(programs): …`
  - Subject: imperative, concise; focus on **why** when useful.
- Keep commits scoped to the frontend when the task only affects the frontend.
- No force-push to main, no secrets, no git config changes.
- **Never `git push` (or otherwise publish commits) unless the user explicitly asks.**
- **Never deploy to any environment** (including `deploy-athlore`, server Compose, or production scripts) unless the user explicitly asks.

### QA (default)

Unless the user explicitly says to skip / go fast:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test -- --run
# When UI/build pipeline or shared config changed:
pnpm build
# When touching critical coach flows and e2e is in scope:
pnpm test:e2e
```

### PDF / programs notes

- Real PDF download is via student **PDF files** after finalize + create PDF — not the stub “Download” on the programs list (unless that stub was wired in a later change; verify current code).
- PDF section toggles (`includeTraining` / `includeNutrition` / `includeSupplements`) must persist on the version used for render (including finalized versions when that API allows pdf_settings-only updates).
