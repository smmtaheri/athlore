# Generation unification: implementation and Stage audit

## Scope and release

Runtime changes were committed to `stage` in `1907697`, `8c44347` and
`3eec74e`. Stage was deployed with its normal isolated deployment scripts,
including `accounts.0024_unify_generation_rules`. Production application and
database containers retained their previous uptime. All three public Stage
hosts were verified against the running frontend through the CDN.

Before migration, Stage PostgreSQL and `/data/media` were backed up under
`/root/athlore-backups/stage-before-unification-20261025/`. The database archive
was checked with `pg_restore --list`. Use `database.dump` and
`media-data.tar.gz`; an initial empty `/app/media` archive is not the media
backup. No production data was copied into Stage.

## Delivered

- Five coach-rules tabs, with expandable advanced settings and optional precise
  templates, using the existing Athlore components/design system.
- Typed executable automatic-prescription controls instead of historical RX
  string injection: sets, repetition bounds, rest, RIR, focus boost, warm-up
  allowance and double-progression/maintenance instruction.
- Independent visit course focus, observed weakness, and injury exclusion.
  Weakness auto-focus is an explicit coach switch, off by default.
- Stable owner-scoped rule/template updates; changed collections only are
  PATCHed. Templates removed from a collection are archived, not recreated.
- Retired duplicate template CRUD URLs, the unused Arman compatibility module,
  old RX/set helpers, hard-coded exercise fallback banks and legacy automatic
  supplement-template selection. Empty owner catalogs cannot invent movements.
- Legacy supplement data retained, but auto eligibility disabled. Explicit
  approved catalog selection is the sole supplement generation source.
- New automatic prescriptions have consistent version-2 set projections,
  including after coach edits. Weekly primary sets and policy are recorded in
  generation evidence. Two-day automatic full-body includes the major groups;
  duplicate movements are prohibited within a session, not across all sessions.
- Session budgets reduce lower-priority volume; impossible minimum coverage is
  an explicit error. Finalization rejects a draft missing a declared muscle.
- Invalid saved template preferences removed from non-final visits/defaults;
  future unavailable selections produce explicit errors, not fallback generation.
- Reload is labelled as reload, not a destructive seed reset. General prose is
  labelled as non-executable coach notes.

No new assessment page was introduced. Manual PDF delivery remains supported.
Published prescriptions/history, archived exercises, upload files and license
metadata were not destructively rewritten.

## Real Stage lifecycle

The command `audit_stage_workout --confirm-stage` uses a labelled synthetic
athlete, the actual Stage coach catalog and the real request/publication/API
services. It overrides SMS only within that management process and guards the
SMS HTTPS connection constructor. Shared Stage still reports `SMS_BACKEND=najva`.

The first automatic full-body attempt exposed a real catalog gap: **zero active
primary-back exercises**. Its partial QA program was archived, preserving its
history. After adding finalization coverage validation, repeating this attempt
failed explicitly with missing `زیربغل`, and the QA transaction rolled back.
No invented movement, external exercise bank, or silent alternate split was used.

A separately and explicitly selected supported split was then tested using
`--available-catalog-split`: chest/triceps, legs/shoulders. This is a test
configuration, not an automatic fallback or a balanced full-body recommendation.

Successful persisted records:

| Record | ID |
| --- | --- |
| Synthetic student | `b40da9a6-dc73-4321-91a1-0818060d024d` |
| Student-created request | `f4078e7a-947e-4a42-b360-ae4d74c9b7e8` |
| Finalized visit | `411545ba-58bd-4a2f-b573-52a26a8648d9` |
| Published program | `88087f4d-b5a4-455b-a4dd-d67963010529` |
| Version | `1c15b60d-5841-4059-bd55-bf1c36d42cf4` |
| Downloaded PDF | `caca3655-5645-44f4-bde6-5aac5f2bb6de` |

The request reached `fulfilled`, generation warnings were empty, and athlete
permissions and actual PDF download bytes were verified. Both notification rows
were mock-accepted with synthetic IDs; SMS network connections: **0**. No real
OTP, visit-finalized or program-ready SMS was sent by QA.

Live student UI was then opened through the CDN in authenticated browser
contexts at 1440×900 and 390×844. Both showed the interactive training region and
one workout-download button, with zero horizontal overflow and no JavaScript
page errors. This was read-only browser inspection, not a claim that all coach
form entry on the shared host was automated. Mutating browser E2E runs on the
disposable mock-SMS stack.

Local generated artifacts (gitignored):

