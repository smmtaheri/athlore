# Generation unification: implementation and Stage audit

## Scope and release

Runtime changes were committed to `stage` in `1907697`, `8c44347`,
`3eec74e` and final runtime revision `c598320`. Stage was deployed with its normal isolated deployment scripts,
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
| Synthetic student | `0ce80690-34ba-4808-ad02-905ab625e6d3` |
| Student-created request | `d1553065-27e7-479f-bde7-42c332fea031` |
| Finalized visit | `825c6e5f-0845-4f53-9ad7-6f4e684bc751` |
| Published program | `21e9943e-e8b6-4072-a91e-748165fe45fe` |
| Version | `f3475cdf-e7ec-484d-9389-187440a668a2` |
| Downloaded PDF | `81c11db5-5bcf-4b8e-b16d-fb255275b730` |

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

- `artifacts/stage-unification/qa-c598320.json`
- `artifacts/stage-unification/workout-c598320.pdf` (27,313 bytes, three A4 pages)
- `artifacts/stage-unification/desktop.png`, `mobile.png`
- `artifacts/stage-unification/pdf-c598320-page2.png`

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

Day 1: neutral-grip incline dumbbell press, barbell chest press, dumbbell fly,
rope pushdown, bent-over overhead rope triceps extension. Fifteen working sets; estimate
41.2 minutes.

Day 2: Smith Bulgarian squat, bottom-half goblet squat, seated neutral-grip
dumbbell shoulder press, narrow-stance seated leg press, neutral-grip dumbbell
lateral raise, lying machine leg curl. Eighteen working sets; estimate
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
  affected suites subsequently passed 60 tests.
- Final broad backend run: **384/385 passed**. Its sole failure was the old
  partial-repetition fixture relying on the removed invented exercise bank.
  The fixture now explicitly creates owner-scoped catalog movements; the
  affected test passed on rerun. The complete suite was not rerun after that
  last fixture-only edit, so this is not reported as a clean 385/385 run.
  Dashboard and generation API fixtures were likewise updated to own their
  movements rather than depend on fallback names. The broad run uses a fast
  password hasher only in its disposable local process; live settings were
  not changed. Changed-test Ruff checks/formatting passed.
- Final frontend unit rerun: **282/282 passed across 50 files**, with two workers.
  An earlier parallel run had one catalog-pagination timeout under concurrent
  load. Typecheck, build, changed-file formatting and lint also passed.
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

The full request-to-download service audit and read-only mobile/desktop browser
inspection were repeated after `c598320` was deployed, with the records listed
above. The expanded browser lifecycle test also passed again on both viewports
against final source. Synthetic QA portals/accounts were disabled after the
checks so the test phone numbers cannot request real OTP messages later. Their
records and published PDFs remain available to the owning coach; normal Stage
accounts and the real SMS transport remain enabled.
