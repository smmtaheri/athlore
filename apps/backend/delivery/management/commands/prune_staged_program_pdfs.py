from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from delivery.models import StagedProgramPdf


class Command(BaseCommand):
    help = "Remove expired private program PDF uploads and their files."

    def handle(self, *args, **options):
        removed = 0
        while True:
            with transaction.atomic():
                rows = list(
                    StagedProgramPdf.objects.select_for_update(skip_locked=True)
                    .filter(expires_at__lte=timezone.now())
                    .order_by("expires_at")[:100]
                )
                if not rows:
                    break
                for staged in rows:
                    if staged.file:
                        staged.file.delete(save=False)
                    staged.delete()
                    removed += 1
        self.stdout.write(f"Removed {removed} expired staged program PDFs.")
