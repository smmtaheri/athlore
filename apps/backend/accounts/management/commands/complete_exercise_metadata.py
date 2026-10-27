"""Audit or explicitly fill recognized legacy movement metadata."""

from django.core.management.base import BaseCommand

from accounts.exercise_metadata import infer_legacy_metadata, metadata_issues
from accounts.models import Exercise


class Command(BaseCommand):
    help = "Audit execution metadata and apply only missing fields or safe, explicit legacy corrections."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--coach-id")

    def handle(self, *args, **options):
        rows = Exercise.objects.filter(is_archived=False).prefetch_related("muscle_targets__muscle")
        if options["coach_id"]:
            rows = rows.filter(coach_id=options["coach_id"])
        for exercise in rows.iterator(chunk_size=200):
            issues_before = metadata_issues(exercise)
            values = infer_legacy_metadata(exercise.name, exercise.movement_pattern)
            changed = []
            safe_front_raise_correction = (
                values.get("movement_pattern") == "shoulder_flexion"
                and exercise.movement_pattern != "shoulder_flexion"
                and any(
                    phrase in exercise.name.replace("‌", " ").lower()
                    for phrase in (
                        "نشر جلو",
                        "نشر از جلو",
                        "نشر روبرو",
                        "نشر رو به رو",
                        "نشر از روبرو",
                        "front raise",
                    )
                )
            )
            if not issues_before and not safe_front_raise_correction:
                continue
            for field, value in values.items():
                if not getattr(exercise, field) or safe_front_raise_correction:
                    setattr(exercise, field, value)
                    changed.append(field)
            projected = {
                "movement_pattern": exercise.movement_pattern,
                "mechanics": exercise.mechanics,
                "joint_keys": exercise.joint_keys,
                "prescription_unit": exercise.prescription_unit,
                "primary_muscle": exercise.primary_muscle,
                "targets": [
                    {"muscle_key": target.muscle.key, "role": target.role}
                    for target in exercise.muscle_targets.all()
                ],
            }
            if changed and options["apply"]:
                exercise.save(update_fields=list(dict.fromkeys([*changed, "updated_at"])))
                exercise.refresh_from_db()
                issues_after = metadata_issues(exercise)
            else:
                issues_after = metadata_issues(projected)
            self.stdout.write(
                f"{exercise.pk} {exercise.name}: issues={','.join(issues_before) or '-'} "
                f"suggested={','.join(changed) or '-'} "
                f"remaining={','.join(issues_after) or '-'}"
            )
