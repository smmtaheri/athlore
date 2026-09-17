from __future__ import annotations

from django.core.management.base import BaseCommand

from accounts.admin_resolve import resolve_coach


class Command(BaseCommand):
    help = "Deactivate a coach login without deleting data."

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
        user.is_active = False
        user.save(update_fields=["is_active"])
        self.stdout.write(self.style.WARNING(f"Deactivated coach {user.email} id={coach.id}"))
