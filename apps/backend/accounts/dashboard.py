"""Coach-scoped dashboard aggregates for the Frontend home screen."""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone

from accounts.models import CoachProfile
from delivery.models import PdfArtifact
from programming.models import Program, ProgramVersion
from programming.services.programs import serialize_program_summary
from students import body_check_services as body_check_services
from students.body_check_models import BodyCheckCycle, BodyCheckDailyEntry
from students.models import Student, Visit
from students.serializers import StudentListSerializer, VisitSerializer

OVERDUE_VISIT_DAYS = 35
RECENT_LIMIT = 5


def _build_body_check_today(coach: CoachProfile, today: date) -> list[dict]:
    """Build the coach's today view without per-student queries."""
    cycles = list(
        BodyCheckCycle.objects.filter(
            coach=coach,
            status=BodyCheckCycle.Status.ACTIVE,
            student__archived_at__isnull=True,
        )
        .select_related("student")
        .order_by("student__full_name", "student_id")
    )
    cycle_ids = [cycle.id for cycle in cycles]
    entries = BodyCheckDailyEntry.objects.filter(cycle_id__in=cycle_ids, local_date=today)
    entries_by_cycle = {entry.cycle_id: entry for entry in entries}

    items: list[dict] = []
    for cycle in cycles:
        day = None
        if cycle.start_date <= today <= cycle.end_date:
            day = body_check_services.serialize_entry(
                entries_by_cycle.get(cycle.id),
                cycle=cycle,
                local_date=today,
            )

        items.append(
            {
                "cycle_id": str(cycle.id),
                "student_id": str(cycle.student_id),
                "student_name": cycle.student.full_name,
                "local_date": today.isoformat(),
                "status": day["status"] if day else "not_logged",
                "is_logged": bool(day and day["is_logged"]),
                "actual_weight_kg": day["actual_weight_kg"] if day else None,
                "target_weight_kg": day["target_weight_kg"] if day else None,
                "weight_delta_kg": day["weight_delta_kg"] if day else None,
                "sleep_duration_minutes": day["sleep_duration_minutes"] if day else None,
                "sleep_quality_score": day["sleep_quality_score"] if day else None,
                "nutrition_adherence_score": day["nutrition_adherence_score"] if day else None,
            }
        )

    # Unlogged students need attention first; keep names deterministic within each group.
    return sorted(items, key=lambda item: (item["is_logged"], item["student_name"]))


def build_dashboard(coach: CoachProfile, *, today: date | None = None) -> dict:
    """Return deterministic coach-scoped dashboard payload."""
    today = today or timezone.localdate()
    month_start = today.replace(day=1)
    if month_start.month == 12:
        next_month = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month = month_start.replace(month=month_start.month + 1)
    overdue_cutoff = today - timedelta(days=OVERDUE_VISIT_DAYS)

    students_qs = Student.objects.filter(coach=coach, archived_at__isnull=True)
    student_counts = students_qs.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status=Student.Status.ACTIVE)),
        inactive=Count("id", filter=Q(status=Student.Status.INACTIVE)),
    )
    archived_students = Student.objects.filter(coach=coach, archived_at__isnull=False).count()

    visits_qs = Visit.objects.filter(coach=coach)
    this_month_visits = visits_qs.filter(
        visit_date__gte=month_start,
        visit_date__lt=next_month,
    ).count()

    overdue_students = list(
        students_qs.filter(status=Student.Status.ACTIVE)
        .filter(
            Q(summary_last_visit_date__isnull=True) | Q(summary_last_visit_date__lt=overdue_cutoff)
        )
        .order_by("summary_last_visit_date", "full_name")[:RECENT_LIMIT]
    )

    follow_up_students = list(
        students_qs.filter(Q(status=Student.Status.INACTIVE) | ~Q(summary_medical_note=""))
        .exclude(summary_medical_note="بدون محدودیت")
        .order_by("-updated_at")[: RECENT_LIMIT * 2]
    )
    # Injuries JSON key lookup differs by DB backend; also include has_injury in Python.
    injury_followups = [
        s
        for s in students_qs.order_by("-updated_at")[:50]
        if bool((s.injuries or {}).get("has_injury"))
    ]
    seen = {s.id for s in follow_up_students}
    for student in injury_followups:
        if student.id not in seen:
            follow_up_students.append(student)
            seen.add(student.id)
        if len(follow_up_students) >= RECENT_LIMIT:
            break
    follow_up_students = follow_up_students[:RECENT_LIMIT]

    programs_qs = Program.objects.filter(coach=coach)
    archived_programs = programs_qs.filter(archived_at__isnull=False).count()
    live_programs = programs_qs.filter(archived_at__isnull=True)

    draft_programs = (
        live_programs.filter(versions__status=ProgramVersion.Status.DRAFT).distinct().count()
    )
    finalized_programs = (
        live_programs.filter(versions__status=ProgramVersion.Status.FINALIZED).distinct().count()
    )
    active_programs = live_programs.filter(active_version__isnull=False).count()

    latest_programs = list(
        live_programs.select_related("student", "active_version").order_by("-updated_at")[
            :RECENT_LIMIT
        ]
    )
    latest_visits = list(
        visits_qs.select_related("student").order_by("-visit_date", "-updated_at")[:RECENT_LIMIT]
    )

    today_tasks: list[str] = []
    if overdue_students:
        today_tasks.append(f"پیگیری ویزیت عقب‌افتاده: {overdue_students[0].full_name}")
    if draft_programs:
        today_tasks.append(f"مرور {draft_programs} برنامه پیش‌نویس")
    if follow_up_students:
        today_tasks.append(f"پیگیری وضعیت: {follow_up_students[0].full_name}")
    if not today_tasks:
        today_tasks.append("هیچ کار فوری ثبت نشده است")

    pdf_qs = PdfArtifact.objects.filter(coach=coach, deleted_at__isnull=True)
    pdf_ready = pdf_qs.filter(status=PdfArtifact.Status.READY).count()
    pdf_pending = pdf_qs.filter(
        status__in=[PdfArtifact.Status.PENDING, PdfArtifact.Status.RENDERING]
    ).count()
    pdf_failed = pdf_qs.filter(status=PdfArtifact.Status.FAILED).count()

    return {
        "total_students": student_counts["total"] or 0,
        "active_students": student_counts["active"] or 0,
        "inactive_students": student_counts["inactive"] or 0,
        "archived_students": archived_students,
        "this_month_visits": this_month_visits,
        "draft_programs": draft_programs,
        "final_programs": finalized_programs,
        "active_programs": active_programs,
        "archived_programs": archived_programs,
        "pdf_files_ready": pdf_ready,
        "ready_pdf_files": pdf_ready,
        "pdf_files_pending": pdf_pending,
        "pdf_files_failed": pdf_failed,
        "pdf_generation_available": True,
        "overdue_visit_days": OVERDUE_VISIT_DAYS,
        "latest_visits": VisitSerializer(latest_visits, many=True).data,
        "latest_programs": [serialize_program_summary(p) for p in latest_programs],
        "overdue_visits": StudentListSerializer(overdue_students, many=True).data,
        "follow_up_students": StudentListSerializer(follow_up_students, many=True).data,
        "body_check_today": _build_body_check_today(coach, today),
        "today_tasks": today_tasks,
        "as_of": today.isoformat(),
    }
