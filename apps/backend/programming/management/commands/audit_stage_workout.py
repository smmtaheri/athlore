"""Explicit Stage-only QA data creation; all SMS is mocked in this process only."""

import json
from unittest.mock import patch
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import CoachProfile
from delivery.services.artifacts import create_and_render
from programming.models import ProgramReadySms
from programming.services.preparation import prepare_from_visit
from programming.services.programs import (
    activate_version,
    finalize_version,
    serialize_student_program_detail,
)
from students.models import Student, StudentProfile, VisitFinalizedSms
from students.services import create_visit
from students.visit_form_services import finalize_visit


class Command(BaseCommand):
    help = (
        "Create a labelled QA athlete and publish a workout on Stage with process-local mock SMS."
    )

    def add_arguments(self, parser):
        parser.add_argument("--coach-id", required=True)
        parser.add_argument("--confirm-stage", action="store_true")
        parser.add_argument(
            "--available-catalog-split",
            action="store_true",
            help="Explicit chest/triceps and legs/shoulders QA split, not the automatic full-body policy.",
        )

    def handle(self, *args, **options):
        if not options["confirm_stage"] or not settings.PUBLIC_DOMAIN.startswith("stage."):
            raise CommandError(
                "This command writes labelled QA records. Pass --confirm-stage on Stage only."
            )
        coach = CoachProfile.objects.get(pk=options["coach_id"])
        with override_settings(
            SMS_BACKEND="mock",
            PROGRAM_READY_SMS_ENABLED=True,
            VISIT_FINALIZED_SMS_ENABLED=True,
            ALLOWED_HOSTS=["testserver"],
            SECURE_SSL_REDIRECT=False,
        ):
            with patch(
                "common.sms.http.client.HTTPSConnection",
                side_effect=AssertionError("SMS network forbidden"),
            ) as network:
                report = self.run_flow(coach, options["available_catalog_split"])
                report["sms_network_connections"] = network.call_count
                report["program_sms"] = list(
                    ProgramReadySms.objects.filter(version_id=report["version_id"]).values(
                        "status", "provider_message_id"
                    )
                )
                report["visit_sms"] = list(
                    VisitFinalizedSms.objects.filter(visit_id=report["visit_id"]).values(
                        "status", "provider_message_id"
                    )
                )
        self.stdout.write(json.dumps(report, ensure_ascii=False, default=str))

    @transaction.atomic
    def run_flow(self, coach, available_catalog_split=False):
        key = uuid4().hex[:10]
        user = get_user_model().objects.create_user(username=f"stage-qa-{key}")
        user.set_unusable_password()
        user.save(update_fields=["password"])
        student = Student.objects.create(
            coach=coach,
            full_name=f"QA — unified workout {key}",
            phone_number=f"+98999{int(key[:6], 16) % 10000000:07d}",
            age=28,
            gender="male",
            height_cm=180,
            weight_kg=80,
            goals={"primary_goal": "hypertrophy"},
            injuries={"has_injury": False},
            training_background={"level": "intermediate"},
            training_conditions={"training_days_per_week": 2, "session_duration_minutes": 60},
            equipment={"has_full_gym": True},
        )
        StudentProfile.objects.create(
            user=user, student=student, portal_enabled=True, account_activated_at=timezone.now()
        )
        athlete = APIClient()
        athlete.force_authenticate(user)
        response = athlete.post(
            "/api/v1/me/program-requests/",
            {
                "sections": ["workout"],
                "sessions_per_week": 2,
                "session_duration_minutes": 60,
                "assessment_mode": "in_person",
            },
            format="json",
        )
        if response.status_code != 201:
            raise CommandError(f"Request creation failed: {response.status_code} {response.data}")
        request_id = response.data["id"]
        visit = create_visit(
            coach,
            student,
            {
                "visit_date": timezone.localdate(),
                "current_weight_kg": 80,
                "previous_weight_kg": 80,
                "coach_notes": "QA private note — must not appear in athlete response",
                "program_settings": {
                    "sections": ["workout"],
                    "training_systems": [],
                    "duration_weeks": 4,
                    "exercise_variety": "varied",
                },
            },
            actor=coach.user,
        )
        from programming.models import ProgramRequest
        from programming.services.program_requests import start_request

        request = ProgramRequest.objects.get(pk=request_id)
        if available_catalog_split:
            visit.program_settings["session_muscles"] = [
                ["سینه", "پشت بازو"],
                ["چهارسر ران", "سرشانه"],
            ]
            visit.save(update_fields=["program_settings"])
        start_request(request=request, visit_id=visit.id, assessment_mode="in_person")
        finalize_visit(visit, actor=coach.user)
        program, run = prepare_from_visit(coach, coach.user, visit.id, f"qa-{key}")
        version = finalize_version(run.resulting_version, actor=coach.user)
        pdfs = [
            create_and_render(
                coach, program, version_id=version.id, user=coach.user, section="workout"
            )
        ]
        for pdf in pdfs:
            if pdf.status != "ready":
                raise CommandError("QA PDF rendering failed.")
        program = activate_version(program, version.id)
        request.refresh_from_db()
        if request.status != "fulfilled":
            raise CommandError("Request was not fulfilled after publication.")
        detail = athlete.get(f"/api/v1/me/programs/{program.id}/")
        if detail.status_code != 200 or "QA private note" in json.dumps(detail.data):
            raise CommandError("Student program access/privacy failed.")
        downloads = []
        for pdf in pdfs:
            download = athlete.get(f"/api/v1/me/pdf-files/{pdf.id}/download/")
            content = (
                b"".join(download.streaming_content) if download.streaming else download.content
            )
            if download.status_code != 200 or not content.startswith(b"%PDF"):
                raise CommandError("Student PDF download failed.")
            downloads.append({"id": str(pdf.id), "bytes": len(content)})
        return {
            "student_id": str(student.id),
            "request_id": str(request.id),
            "visit_id": str(visit.id),
            "program_id": str(program.id),
            "version_id": str(version.id),
            "request_status": request.status,
            "warnings": run.warnings,
            "training": serialize_student_program_detail(program)["training"],
            "downloads": downloads,
            "student_url": f"https://stage.student.athlore.ir/programs/{program.id}",
        }
