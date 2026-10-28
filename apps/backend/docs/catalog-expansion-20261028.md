# Stage catalog reference pack (October 2026)

`accounts/catalog_expansion.py` is an additive, coach-owned reference pack across
all 12 supported canonical muscle groups. It expands home/bodyweight, dumbbell,
band and gym choices, especially back, glutes, core, calves and forearms. It does
not claim to include every possible exercise or add unsupported muscle keys.

Each definition has canonical primary/secondary targets, a region, actual
equipment dependencies, suitable levels, movement pattern, mechanics, joints,
prescription unit and original textual execution guidance. Media is deliberately
empty: upload the correct coach-owned video through the existing exercise editor.
Equipment requirements are cumulative, not alternatives. A bench and a pull-up
bar must not be inferred from an athlete merely selecting dumbbells.

Reference material: [ACE exercise library](https://www.acefitness.org/resources/everyone/exercise-library/),
[ACE programming variables](https://www.acefitness.org/continuing-education/certified/may-2024/8632/the-ace-workout-builder-for-split-routines/),
and [NSCA Foundations of Fitness Programming](https://www.nsca.com/contentassets/8323553f698a466a98220b21d9eb9a65/foundationsoffitnessprogramming_201508.pdf).
These inform starter definitions, not universal prescriptions or injury clearance.

## Five editable starter systems

- `straight_sets`: the generator's set count is preserved; 8–12 reps, 90-second
  rests and RIR 2 are editable defaults.
- `strength_5x5`: five sets of five on the first eligible rep-based compound
  movement in each scoped session, not on every exercise or a timed carry.
- `circuit_training`: one group of three eligible different-primary-muscle
  exercises; 20 seconds between movements and 120 seconds after the group.
- `eccentric_emphasis`: the last eligible isolation uses an 8–10-rep range and
  four-second eccentric/one-second concentric tempo, without assisted overload.
- `paused_reps`: the first eligible compound uses a 6–8-rep range and 2–2–1–0
  tempo. The coach must check that the pause is appropriate for that movement.

New definitions are not silently enabled in coach defaults. Coaches select them
from the existing visit/system editor, may scope them to muscles, edit the public
definition, create a private copy, disable or remove them using existing controls.
All injury, equipment, level and generation constraints still apply.

## Structured editor and execution

The existing recipe editor now offers numeric minimum/maximum repetitions,
RIR/RPE choices, and four numeric tempo phases: eccentric, bottom pause,
concentric, top pause. Tempo influences estimated session duration, not only a
note. A separate minimum bottom hold is included without counting the same pause
twice. Existing three-phase tempos and explosive concentric `X` remain readable;
`X` uses a one-second estimate, not a measured velocity.

Legacy compound repetition expressions are displayed read-only until the coach
explicitly converts them to a simple numeric range. Switching an operation
replaces its payload so fields from the previous operation do not cause an API
validation error. Invalid/reversed numeric bounds and fractional set counts are
rejected. Descriptive instructions remain text; executable controls are typed.

`first_compound` selects after muscle scoping and cannot be combined with a
multi-exercise grouping. With no eligible movement it does not spill into an
isolation or timed exercise. New recipes do not mutate existing program snapshots.

## Explicit Stage data operation

The command defaults to a read-only preview. Applying requires both the Stage
domain and `--confirm-stage`. It does not modify production or apply migrations.
Existing names, English names, aliases and external keys (including archived
rows) prevent duplication. Coach edits, inactive choices, videos, history and
rules are preserved. Taxonomy additions do not rewrite existing entries.

After deploying this code, run on the new server:

```bash
ssh root@82.115.8.152 'docker exec athlore-stage-backend-1 python manage.py expand_stage_catalog --coach-id e1ca02dc-4d82-442a-b0cd-be01fb1145f5'
ssh root@82.115.8.152 'docker exec athlore-stage-backend-1 python manage.py expand_stage_catalog --coach-id e1ca02dc-4d82-442a-b0cd-be01fb1145f5 --apply --confirm-stage'
```

The live Stage import before deployment defers systems whose target the running
release cannot execute, marking only newly created rows with
`parameter_schema.pending_stage_release`. The command above activates only those
explicit pending rows and clears the marker. Independently disabled or customized
systems are not re-enabled. This is a release/data hand-off, not a runtime fallback.

Live Stage application on 2026-10-28 added 68 exercises to Arman's catalog:
5 chest, 8 back, 5 shoulders, 6 quadriceps, 6 hamstrings, 9 glutes, 6 calves,
8 core, 3 biceps, 3 triceps, 5 forearms and 4 traps. Active exercises increased
from 230 to 298 (310 total including inactive/test rows). Another coach's catalog
was unchanged. All five definitions were added; `strength_5x5` and `paused_reps`
remain inactive pending the command above after deployment. No SMS, application
restart or deployment occurred. The pre-operation Stage PostgreSQL backup is
`/root/athlore-backups/catalog-expansion-20261028T103159Z/stage-before.dump` on
`82.115.8.152`; its archive table of contents was verified before application.

## Focused checks

Run `accounts.tests.test_catalog_expansion` and
`accounts.tests.test_structured_catalog` against a disposable database with
`SMS_BACKEND=mock`. The pack does not create users, finalize visits, publish
programs or request OTPs, and never sends SMS. Verify repeated application is
idempotent and another coach's catalog remains unchanged.

In the coach UI, search for newly added movements, inspect equipment and levels,
and edit a disposable copy. Open a system, switch operation types, save numeric
rep ranges/tempo and reopen. Check the two-column form at mobile and desktop
widths. Select a system for one muscle and generate a draft; check prescriptions,
group adjacency and estimated duration. Do not publish or send real SMS for QA.
