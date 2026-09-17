from __future__ import annotations

from django.core.management.base import BaseCommand

from accounts.admin_resolve import resolve_coach
from common.phone import InvalidPhoneError, normalize_iran_mobile
from students.models import Student


class Command(BaseCommand):
    help = "List students, optionally filtered by coach."

    def add_arguments(self, parser):
        parser.add_argument("--coach-email", default=None)
        parser.add_argument("--coach-id", default=None)
        parser.add_argument("--coach-phone", default=None)
        parser.add_argument("--phone", default=None)
        parser.add_argument("--active", action="store_true")
        parser.add_argument("--archived", action="store_true")
        parser.add_argument("--missing-phone", action="store_true")

    def handle(self, *args, **options):
        qs = Student.objects.select_related("coach", "coach__user").order_by("full_name")
        if options["coach_email"] or options["coach_id"] or options["coach_phone"]:
            coach = resolve_coach(
                coach_id=options["coach_id"],
                coach_email=options["coach_email"],
                coach_phone=options["coach_phone"],
            )
            qs = qs.filter(coach=coach)
        if options["active"]:
            qs = qs.filter(status=Student.Status.ACTIVE, archived_at__isnull=True)
        if options["archived"]:
            qs = qs.filter(archived_at__isnull=False)
        if options["missing_phone"]:
            qs = qs.filter(phone_number__isnull=True)
        if options["phone"]:
            try:
                phone = normalize_iran_mobile(options["phone"], required=True)
            except InvalidPhoneError as exc:
                self.stderr.write(str(exc))
                return
            qs = qs.filter(phone_number=phone)
        for student in qs:
            self.stdout.write(
                f"{student.id}\t{student.full_name}\t{student.phone_number or '-'}\t"
                f"coach={student.coach.user.email}\tarchived={bool(student.archived_at)}"
            )
        self.stdout.write(f"count={qs.count()}")
