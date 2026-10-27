"""Audit or explicitly fill recognized legacy movement metadata."""

from django.core.management.base import BaseCommand

from accounts.exercise_metadata import infer_legacy_metadata, metadata_missing
from accounts.models import Exercise


class Command(BaseCommand):
    help = (
        "Report incomplete exercise metadata; --apply fills recognized fields without changing IDs."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--coach-id")

    def handle(self, *args, **options):
        rows = Exercise.objects.filter(is_archived=False)
        if options["coach_id"]:
            rows = rows.filter(coach_id=options["coach_id"])
        for exercise in rows.iterator():
            if not metadata_missing(exercise):
                continue
            values = infer_legacy_metadata(exercise.name, exercise.movement_pattern)
            changed = []
            for field, value in values.items():
                if field in metadata_missing(exercise):
                    setattr(exercise, field, value)
                    changed.append(field)
            if changed and options["apply"]:
                exercise.save(update_fields=[*changed, "updated_at"])
            self.stdout.write(
                f"{exercise.pk} {exercise.name}: fields={','.join(changed)} unresolved={','.join(metadata_missing(exercise))}"
            )
