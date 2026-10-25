# Program generation QA — 2026-10-25

## Scope and result

- Application baseline: Stage commit `3b33e8b`.
- Shared Stage was inspected read-only: `/root/athlore-stage` was at that commit;
  all six Stage services were running, and backend/Postgres were healthy.
- The mutating lifecycle ran on the disposable local Playwright stack, using the
  Stage application code, SQLite, temporary media and `SMS_BACKEND=mock`.
  Shared Stage and production data/configuration were not changed.
- Desktop Chromium: **1 passed**, 56.2 seconds including stack startup.
- Transport regressions: **15 passed** in `common.tests`; the mock test verifies
  all three template names without constructing an SMS HTTPS connection.
- No real SMS was sent. No deployment was performed.
- Functional lifecycle passed. Generated prescription quality needs correction
  before this output can be considered suitable for delivery without review.

The original browser spec failed at an obsolete inline set-checkbox selector.
The test now uses the current set editor, week tabs and timer controls. This was
a test maintenance change; application behavior was not changed during this QA.

## Scenario

Synthetic athlete: male, 28 years, 180 cm, 80 kg, intermediate, hypertrophy,
explicitly no injury, full gym, two weekly sessions, 60-minute session budget.
Four-week course: 2026-10-23 through 2026-11-19. Coach-selected split:
chest/back, then legs/shoulders. Exercise variety: `varied`; no advanced system
selected; quick generation without an explicit program template.

The test creates a synthetic coach and a small 12-movement catalog through the
real API. Catalog equipment was corrected to match dumbbell/cable/machine names.
There is no coach-specific level rule, producing `missing_level_rule`. Catalog
movement patterns and secondary targets are not populated in this fixture.
These fixture limits constrain the quality assessment and are not evidence that
Arman's shared-Stage catalog has the same gaps.

## Executed lifecycle

1. Create coach/student fixtures through authenticated API; provision the
   athlete password and complete first-login setup.
2. Create a visit and athlete program request; link the request to the visit;
   finalize the visit with the visit-finalized notification enabled in mock mode.
3. Coach signs in through the browser, creates a draft from that exact visit,
   reviews it and publishes through the UI. The linked request becomes fulfilled.
4. Athlete signs in through a separate browser context and sees the active
   structured workout. Record one set with 10 reps and 25 kg, reload, and verify
   persistence. Verify week two is separate and returning to week one preserves
   the record.
5. Start/close the 90-second timer and download the workout PDF. Validate the
   PDF signature; inspect both rendered pages and extracted text. The file has
   two A4 pages, 24,328 bytes, and legible Persian tables.
6. Upload the same PDF as a separate manual program, finalize/activate it and
   verify the athlete gets a download without an interactive workout.

Setup is API-assisted, not a fully UI-only registration/student/visit test.
The notification rows were not separately inspected in the browser run; the
mock transport is enforced by the isolated launcher and tested separately.

Synthetic identifiers:

| Entity | ID |
|---|---|
| Student | `d665fca0-32c9-463c-91bb-44b9602255f3` |
| Visit | `1b703732-9699-405a-8020-dfe7d4c7f626` |
| Generated program | `346a771c-be8c-4cfd-a11e-3f7e4f7919f7` |
| Generation run | `43e4084c-2067-41ea-ae64-14a68cba36ef` |
| Downloaded PDF | `b3512e8e-4680-4e5b-b4e4-f8ca5277d530` |

Artifacts are gitignored under `apps/front/test-results/visit-workout-delivery-vis-e913b-rsists-athlete-set-progress-desktop-chromium/`:
`generated-program-audit.json`, `generated-workout.pdf`, and rendered page images.
The athlete screenshot is `apps/front/artifacts/ui-review/workout-player-desktop-chromium.png`.
These local synthetic IDs do not identify records on shared Stage.

## Actual generated workout

The test-only numeric suffix on movement names is omitted here.

