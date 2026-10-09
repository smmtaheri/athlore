from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from students.models import StagedVisitPhoto


class Command(BaseCommand):
    help = "Remove expired private visit photo uploads and their files."

    def handle(self, *args, **options):
        total = 0
        while True:
            with transaction.atomic():
                ids = list(
                    StagedVisitPhoto.objects.select_for_update(skip_locked=True)
                    .filter(expires_at__lte=timezone.now())
                    .order_by("expires_at")
                    .values_list("id", flat=True)[:100]
                )
                if not ids:
                    break
                deleted, _ = StagedVisitPhoto.objects.filter(id__in=ids).delete()
                total += deleted
        self.stdout.write(f"Removed {total} expired staged visit photos.")
