from __future__ import annotations

from django.core.management.base import BaseCommand

from accounts.admin_resolve import resolve_coach


class Command(BaseCommand):
    help = "Activate a coach login."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=None)
        parser.add_argument("--coach-id", default=None)
        parser.add_argument("--phone", default=None)

    def handle(self, *args, **options):
        coach = resolve_coach(
            coach_id=options["coach_id"],
            coach_email=options["email"],
            coach_phone=options["phone"],
        )
        user = coach.user
        user.is_active = True
        user.save(update_fields=["is_active"])
        self.stdout.write(self.style.SUCCESS(f"Activated coach {user.email} id={coach.id}"))
