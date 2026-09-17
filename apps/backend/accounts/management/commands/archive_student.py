from __future__ import annotations

from django.core.management.base import BaseCommand

from accounts.admin_resolve import resolve_student
from students.services import archive_student


class Command(BaseCommand):
    help = "Archive a student."

    def add_arguments(self, parser):
        parser.add_argument("--student-id", required=True)

    def handle(self, *args, **options):
        student = resolve_student(student_id=options["student_id"])
        student = archive_student(student)
        self.stdout.write(self.style.WARNING(f"Archived student_id={student.id}"))
