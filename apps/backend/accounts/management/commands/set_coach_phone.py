from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from accounts.admin_resolve import resolve_coach
from accounts.services import set_coach_phone
from common.exceptions import ConflictError
from common.phone import InvalidPhoneError


class Command(BaseCommand):
    help = "Assign or correct a coach phone number."

    def add_arguments(self, parser):
        parser.add_argument("--coach-email", default=None)
        parser.add_argument("--coach-id", default=None)
        parser.add_argument("--email", default=None)
        parser.add_argument("--phone", required=True)

    def handle(self, *args, **options):
        email = options.get("coach_email") or options.get("email")
        coach = resolve_coach(coach_id=options["coach_id"], coach_email=email)
        try:
            coach = set_coach_phone(coach, options["phone"])
        except ConflictError as exc:
            raise CommandError(f"{exc.default_code}: {exc.detail}") from exc
        except InvalidPhoneError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"coach_id={coach.id} phone={coach.phone_number}"))
