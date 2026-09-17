"""Idempotent demo seed for local development.

Delegates to ``seed_demo_fixtures`` (canonical version-controlled fixture command).
"""

from __future__ import annotations

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Alias for seed_demo_fixtures (Arman + Mohammad demo data)."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="arman@example.com")
        parser.add_argument("--password", default="Arman1234!")
        parser.add_argument("--allow-demo-password", action="store_true")
        parser.add_argument("--force", action="store_true")
        parser.add_argument("--skip-generate", action="store_true")
        parser.add_argument("--with-pdf", action="store_true")

    def handle(self, *args, **options):
        call_command(
            "seed_demo_fixtures",
            email=options["email"],
            password=options["password"],
            allow_demo_password=options["allow_demo_password"],
            force=options["force"],
            skip_generate=options["skip_generate"],
            with_pdf=options["with_pdf"],
        )
