import shutil
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from accounts.exercise_media_services import process_next_video


class Command(BaseCommand):
    help = "Process durable exercise video jobs; originals and outputs stay in MEDIA_ROOT."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        for executable in ("ffmpeg", "ffprobe"):
            if not shutil.which(executable):
                raise CommandError(f"Required executable is missing: {executable}")
        while True:
            close_old_connections()
            processed = process_next_video()
            if options["once"]:
                return
            if not processed:
                time.sleep(3)
