from __future__ import annotations

from django.core.management.base import BaseCommand

from accounts.models import CoachProfile
from accounts.services import normalize_email
from common.phone import InvalidPhoneError, normalize_iran_mobile


class Command(BaseCommand):
    help = "List coaches."

    def add_arguments(self, parser):
        parser.add_argument("--active", action="store_true")
        parser.add_argument("--inactive", action="store_true")
        parser.add_argument("--phone", default=None)
        parser.add_argument("--email", default=None)
        parser.add_argument("--missing-phone", action="store_true")

    def handle(self, *args, **options):
        qs = CoachProfile.objects.select_related("user").order_by("display_name")
        if options["active"]:
            qs = qs.filter(user__is_active=True)
        if options["inactive"]:
            qs = qs.filter(user__is_active=False)
        if options["missing_phone"]:
            qs = qs.filter(phone_number__isnull=True)
        if options["email"]:
            email = normalize_email(options["email"])
            qs = qs.filter(user__email__iexact=email)
        if options["phone"]:
            try:
                phone = normalize_iran_mobile(options["phone"], required=True)
            except InvalidPhoneError as exc:
                self.stderr.write(str(exc))
                return
            qs = qs.filter(phone_number=phone)
        for coach in qs:
            user = coach.user
            self.stdout.write(
                f"{coach.id}\t{coach.display_name}\t{user.email}\t"
                f"{coach.phone_number or '-'}\tactive={user.is_active}"
            )
        self.stdout.write(f"count={qs.count()}")