| Session | Movement | Sets | Reps as emitted | Rest |
|---|---|---:|---|---:|
| Chest/back | Cable row | 3 | 8 | 90 s |
| Chest/back | Incline dumbbell press | 3 | 10 | 90 s |
| Chest/back | Machine chest press | 3 | 10 | 90 s |
| Chest/back | Lat pulldown | 3 | `15-10-8-15` | 75 s |
| Chest/back | Machine chest fly | 3 | `12-10` | 75 s |
| Legs/shoulders | Machine squat | 3 | 10 | 90 s |
| Legs/shoulders | Machine shoulder press | 3 | 8 | 90 s |
| Legs/shoulders | Leg extension | 3 | `12+12` | 75 s |
| Legs/shoulders | Dumbbell lateral raise | 3 | `12-10` | 75 s |
| Legs/shoulders | Leg curl | 3 | 15 | 75 s |

Each session has 15 prescribed working sets. Primary-target weekly totals are
chest 9, back 6, quadriceps 6, shoulders 6 and hamstrings 3. These are direct
primary-target counts, not estimates of all indirect training stimulus.

## Quality score: 6/10

This is an editorial assessment of this particular synthetic output, not a
validated prediction of muscle growth or an assessment of all athlete cases.

| Criterion | Score | Evidence |
|---|---:|---|
| Safety/constraint consistency in this no-injury case | 2/2 | Requested level/gym setting and session count were retained. Injury handling was not exercised. |
| Session/muscle coverage | 1.5/2 | Requested muscles appear, but the output provides no adequacy review of the low hamstring/direct back allocation. Catalog/split inputs contribute to this limitation. |
| Sets/reps/rest coherence | 0.5/2 | Pulldown has three sets but four repetition entries; `12+12` has no explicit execution/load/rest definition. |
| Exercise selection/order/system clarity | 1.5/2 | Movements are identifiable and no fake video is supplied; legacy compound/extended rep strings appear despite no selected advanced method. |
| Personalization/progression clarity | 0.5/2 | All exercises have generic “medium” intensity; the four-week schedule repeats the prescription without an actionable load/repetition progression rule. |

The two-session split itself was explicitly requested and is not treated as a
defect. Likewise, a complex system or constant weekly exercise changes are not
requirements for a good hypertrophy plan. The 2026 ACSM position stand supports
progressive resistance training and individualization; weekly volume has a
stronger basis than requiring a particular advanced set system. Its volume
recommendations are a review benchmark, not a hard minimum proving that this
sample cannot work: [ACSM position stand](https://pubmed.ncbi.nlm.nih.gov/41843416/).

## Cause and proposed order of work

1. **Canonical per-set prescriptions first.** In
   `programming/services/training_selection.py::_prescribe`, the style entry's
   repetition string is selected while its associated historical set count is
   discarded (`reps_template, _hist_sets`). The volume engine can emit three
   sets beside a four-set sequence. `style_calibration.py::DEFAULT_RX_BY_CLASS`
   also contains `12+12`. Preserve range, per-set sequence, drop/rest-pause and
   simple repetitions as distinct typed structures; validate sequence length
   against sets and require an executable recipe for extended-set notation.
   Student UI, PDF, set logger and generator should consume the same structure.
2. **Actionable effort and progression.** Emit a clear baseline effort target
   and a coach-approved progression rule for quick generation. State when to
   increase reps/load, maintain them, or reduce effort; use available performance
   history without inventing a starting load when no baseline exists. Existing
   recipe/template controls do not supply this in the sampled quick output.
3. **Weekly coverage and data-quality checks.** Evaluate weekly direct/indirect
   muscle allocation and session time before publication, with an explicit
   warning where the coach's split or catalog cannot meet the intended coverage.
   Populate canonical movement patterns and secondary targets; keep this
   separate from inferring execution class from the exercise name. Surface
   missing coach rules as a review item rather than interpreting a green
   lifecycle test as complete program quality.

No generator, PDF or application fix was implemented in this task. Only testing
and documentation changed.

## Not run in this sample

Mobile execution, athlete visit-form submission, body-check lifecycle,
UI-only student creation, injury/equipment-restricted cases, weakness comparisons
and advanced system combinations were not exercised in this run. They remain
required scenarios in the [Stage acceptance checklist](../product-flows/stage-acceptance-test-plan.md).
