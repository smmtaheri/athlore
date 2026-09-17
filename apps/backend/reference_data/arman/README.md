# Reference dataset: Arman

Static JSON fixtures for seeding a single coach's exercise bank, historical program
usage, nutrition templates and supplement template from real-world coaching material
("Arman"'s programs). This directory is only ever read by
`python manage.py import_coach_reference_data --dataset arman --coach-email <email>`;
nothing here is loaded automatically on app startup.

## Files

- `exercises.json` — canonical exercise bank entries. Each entry:
  `{canonical_name, name_en, category, primary_muscle, secondary_muscles, equipment,
  laterality, movement_pattern, aliases: [...], source_document}`.
  `category` maps 1:1 to an `ExerciseBankGroup.group_name` (one of the seven groups
  below); `primary_muscle` is the finer-grained muscle used on the `Exercise` row
  itself. Aliases are already deduplicated (e.g. "فلای"/"فالی" variants collapsed
  into a single canonical exercise with alternate spellings recorded as aliases).

  Categories used: سرشانه و کتف، سینه، زیربغل، جلوبازو، پشت‌بازو، پا، شکم و اصلاحی.

  Counts: 76 canonical exercises, 117 aliases → 193 raw exercise-name variants.

- `exercise_aliases.json` — optional *extra* aliases as a flat
  `[{canonical_name, alias}, ...]` list, merged on top of the aliases embedded in
  `exercises.json` during import. Empty here because all known aliases are already
  embedded in `exercises.json`.

- `historical_programs.json` — three real program snapshots
  (`1405/02/27`, `1405/03/24`, `1405/04/27`), each with a `source_program_key`
  (e.g. `arman_1405_02_27`), a `duration_weeks`, and a list of `days`
  (`day_label` + `exercises: [{name, raw_prescription, superset_with_previous?}]`).
  `name` must match a `canonical_name` (or one of its aliases) from `exercises.json`.
  Supersets are marked by setting `superset_with_previous: true` on the exercise
  immediately following the one it's paired with. `raw_prescription` is kept exactly
  as written by the coach (e.g. `8×4`, `12-10×4`, `15-10-8-15`, `ناتوانی × 4`,
  `30 seconds×3`) — no normalization is attempted at import time.

- `nutrition_templates.json` — three nutrition plans (training day / rest day /
  calorie-restricted "cut" day). Each plan has `meal_slots` keyed by one of the eight
  supported slots (`breakfast, snack_1, lunch, lunch_side, snack_2, dinner,
  dinner_side, snack_3`); each slot holds one or more interchangeable `options`
  (e.g. an alternative lunch protein), and each option holds ordered `items`
  (`food_name, quantity_text, unit, preparation, substitution_group, needs_review,
  notes`). Items whose `quantity_text` is an ambiguous fraction of a unit (e.g.
  `۱/۵ عدد`, `۲/۵ پیمانه`, `یک‌چهارم عدد`, `یک‌پنجم عدد`) are marked
  `needs_review: true` so a coach must confirm/normalize the amount before the
  template can be marked reviewed. All three templates import as `status=draft` with
  `needs_coach_review=true` and `is_eligible_for_auto_select=false` — a human coach
  must review and activate them before they're eligible for auto-selection.

- `supplement_templates.json` — one template, "برنامه مکمل مرجع آرمان", with 4 items
  (creatine monohydrate, whey protein, omega-3, multivitamin) and `source_documents`
  listing the three original PDF references it was compiled from. Also imports as
  `draft` / `needs_coach_review=true` / not eligible for auto-select, and carries the
  standard Persian medical disclaimer (see `CoachSupplementTemplate.medical_disclaimer`).

## Regenerating

These files are static and hand-authored/reviewed; there is no generator script
checked into the repo. If you need to add exercises or programs, edit the JSON
directly and re-run the import command with `--dry-run` first to sanity-check counts.
