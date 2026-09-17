"""Import an ``athlore.exercise_catalog.v1`` file for exactly one coach."""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from accounts.exercise_catalog_import import (
    CatalogImportError,
    apply_import,
    load_catalog,
    prepare_import,
)
from accounts.models import CoachProfile


class Command(BaseCommand):
    help = (
        "Validate and import a coach-owned athlore.exercise_catalog.v1 JSON file. "
        "The coach is selected only by UUID; the document cannot select ownership."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--coach-id",
            required=True,
            help="Existing CoachProfile.id UUID. Never put this value in the catalog JSON.",
        )
        parser.add_argument("--file", required=True, help="Path to the catalog JSON file.")
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate and report changes without writing database rows.",
        )
        mode.add_argument(
            "--apply",
            action="store_true",
            help="Apply the validated import in one transaction.",
        )
        parser.add_argument(
            "--replace-primary-muscle-key",
            help=(
                "Before apply, remove only this coach's existing exercises whose exact "
                "structured primary muscle matches the key; also removes their dependent "
                "catalog rows and exact bank-group references."
            ),
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Print the complete machine-readable report.",
        )

    def handle(self, *args, **options) -> None:
        try:
            coach = CoachProfile.objects.get(pk=options["coach_id"])
        except (CoachProfile.DoesNotExist, ValueError) as exc:
            raise CommandError(f"CoachProfile not found: {options['coach_id']}") from exc

        try:
            document = load_catalog(options["file"])
            plan = prepare_import(
                coach,
                document,
                replace_primary_muscle_key=options.get("replace_primary_muscle_key"),
            )
            report = apply_import(plan) if options["apply"] else plan.report
        except CatalogImportError as exc:
            raise CommandError("Catalog import stopped before any write:\n- " + "\n- ".join(exc.errors)) from exc

        if options["json"]:
            self.stdout.write(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
            return

        mode = "APPLY" if options["apply"] else "DRY-RUN"
        self.stdout.write(
            self.style.SUCCESS(
                f"[{mode}] coach={report['coach']['display_name']} ({report['coach']['id']})"
            )
        )
        self.stdout.write(
            "created={created} updated={updated} skipped={skipped} deleted={deleted} errors={errors}".format(
                **report
            )
        )
        for item in report["exercises"]:
            self.stdout.write(
                f"{item['action']}: {item['external_key']} | {item['name_fa']} | "
                f"{item['primary_target']['muscle_key']}/{item['primary_target']['region_key']}"
            )
        if report["deletions"]:
            self.stdout.write("Rows scheduled for deletion:")
            for row in report["deletions"]:
                self.stdout.write(
                    f"- {row['id']} | {row['external_key'] or '<legacy>'} | {row['name_fa']}"
                )
        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry-run: no database changes were written."))
