from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.admin_resolve import resolve_coach, resolve_student
from delivery.models import PdfArtifact
from programming.models import GenerationRun, Program
from students.services import transfer_student


class Command(BaseCommand):
    help = "Transfer student ownership to another coach (explicit confirmation)."

    def add_arguments(self, parser):
        parser.add_argument("--student-id", required=True)
        parser.add_argument("--to-coach-email", default=None)
        parser.add_argument("--to-coach-id", default=None)
        parser.add_argument("--to-coach-phone", default=None)
        parser.add_argument("--yes", action="store_true")

    def handle(self, *args, **options):
        student = resolve_student(student_id=options["student_id"])
        new_coach = resolve_coach(
            coach_id=options["to_coach_id"],
            coach_email=options["to_coach_email"],
            coach_phone=options["to_coach_phone"],
        )
        old = student.coach
        self.stdout.write(f"student_id={student.id}")
        self.stdout.write(f"name={student.full_name}")
        self.stdout.write(f"phone={student.phone_number}")
        self.stdout.write(f"old_coach={old.user.email} ({old.id})")
        self.stdout.write(f"new_coach={new_coach.user.email} ({new_coach.id})")
        if not options["yes"]:
            answer = input("Type YES to confirm transfer: ").strip()
            if answer != "YES":
                raise CommandError("Transfer cancelled.")
        with transaction.atomic():
            transfer_student(student, new_coach)
            Program.objects.filter(student=student).update(coach=new_coach)
            GenerationRun.objects.filter(student=student).update(coach=new_coach)
            PdfArtifact.objects.filter(student=student).update(coach=new_coach)
        self.stdout.write(self.style.SUCCESS("Transfer complete"))
