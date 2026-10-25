# Unified generation and legacy retirement

The primary flow remains request → visit → generated draft or manual PDF →
review → publish. There is no separate final-assessment page.

## Authoritative inputs

- Visit assessment overrides request/profile facts; explicit empty selections
  are answers, not missing values.
- `program_settings.focus_muscles` is the coach's course decision. Observed
  weakness is separate. `generation_rules.weakness_auto_focus` is an explicit
  coach policy, off by default. Injury exclusion always precedes focus.
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
complete program. The Stage catalog currently has no active primary-back rows;
automatic full-body generation therefore requires catalog completion. QA can
explicitly select `--available-catalog-split` (chest/triceps, legs/shoulders) to
exercise publication with supported catalog muscles. This is a named test
configuration, never an automatic fallback or a balanced full-body claim.
