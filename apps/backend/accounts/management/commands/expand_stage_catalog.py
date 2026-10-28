"""Explicit, additive Stage data operation; not a production migration."""

import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.catalog_expansion import PACK_VERSION, expand_catalog, new_systems, seed_systems
from accounts.models import CoachProfile, TrainingTechnique


class Command(BaseCommand):
    help = "Preview or add the reviewed movement pack and five training systems to Stage."

    def add_arguments(self, parser):
        parser.add_argument("--coach-id", required=True)
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--confirm-stage", action="store_true")
        parser.add_argument("--exercises-only", action="store_true")

    def handle(self, *args, **options):
        if options["apply"] and (
            not options["confirm_stage"] or not settings.PUBLIC_DOMAIN.startswith("stage.")
        ):
            raise CommandError("Apply requires --confirm-stage and a stage.* PUBLIC_DOMAIN.")
        coach = CoachProfile.objects.get(pk=options["coach_id"])
        with transaction.atomic():
            report = expand_catalog(coach, apply=options["apply"])
            report["applied"] = options["apply"]
            report["systems"] = []
            report["systems_activated"] = []
            if not options["exercises_only"]:
                pending = list(
                    TrainingTechnique.objects.filter(
                        parameter_schema={"pending_stage_release": PACK_VERSION}, is_active=False
                    ).values_list("key", flat=True)
                )
                report["systems_pending_release"] = pending
                report["systems"] = (
                    seed_systems()
                    if options["apply"]
                    else [
                        row["key"]
                        for row in new_systems()
                        if not TrainingTechnique.objects.filter(key=row["key"]).exists()
                    ]
                )
                if options["apply"]:
                    report["systems_activated"] = list(
                        TrainingTechnique.objects.filter(
                            key__in=pending, is_active=True, parameter_schema={}
                        ).values_list("key", flat=True)
                    )
        self.stdout.write(json.dumps(report, ensure_ascii=False))