- `artifacts/stage-unification/qa-final.json`
- `artifacts/stage-unification/final-workout.pdf` (27,310 bytes, three A4 pages)
- `artifacts/stage-unification/desktop.png`, `mobile.png`
- `artifacts/stage-unification/pdf-page2.png`

The actual PDF was text-extracted and visually inspected. It is readable;
repetition of progression instructions makes it more verbose than necessary.

## Output and editorial quality score: 6.5/10

This score evaluates this actual weekly plan, not software uptime, not all
coaches, and not a medical/safety certification. It is not directly comparable
to the earlier 6/10 synthetic-catalog fixture because the scenarios/catalogs differ.

Configuration: intermediate male, 28 years, 180 cm, 80 kg, hypertrophy, no stated
injury, full gym, two sessions/week, 60 minutes/session, four weeks, varied
selection, no advanced method, no special focus. Ordinary working sets are
3 × 8–12, 90 seconds rest, RIR 2, with double-progression instructions.

Day 1: neutral-grip incline dumbbell press, dumbbell chest press, machine fly,
machine dip, lying barbell triceps extension. Fifteen working sets; estimate
41.2 minutes.

Day 2: Smith Bulgarian squat, close-stance upright Smith lunge, close-grip
machine shoulder press, low-foot-position leg press, unilateral machine
lateral raise, seated outward-toe leg curl. Eighteen working sets; estimate
48.5 minutes.

Weekly primary sets: chest 9, triceps 6, legs 12, shoulders 6. Within legs,
the selected movements give quadriceps 9 and hamstrings 3. Back is absent
because this explicit split/catalog does not supply it; do not call this a
complete general-purpose balanced routine.

| Dimension | Score | Reason for deduction |
| --- | --- | --- |
| Prescription coherence | 2/2 | Sets, bounds, rest and effort are explicit and internally consistent. |
| Constraints and metadata confidence | 1.5/2 | No-injury case only; existing catalog equipment/classification inconsistencies require review. |
| Weekly coverage | 0.5/2 | No back work; quadriceps-heavy leg day. Publishing coverage validation checks the chosen targets, not whole-body quality. |
| Progression/personalization | 1.25/2 | Actionable double progression, but no automatic adaptation from completed load/effort history or sport-specific periodization. |
| Volume/time precision | 1.25/2 | Budgets and primary-set totals exist; indirect volume and unilateral execution time are not precisely modelled. |

Priority improvements: populate and review the missing back catalog; correct
equipment/movement-pattern metadata; plan weekly direct/indirect muscle volume
and movement coverage before choosing variants; distinguish unilateral time;
use performance history for progression rather than guessing starting weights.
Sport-specific/corrective strategies are **not implemented** by this release.

## Test execution boundaries

- Targeted backend rules/workflow/quality/SMS suites passed during implementation.
- One broad 384-test backend run initially had three failures: one evidence
  forwarding defect (fixed), one old weakness-as-focus assertion (updated to
  observed weakness), and one supplement test exposing a finalized-but-not-active
  version (updated to render and activate before student access). The corrected
  affected suites subsequently passed 60 tests. The entire 384-test suite was
  not claimed as a clean final rerun.
- Frontend unit run: 281/282 passed; one catalog-pagination case timed out under
  concurrent load, then passed in isolation. Targeted rules/adapter/settings
  checks also passed. Typecheck, build, changed-file formatting and lint passed.
- A broad browser run passed 21 tests, skipped two, and found five obsolete
  tests tied to the retired generation wizard/old auth assumptions. Those
  scenarios were consolidated into the current visit-first lifecycle test,
  preserving PDF rename/share/revoke/regenerate and cross-coach isolation checks.
  Supplement catalog UI CRUD remains browser-tested; approved dose snapshots
  use the real generation API, not the retired wizard.
- Body-check browser lifecycle and full shared-host coach form entry are not
  represented by the successful workout lifecycle. Do not label this as full
  acceptance of every Stage screen or every possible athlete condition.

Final focused browser rerun: **12 passed** on desktop and mobile, including
current login/route guards, supplement catalog CRUD and confirmed snapshots,
request/visit preparation, publication, PDF download/rename/sharing/revocation/
regeneration, cross-coach isolation, manual PDF delivery, progress persistence
and mobile overflow. The legacy PDF wizard E2E was replaced by this lifecycle;
it was not silently marked skipped. The full preceding browser run's five
failures describe the superseded test definitions, not a clean full rerun.

After removing the shared hard-coded exercise bank, the final focused backend
run passed **66 tests** covering quality, request/visit preparation, publication,
independent focus, stable rule IDs and empty-catalog rejection. Fixture catalogs
now explicitly own every movement they expect instead of relying on fallback names.
