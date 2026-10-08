# Coach supplement catalog and prescription snapshots

Migration `accounts.0010` adds `SupplementGoal`, `SupplementCatalogEntry`, and
`SupplementDose`. Existing reference templates and their rows are not converted
or deleted. No production migration is applied by this change.

All API paths below are under `/api/v1/` and require an active authenticated
coach. Owner IDs supplied by clients are never used. Foreign detail IDs, goal
assignments and prescription student/entry IDs return 404.

| Endpoint | Methods / purpose |
| --- | --- |
| `supplement-catalog/` | GET paginated list (limit <= 100; search, goal UUID, active=true); POST create |
| `supplement-catalog/<uuid>/` | GET; PUT full validated definition; DELETE archive |
| `supplement-catalog/options/` | GET coach goals and stable unit/timing/day codes |
| `supplement-catalog/goals/` | POST goal |
| `supplement-catalog/goals/<uuid>/` | PATCH name; DELETE unused goal |
| `supplement-catalog/propose/` | POST non-persisting priority-ranked proposals |
| `supplement-catalog/prescribe/` | POST validated non-persisting prescription snapshot |

Definition fields: name, name_en, aliases[], category, goal_ids[], reason,
instructions, warnings, replacement_group, priority, is_active, reviewed,
auto_eligible, doses[]. Each dose has positive decimal amount, unit, timing,
custom_time (required for timing=custom), and days. Unit and timing options are
returned by options. No conversion between scoops, servings and grams is made.
Auto-eligibility requires coach review. PUT is atomic and replaces dose rows.
The server scopes goal assignments, prefetches all catalog relations, and does
not generate per-entry queries when listing or proposing.

Proposal body: `{student_id, goal_ids: [UUID], count: 1..10}`. Candidates must
belong to the coach, be active/unarchived, reviewed, auto-eligible, and match
at least one requested goal. Higher priority wins, with name/ID tie-breaks.
Only one candidate per nonempty replacement_group is offered. The response
contains items, explanation and exclusion reasons. Known supplement
restrictions or medical notes block proposals; unknown medical suitability
is never inferred. This is ranking, not medical diagnosis or interaction checking.

Prescription body: `{student_id, selection}`. Generator input instead supplies
`supplement_selection: selection`, with:

```json
{
  "items": [{"entry_id": "UUID", "doses": [{"amount": "1", "unit": "gram", "timing": "morning", "days": "all"}], "reason": "Coach-authored reason"}],
  "mode": "manual",
  "goal_ids": [],
  "confirmed": true,
  "safety_reviewed": true
}
```

Both confirmation flags are required for nonempty selections. Doses/reason can
override the definition for this prescription only. Missing overrides use
catalog defaults. Suggested selections additionally revalidate eligibility,
goal matching and replacement groups at generation time. Snapshot rows retain
entry ID, source, category, structured dose, formatted display strings, reason,
instructions and warnings. No live catalog lookup is needed to view old programs.
GenerationRun evidence records owner/source, definition revision, priority,
selection mode, goals, reason and actual doses. Empty explicit selection disables
supplements. Without this new input, the legacy opt-in template path is unchanged.

Draft editing from the bank uses prescribe, then the existing program-save
endpoint. Finalized versions remain immutable. Student display and PDF consume
the snapshot, including warnings. The generator is not aware of brand ingredients,
drug interactions, or medically established dose limits: those remain a human
review responsibility; never present a proposal as a medically safe prescription.

Product flow: `apps/front/docs/product-flows/supplement-catalog.md`.

Local verification:

```bash
cd /home/nobitex/Desktop/Tasks/Nobitex/athlore/apps/backend
DJANGO_DB_NAME=/tmp/athlore-supplements-test.sqlite3 .venv/bin/python manage.py test accounts.tests.test_supplement_catalog programming.tests.test_generation_priority delivery.tests.test_pdf_artifacts
cd /home/nobitex/Desktop/Tasks/Nobitex/athlore/apps/front
pnpm test -- --run src/features/coach-rules/components/SupplementCatalogSection.test.tsx
pnpm test:e2e e2e/supplement-catalog.spec.ts
```

E2E starts only a disposable local DB/media and local dev servers, not production.
