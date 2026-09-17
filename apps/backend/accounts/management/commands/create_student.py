from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from accounts.admin_resolve import resolve_coach
from common.exceptions import ConflictError
from students.services import create_student


class Command(BaseCommand):
    help = "Create a student owned by an explicit coach."

    def add_arguments(self, parser):
        parser.add_argument("--coach-email", default=None)
        parser.add_argument("--coach-id", default=None)
        parser.add_argument("--coach-phone", default=None)
        parser.add_argument("--name", required=True)
        parser.add_argument("--phone", required=True)
        parser.add_argument("--age", type=int, default=27)
        parser.add_argument("--gender", default="male", choices=["male", "female"])
        parser.add_argument("--height-cm", type=Decimal, default=Decimal("175.0"))
        parser.add_argument("--weight-kg", type=Decimal, default=Decimal("75.0"))

    def handle(self, *args, **options):
        coach = resolve_coach(
            coach_id=options["coach_id"],
            coach_email=options["coach_email"],
            coach_phone=options["coach_phone"],
        )
        try:
            student = create_student(
                coach,
                {
                    "full_name": options["name"],
                    "phone_number": options["phone"],
                    "age": options["age"],
                    "gender": options["gender"],
                    "height_cm": options["height_cm"],
                    "weight_kg": options["weight_kg"],
                    "goals": {"primary_goal": "hypertrophy"},
                    "training_background": {"level": "intermediate"},
                    "training_conditions": {
                        "training_days_per_week": 4,
                        "session_duration_minutes": 60,
                    },
                },
            )
        except ConflictError as exc:
            raise CommandError(f"{exc.default_code}: {exc.detail}") from exc
        except Exception as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS("Student created"))
        self.stdout.write(f"student_id={student.id}")
        self.stdout.write(f"name={student.full_name}")
        self.stdout.write(f"phone={student.phone_number}")
        self.stdout.write(f"coach={coach.user.email}")
        self.stdout.write(f"archived={bool(student.archived_at)}")
