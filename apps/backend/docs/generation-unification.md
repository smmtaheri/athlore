# Unified generation and legacy retirement

The primary flow remains request → visit → generated draft or manual PDF →
review → publish. There is no separate final-assessment page.

## Authoritative inputs

- Visit assessment overrides request/profile facts; explicit empty selections
  are answers, not missing values.
- The visit's `program_settings.muscle_decisions` is the coach's final
  per-muscle decision (`balanced`, `focus`, or `maintenance`). It determines
  volume targets and, for automatic splits, session frequency. Weak/strong
  findings remain assessment evidence and never change selection or volume by
  themselves. The athlete's requested goal remains separate from the coach's
  final goal recorded in the visit. Confirmed injury restrictions still filter
  unsafe movements; a muscle focus cannot override them.
- The coach rules aggregate exposes validated `generation_rules`, persisted in
  the existing owner-scoped `style_profile` JSON, not a parallel model.
- Automatic prescriptions use numeric sets, repetition bounds, rest, RIR,
  warm-up allowance and progression policy. Historical string prescriptions no
  longer inject pyramid/partial/drop prescriptions into ordinary training.
- Explicit training systems and precise templates retain their structured
  execution semantics. Published versions are never rewritten by this change.

The generation snapshot includes the aggregate digest; changing the policy
invalidates regeneration from an older context. New automatic prescriptions
have version 2 and a per-set projection consistent with the editable fields.
The projection is refreshed after a coach changes sets/reps/rest.

## Coach UI and identity

Five tabs: generation rules, exercise catalog, training systems, nutrition and
supplements, visit forms. Optional precise templates and safety/level/muscle
settings are expandable sections inside generation rules. General prose is
labelled non-executable notes. Reload does not claim to reset server data.

Independent catalog tabs do not request the rules aggregate. The editor uses
`GET/PATCH /coach-rules/?scope=editor`, excluding exercise, taxonomy and system
catalogs from those responses. Exercise, training-system and visit-form lists
request 20 records at a time and append on scroll (with an accessible load-more
button). Search is debounced and performed by the server, not restricted to
loaded rows. Query changes abort pending requests and replace the result set.
The exercise list normalizes Persian/Arabic letter variants and spacing for
names, aliases and target muscle/region labels. Training-system shared editing
lives only in its dedicated tab, not a second editor below the exercise list.

The frontend PATCHes only changed rule collections. The backend locks the
aggregate, updates rows by owner-scoped ID and preserves IDs. New local rows
have temporary non-UUID IDs; unknown UUIDs are errors. Omitted templates are
archived, not physically deleted. Existing natural keys are reused when a
client creates the same named row without an ID.

## Retirement and migration

Migration `accounts.0024_unify_generation_rules` removes unused RX/set-style
configuration, removes unavailable template preferences from non-final visits
and coach defaults, and disables automatic eligibility of legacy supplement
templates. Their content and prior program snapshots remain intact.

Supplements now use only explicit catalog selections. An old opt-in without a
catalog selection returns an explicit selection-required warning and no
invented dose. The old template editor and automatic template fallback are
removed from the primary flow. Legacy rows remain for audit, not generation.

Legacy `focus_muscles` visit/default values migrate to explicit `focus`
decisions. The obsolete `weakness_auto_focus` switch is removed. Exact
execution-plan templates remain authoritative for their programmed sessions;
non-balanced visit decisions require the quick/automatic generation flow so
they cannot be silently ignored.

`/program-templates/` is the sole item CRUD endpoint. Duplicate nested template
routes and the unused Arman compatibility module are removed. Migration files,
archived exercises referenced by history, uploaded media and license metadata
are not deleted merely because they are old.

## QA and deployment

Back up Stage PostgreSQL/media before deployment. Apply migrations with the
normal Stage backend entrypoint; never point Stage commands at production.

Browser acceptance uses the disposable Playwright stack, all SMS mocked, on
desktop and mobile. For a persisted Stage lifecycle audit:

```sh
docker exec athlore-stage-backend-1 python manage.py audit_stage_workout \
  --confirm-stage --coach-id <stage-coach-uuid>
```

This command creates clearly labelled synthetic QA records in Stage, uses the
coach's actual catalog, publishes real PDFs, checks student permissions and
download bytes, and reports the resulting IDs. It mocks SMS in that management
process only and prevents SMS HTTPS connections. Shared Gunicorn SMS settings
are unchanged. The synthetic athlete has no usable login password; the coach
can inspect the resulting records. This is a service/API audit, not a claim
that the live browser was exercised.

## Remaining quality boundaries

Time is an estimate, not a physiological measurement. Working-set budgets
reduce accessories while retaining selected muscle coverage; infeasible
coverage returns an explicit error. Weekly primary sets are reported, not
fractional indirect volume. Double progression is an actionable instruction,
not an automatic guessed starting load or a sport-specific periodization plan.
Sport/corrective programs and medical judgments are not introduced by this
change. Do not advertise those as implemented or give all generated programs
a blanket safety guarantee.

