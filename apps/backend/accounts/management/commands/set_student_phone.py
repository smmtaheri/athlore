from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from accounts.admin_resolve import resolve_student
from common.exceptions import ConflictError
from students.services import set_student_phone


class Command(BaseCommand):
    help = "Assign or correct a student phone number."

    def add_arguments(self, parser):
        parser.add_argument("--student-id", required=True)
        parser.add_argument("--phone", required=True)

    def handle(self, *args, **options):
        student = resolve_student(student_id=options["student_id"])
        try:
            student = set_student_phone(student, options["phone"])
        except ConflictError as exc:
            raise CommandError(f"{exc.default_code}: {exc.detail}") from exc
        self.stdout.write(
            self.style.SUCCESS(f"student_id={student.id} phone={student.phone_number}")
        )
