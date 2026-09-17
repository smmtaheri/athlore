"""Idempotent importer for coach reference-bank datasets (exercises, historical
program usage, nutrition & supplement templates) stored as static JSON under
`reference_data/<dataset>/`.

Usage:
    python manage.py import_coach_reference_data --coach-email coach@example.com \
        --dataset arman [--dry-run] [--replace]
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import (
    CoachNutritionTemplate,
    CoachProfile,
    CoachSupplementTemplate,
    Exercise,
    ExerciseAlias,
    ExerciseBankGroup,
    ExerciseHistoricalUsage,
    InjuryRule,
    NutritionMealOption,
    NutritionMealSlot,
    NutritionOptionItem,
    ProgramTemplate,
    SupplementTemplateItem,
)
from accounts.rules_services import ensure_rule_set

REFERENCE_DATA_ROOT = Path(settings.BASE_DIR) / "reference_data"

REQUIRED_FILES = ("exercises.json",)
OPTIONAL_FILES = {
    "exercise_aliases.json": [],
    "historical_programs.json": [],
    "nutrition_templates.json": [],
    "supplement_templates.json": [],
}


class Counters:
    __slots__ = ("created", "updated", "skipped", "conflicts")

    def __init__(self) -> None:
        self.created = 0
        self.updated = 0
        self.skipped = 0
        self.conflicts = 0

    def as_dict(self) -> dict:
        return {
            "created": self.created,
            "updated": self.updated,
            "skipped": self.skipped,
            "conflicts": self.conflicts,
        }

    def line(self, label: str) -> str:
        return (
            f"{label}: created={self.created} updated={self.updated} "
            f"skipped={self.skipped} conflicts={self.conflicts}"
        )


class Command(BaseCommand):
    help = (
        "Import a coach reference dataset (exercise bank, aliases, historical "
        "program usage, nutrition templates, supplement templates) from "
        "reference_data/<dataset>/. Idempotent: safe to re-run."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--coach-email", required=True, help="Existing coach's account email.")
        parser.add_argument(
            "--dataset", default="arman", help="Dataset folder name under reference_data/."
        )
        parser.add_argument(
            "--dry-run", action="store_true", help="Compute counts without writing anything."
        )
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Delete this coach's existing templates matching dataset names before recreating them.",
        )

    def handle(self, *args, **options) -> None:
        email = (options["coach_email"] or "").strip()
        dataset = (options["dataset"] or "").strip()
        dry_run = bool(options["dry_run"])
        replace = bool(options["replace"])

        coach = CoachProfile.objects.filter(user__email__iexact=email).first()
        if coach is None:
            raise CommandError(
                f"No coach found with email={email!r}. Create the coach first "
                "(e.g. `python manage.py create_coach ...`)."
            )

        dataset_dir = REFERENCE_DATA_ROOT / dataset
        if not dataset_dir.is_dir():
            raise CommandError(f"Reference dataset directory not found: {dataset_dir}")

        summary: dict[str, dict] = {}
        try:
            with transaction.atomic():
                summary = self._run_import(coach, dataset_dir, replace=replace)
                if dry_run:
                    transaction.set_rollback(True)
        except (KeyError, ValueError, TypeError) as exc:
            raise CommandError(f"Invalid reference data: {exc}") from exc

        self._print_summary(summary, dataset=dataset, coach=coach, dry_run=dry_run)

    # -- loading -----------------------------------------------------------------

    def _load_json(self, dataset_dir: Path, filename: str, *, default: Any = None) -> Any:
        path = dataset_dir / filename
        if not path.exists():
            if default is not None:
                return default
            raise CommandError(f"Missing required reference file: {path}")
        try:
            with path.open(encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON in {path}: {exc}") from exc

    # -- orchestration -------------------------------------------------------------

    def _run_import(
        self, coach: CoachProfile, dataset_dir: Path, *, replace: bool
    ) -> dict[str, dict]:
        rule_set = ensure_rule_set(coach)

        exercises_data = self._load_json(dataset_dir, "exercises.json")
        extra_aliases_data = self._load_json(dataset_dir, "exercise_aliases.json", default=[])
        historical_data = self._load_json(dataset_dir, "historical_programs.json", default=[])
        nutrition_data = self._load_json(dataset_dir, "nutrition_templates.json", default=[])
        supplement_data = self._load_json(dataset_dir, "supplement_templates.json", default=[])

        exercise_counters, alias_counters, canonical_to_exercise, category_map = (
            self._import_exercises(coach, exercises_data, extra_aliases_data)
        )
        bank_counters = self._upsert_bank_groups(coach, rule_set, category_map)
        historical_counters = self._import_historical_usage(
            coach, historical_data, canonical_to_exercise
        )
        nutrition_counters = self._import_nutrition_templates(
            coach, rule_set, nutrition_data, replace=replace
        )
        supplement_counters = self._import_supplement_templates(
            coach, supplement_data, replace=replace
        )
        template_counters = self._ensure_default_program_template(coach, rule_set)
        injury_counters = self._ensure_neck_injury_rule(coach, rule_set)

        return {
            "exercises": exercise_counters.as_dict(),
            "aliases": alias_counters.as_dict(),
            "exercise_bank_groups": bank_counters.as_dict(),
            "historical_usage": historical_counters.as_dict(),
            "nutrition_templates": nutrition_counters.as_dict(),
            "supplement_templates": supplement_counters.as_dict(),
            "program_templates": template_counters.as_dict(),
            "injury_rules": injury_counters.as_dict(),
        }

    # -- exercises + aliases --------------------------------------------------------

    def _resolve_existing_exercise(
        self, coach: CoachProfile, candidate_names: list[str]
    ) -> Exercise | None:
        names = [n for n in candidate_names if n]
        if not names:
            return None
        exercise = Exercise.objects.filter(coach=coach, name__in=names).first()
        if exercise is not None:
            return exercise
        alias_row = (
            ExerciseAlias.objects.filter(coach=coach, alias__in=names)
            .select_related("exercise")
            .first()
        )
        return alias_row.exercise if alias_row else None

    def _import_exercises(
        self,
        coach: CoachProfile,
        exercises_data: list[dict],
        extra_aliases_data: list[dict],
    ) -> tuple[Counters, Counters, dict[str, Exercise], dict[str, set[str]]]:
        exercise_counters = Counters()
        alias_counters = Counters()
        canonical_to_exercise: dict[str, Exercise] = {}
        category_map: dict[str, set[str]] = {}

        for entry in exercises_data:
            canonical_name = str(entry["canonical_name"]).strip()
            if not canonical_name:
                exercise_counters.conflicts += 1
                continue
            aliases = [str(a).strip() for a in entry.get("aliases", []) if str(a).strip()]
            category = str(entry.get("category") or "").strip()

            # Resolve on the canonical name alone (matched against existing exercise
            # names OR existing alias rows for that exact string). Incoming aliases are
            # intentionally excluded here: an alias string already claimed by an
            # unrelated exercise must surface as an alias conflict below, not silently
            # re-target ("steal") that unrelated exercise into this canonical entry.
            existing = self._resolve_existing_exercise(coach, [canonical_name])
            fields = {
                "name": canonical_name,
                "name_en": str(entry.get("name_en") or ""),
                "primary_muscle": str(entry.get("primary_muscle") or category or "عمومی"),
                "secondary_muscles": list(entry.get("secondary_muscles") or []),
                "equipment": str(entry.get("equipment") or ""),
                "movement_pattern": str(entry.get("movement_pattern") or ""),
                "laterality": str(entry.get("laterality") or ""),
                "source_document": str(entry.get("source_document") or ""),
            }

            if existing is None:
                exercise = Exercise.objects.create(coach=coach, is_active=True, **fields)
                exercise_counters.created += 1
            else:
                # Create-only: never overwrite coach-edited exercise metadata on re-import.
                exercise_counters.skipped += 1
                exercise = existing

            canonical_to_exercise[canonical_name] = exercise
            if category:
                category_map.setdefault(category, set()).add(canonical_name)

            for alias in aliases:
                self._upsert_alias(coach, exercise, alias, alias_counters)

        for row in extra_aliases_data:
            canonical_name = str(row.get("canonical_name") or "").strip()
            alias = str(row.get("alias") or "").strip()
            if not canonical_name or not alias:
                alias_counters.conflicts += 1
                continue
            exercise = canonical_to_exercise.get(canonical_name) or self._resolve_existing_exercise(
                coach, [canonical_name]
            )
            if exercise is None:
                alias_counters.conflicts += 1
                continue
            self._upsert_alias(coach, exercise, alias, alias_counters)

        return exercise_counters, alias_counters, canonical_to_exercise, category_map

    def _upsert_alias(
        self, coach: CoachProfile, exercise: Exercise, alias: str, counters: Counters
    ) -> None:
        if alias == exercise.name:
            counters.skipped += 1
            return
        existing_alias = ExerciseAlias.objects.filter(coach=coach, alias=alias).first()
        if existing_alias is None:
            ExerciseAlias.objects.create(coach=coach, exercise=exercise, alias=alias)
            counters.created += 1
        elif existing_alias.exercise_id == exercise.id:
            counters.skipped += 1
        else:
            # Same coach already uses this alias for a different exercise; do not overwrite.
            counters.conflicts += 1

    # -- exercise bank groups -----------------------------------------------------

    def _upsert_bank_groups(
        self, coach: CoachProfile, rule_set, category_map: dict[str, set[str]]
    ) -> Counters:
        counters = Counters()
        for category, names in category_map.items():
            group = ExerciseBankGroup.objects.filter(
                coach=coach, rule_set=rule_set, group_name=category
            ).first()
            if group is None:
                ExerciseBankGroup.objects.create(
                    coach=coach,
                    rule_set=rule_set,
                    group_name=category,
                    favorite_exercises=sorted(names),
                )
                counters.created += 1
                continue
            # Create-only: do not merge/overwrite an existing coach bank group.
            counters.skipped += 1
        return counters

    # -- historical usage ----------------------------------------------------------

    def _import_historical_usage(
        self,
        coach: CoachProfile,
        historical_data: list[dict],
        canonical_to_exercise: dict[str, Exercise],
    ) -> Counters:
        counters = Counters()
        for program in historical_data:
            program_key = str(program.get("source_program_key") or "").strip()
            if not program_key:
                counters.conflicts += 1
                continue
            source_date = str(program.get("source_date") or "")
            duration_weeks = int(program.get("duration_weeks") or 4)
            for day in program.get("days", []):
                day_label = str(day.get("day_label") or "")
                for ex_entry in day.get("exercises", []):
                    name = str(ex_entry.get("name") or "").strip()
                    raw_prescription = str(ex_entry.get("raw_prescription") or "").strip()
                    if not name or not raw_prescription:
                        counters.conflicts += 1
                        continue
                    exercise = canonical_to_exercise.get(name) or self._resolve_existing_exercise(
                        coach, [name]
                    )
                    if exercise is None:
                        counters.conflicts += 1
                        continue
                    notes = str(ex_entry.get("notes") or "")
                    if ex_entry.get("superset_with_previous") and "superset" not in notes:
                        notes = (notes + " superset_with_previous").strip()
                    _, created = ExerciseHistoricalUsage.objects.get_or_create(
                        coach=coach,
                        exercise=exercise,
                        source_program_key=program_key,
                        raw_prescription=raw_prescription,
                        defaults={
                            "source_date": source_date,
                            "duration_weeks": duration_weeks,
                            "day_label": day_label,
                            "notes": notes,
                        },
                    )
                    if created:
                        counters.created += 1
                    else:
                        counters.skipped += 1
        return counters

    # -- nutrition templates --------------------------------------------------------

    def _import_nutrition_templates(
        self, coach: CoachProfile, rule_set, nutrition_data: list[dict], *, replace: bool
    ) -> Counters:
        counters = Counters()
        names = [str(t.get("name") or "").strip() for t in nutrition_data]
        if replace:
            CoachNutritionTemplate.objects.filter(
                coach=coach, name__in=[n for n in names if n]
            ).delete()

        for t in nutrition_data:
            name = str(t.get("name") or "").strip()
            if not name:
                counters.conflicts += 1
                continue
            if CoachNutritionTemplate.objects.filter(coach=coach, name=name).exists():
                counters.skipped += 1
                continue

            template = CoachNutritionTemplate.objects.create(
                coach=coach,
                rule_set=rule_set,
                name=name,
                purpose=str(t.get("purpose") or ""),
                day_type=str(t.get("day_type") or ""),
                status=str(t.get("status") or CoachNutritionTemplate.Status.DRAFT),
                needs_coach_review=True,
                source_document=str(t.get("source_document") or ""),
                source_version=str(t.get("source_version") or ""),
                is_eligible_for_auto_select=False,
            )
            for slot_sort, (slot_key, options) in enumerate(
                dict(t.get("meal_slots") or {}).items()
            ):
                slot = NutritionMealSlot.objects.create(
                    template=template, slot_key=slot_key, sort_order=slot_sort
                )
                for option_sort, option in enumerate(options):
                    meal_option = NutritionMealOption.objects.create(
                        slot=slot,
                        option_index=int(option.get("option_index") or option_sort + 1),
                        sort_order=option_sort,
                        notes=str(option.get("notes") or ""),
                    )
                    for item_sort, item in enumerate(option.get("items") or []):
                        NutritionOptionItem.objects.create(
                            option=meal_option,
                            sort_order=item_sort,
                            food_name=str(item["food_name"]),
                            quantity_text=str(item["quantity_text"]),
                            unit=str(item.get("unit") or ""),
                            preparation=str(item.get("preparation") or ""),
                            substitution_group=str(item.get("substitution_group") or ""),
                            needs_review=bool(item.get("needs_review", False)),
                            reviewed_quantity=item.get("reviewed_quantity"),
                            notes=str(item.get("notes") or ""),
                        )
            counters.created += 1
        return counters

    # -- supplement templates --------------------------------------------------------

    def _import_supplement_templates(
        self, coach: CoachProfile, supplement_data: list[dict], *, replace: bool
    ) -> Counters:
        counters = Counters()
        for t in supplement_data:
            name = str(t.get("name") or "").strip()
            if not name:
                counters.conflicts += 1
                continue
            if replace:
                CoachSupplementTemplate.objects.filter(coach=coach, name=name).delete()

            template = CoachSupplementTemplate.objects.filter(coach=coach, name=name).first()
            new_sources = list(t.get("source_documents") or [])
            if template is None:
                template = CoachSupplementTemplate.objects.create(
                    coach=coach,
                    name=name,
                    status=str(t.get("status") or CoachSupplementTemplate.Status.DRAFT),
                    needs_coach_review=True,
                    source_documents=new_sources,
                    is_eligible_for_auto_select=False,
                )
                for idx, item in enumerate(t.get("items") or []):
                    SupplementTemplateItem.objects.create(
                        template=template,
                        sort_order=idx,
                        name=str(item["name"]),
                        quantity_text=str(item["quantity_text"]),
                        timing=str(item.get("timing") or ""),
                        frequency=str(item.get("frequency") or ""),
                        day_applicability=str(item.get("day_applicability") or ""),
                        instructions=str(item.get("instructions") or ""),
                        warnings=str(item.get("warnings") or ""),
                        needs_review=bool(item.get("needs_review", True)),
                        normalized_amount=item.get("normalized_amount"),
                    )
                counters.created += 1
            else:
                existing_sources = list(template.source_documents or [])
                additions = [s for s in new_sources if s not in existing_sources]
                if additions:
                    template.source_documents = existing_sources + additions
                    template.save(update_fields=["source_documents", "updated_at"])
                    counters.updated += 1
                else:
                    counters.skipped += 1
        return counters

    def _ensure_default_program_template(self, coach: CoachProfile, rule_set) -> Counters:
        """Ensure at least one active ProgramTemplate exists for generation smoke/acceptance."""
        counters = Counters()
        name = "۴ روزه حجم متوسط"
        existing = ProgramTemplate.objects.filter(coach=coach, name=name).first()
        if existing is not None:
            # Create-only: never overwrite coach edits to split/volume on re-import.
            counters.skipped += 1
            return counters
        ProgramTemplate.objects.create(
            rule_set=rule_set,
            coach=coach,
            name=name,
            goal="hypertrophy",
            main_goal="hypertrophy",
            level=ProgramTemplate.Level.INTERMEDIATE,
            days_per_week=4,
            volume="متوسط",
            intensity="متوسط",
            rest_time="۶۰ تا ۱۲۰ ثانیه",
            split=["سینه و پشت بازو", "زیربغل و جلو بازو", "پا", "سرشانه و شکم"],
            muscle_priority_order=["سینه", "سرشانه", "پشت بازو", "زیربغل"],
            is_active=True,
            is_archived=False,
            sort_order=0,
        )
        counters.created += 1
        return counters

    def _ensure_neck_injury_rule(self, coach: CoachProfile, rule_set) -> Counters:
        """Ensure a neck-pain InjuryRule exists so historical shoulder/shrug conflict is explicit."""
        counters = Counters()
        name = "گردن درد"
        existing = InjuryRule.objects.filter(coach=coach, name=name).first()
        forbidden = [
            "پرس سرشانه سنگین",
            "پرس سرشانه هالتر",
            "شراگ سنگین",
            "شراگ",
            "شراگز",
        ]
        alternatives = ["نشر جانب دمبل", "فیس پول", "فلای معکوس دستگاه"]
        if existing is not None:
            counters.skipped += 1
            return counters
        InjuryRule.objects.create(
            rule_set=rule_set,
            coach=coach,
            name=name,
            forbidden_exercises=forbidden,
            alternatives=alternatives,
            notes="محدودیت فشار سنگین روی سرشانه و شراگ در صورت درد گردن.",
            is_active=True,
            sort_order=0,
        )
        counters.created += 1
        return counters

    # -- output ----------------------------------------------------------------------

    def _print_summary(
        self, summary: dict[str, dict], *, dataset: str, coach: CoachProfile, dry_run: bool
    ) -> None:
        header = f"[{'DRY-RUN' if dry_run else 'IMPORT'}] dataset={dataset} coach={coach.display_name} ({coach.id})"
        self.stdout.write(self.style.SUCCESS(header) if not dry_run else self.style.WARNING(header))
        labels = {
            "exercises": "Exercises",
            "aliases": "Aliases",
            "exercise_bank_groups": "Exercise bank groups",
            "historical_usage": "Historical usage rows",
            "nutrition_templates": "Nutrition templates",
            "supplement_templates": "Supplement templates",
            "program_templates": "Program templates",
            "injury_rules": "Injury rules",
        }
        for key, label in labels.items():
            counts = summary.get(key, {})
            counters = Counters()
            counters.created = counts.get("created", 0)
            counters.updated = counts.get("updated", 0)
            counters.skipped = counts.get("skipped", 0)
            counters.conflicts = counts.get("conflicts", 0)
            self.stdout.write(counters.line(label))
        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run: no changes were written."))