Finalization rejects a draft whose declared session muscles are not covered by
its actual exercises. A warning-only partial draft cannot be published as a
complete program. The current catalog includes back-accessory movements;
coverage must be measured from eligible structured metadata rather than inferred
from an earlier catalog audit. QA can
explicitly select `--available-catalog-split` (chest/triceps, quadriceps/shoulders) to
exercise publication with supported catalog muscles. This is a named test
configuration, never an automatic fallback or a balanced full-body claim.

Hard-coded exercise fallback banks have also been removed from the shared
selector, not merely disabled by visit preparation. Low-level generation APIs
cannot inject a named movement absent from the owning coach's catalog.

## Weekly planning contract v3

- Resolve required muscles from the approved split before querying candidates.
  A broad leg session includes quadriceps, hamstrings, glutes and calves;
  automatic three-day full-body sessions also include core. Missing candidates
  remain visible as zero direct sets, not a removed requirement.
- Distinguish minimum, preferred target and caps. Maintenance is not a growth
  failure. A focus target is bounded by the coach's scheduled session capacity;
  the original preferred target is retained. Repair weekly deficits within
  existing eligible movements and actual session time, minimums before extras.
- Selection balances derived movement roles across the week before preference,
  historical frequency and seeded variety. Front deltoid is not lateral deltoid;
  knee flexion is not a hip hinge. Strength sessions select a main movement
  anchor where the catalog supports one and use separate validated main and
  accessory prescriptions. Time-based movements remain time-based.
- Precise Persian split labels preserve hamstrings, quadriceps and glutes;
  matching the word for leg inside a longer label must not expand its scope.
- Training systems are applied before volume allocation, with explicit recipe
  set counts preserved. `executionPlan` describes paired rounds, solo remainder
  sets and rest per set. The same quantities drive duration, student timers and
  PDF instructions. An explicitly selected system with no eligible application
  blocks publication, rather than claiming it ran.
- Edits and regeneration refresh the saved volume/execution contract; incomplete
  drafts remain editable. Finalization also requires minimum weekly coverage,
  eligible IDs and complete groups. Published snapshots and the manual PDF flow
  are not migrated to new generation semantics.
- Migrations `accounts.0027` and `students.0023` make reviewed exact-name catalog
  corrections and add equipment/strength options without replacing exercise IDs,
  media, student data or historical visits. They must be applied during deploy,
  not by QA. Custom movement dependencies still require coach-reviewed tagging.
  Two reviewed dumbbell-only starting movements (floor press and Romanian
  deadlift) are added to existing active coach catalogs if their names are absent.
  Existing definitions and their coach-authored level restrictions are preserved.

Run the frozen six-scenario matrix (60 seeds plus six request-to-student PDF
lifecycles) on a disposable database:

```bash
DJANGO_DB_NAME=/tmp/athlore-planning-qa.sqlite3 SMS_BACKEND=mock \
  uv run python manage.py test programming.tests.test_planning_contract
```

The sanitized fixture contains the 230 active Stage catalog definitions captured
on 2026-10-28, without owner IDs, athlete data or media URLs. These acceptance
checks are engineering gates, not a claim of clinical safety or a guaranteed
10/10 professional program. Score goal/coach intent (2), hard constraints (2),
weekly coverage (3), executable systems/progression (2), delivery (1); any hard
restriction violation blocks acceptance regardless of the total. Keep this
rubric fixed when comparing versions; do not award points simply for fewer
warnings or for filling the entire available 75 minutes.

### Verification record, 2026-10-28

- Frozen matrix: 60 generation seeds and six complete service/API publication
  lifecycles, downloaded real PDF bytes, zero SMS transport calls. The final
  planning/workout/generator regression run passed 62 tests; the earlier
  volume/template/workout/policy/PDF regression run passed 91 tests.
- Disposable Playwright publication, athlete progress, PDF download and manual
  PDF lifecycle passed on both desktop Chromium and mobile Chromium. Screenshots
  retained the shared blue/white design and showed no horizontal overflow.
- Frontend related tests: 36 passed; typecheck and production build passed.
  The full frontend run passed 299/300 tests with one StudentFormPage timeout;
  all seven tests in that file passed on an isolated rerun.
- Full backend checking is not green: five existing failures were reproduced
  against the unmodified parent commit in a disposable archive. These are the
  empty-catalog P1 deterministic/finalize fixtures, dashboard publication fixture,
  legacy chest-catalog import vocabulary, and partial-reps request fixture.
  They must not be reported as new regressions or as passing acceptance.
- Touched backend files pass Ruff. Whole-repository Ruff still reports the
  pre-existing broad logout exception in `students/views.py` and unrelated
  formatting drift. Frontend whole-repository lint retains six existing errors
  in InteractiveWorkout; the same errors were reproduced from the parent source.
- Known catalog limitation: beginner/home dumbbell rear-deltoid isolation remains
  unavailable under the frozen coach-authored level restrictions. Generation
  reports `movement_coverage_missing:shoulders:rear_delt`; it does not silently
  reclassify intermediate movements. This still warrants a quality deduction.
- No shared Stage/production migrations, deployment, restart or SMS changes were
  performed. Local test migrations are not a live deployment verification.
