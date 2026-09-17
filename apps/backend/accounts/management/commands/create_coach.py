from __future__ import annotations

import getpass
import secrets
import string

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from accounts.services import create_coach_account
from common.exceptions import ConflictError
from common.phone import InvalidPhoneError


class Command(BaseCommand):
    help = "Create a coach account (admin provisioning; ignores public registration flag)."

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True)
        parser.add_argument("--email", required=True)
        parser.add_argument("--phone", required=True)
        parser.add_argument("--password", default=None)
        parser.add_argument("--generate-password", action="store_true")

    def handle(self, *args, **options):
        password = options.get("password")
        if options["generate_password"]:
            alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
            password = "".join(secrets.choice(alphabet) for _ in range(16))
        elif not password:
            password = getpass.getpass("Password: ")
            confirm = getpass.getpass("Confirm password: ")
            if password != confirm:
                raise CommandError("Passwords do not match.")
        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc
        try:
            user, coach = create_coach_account(
                email=options["email"],
                password=password,
                full_name=options["name"],
                phone_number=options["phone"],
            )
        except ConflictError as exc:
            raise CommandError(f"{exc.default_code}: {exc.detail}") from exc
        except InvalidPhoneError as exc:
            raise CommandError(str(exc)) from exc
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS("Coach created"))
        self.stdout.write(f"user_id={user.pk}")
        self.stdout.write(f"coach_id={coach.id}")
        self.stdout.write(f"name={coach.display_name}")
        self.stdout.write(f"email={user.email}")
        self.stdout.write(f"phone={coach.phone_number}")
        self.stdout.write(f"active={user.is_active}")
        if options["generate_password"]:
            self.stdout.write(self.style.WARNING(f"generated_password={password}"))
