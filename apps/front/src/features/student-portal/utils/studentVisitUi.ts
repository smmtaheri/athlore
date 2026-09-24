import type { StatusBadgeVariant } from "../../../components/ui";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import { formatVisitDatePersian } from "../../students/utils/visitDates";
import type { VisitStatus } from "../../students/types/visitForm";

export type StudentVisitFilter = "all" | "action" | "submitted" | "finalized" | "expired";

export function visitDisplayTitle(): string {
  return "ارزیابی ماهانه";
}

export function isVisitExpired(visit: StudentVisit): boolean {
  return Boolean(visit.isExpired);
}

export function isVisitOpenForStudent(visit: StudentVisit): boolean {
  return visit.status === "waiting_for_student" && !isVisitExpired(visit);
}

export function studentVisitStatusLabel(visit: StudentVisit): string {
  if (visit.status === "waiting_for_student" && isVisitExpired(visit)) {
    return "منقضی‌شده";
  }
  switch (visit.status) {
    case "waiting_for_student":
      return "در انتظار شما";
    case "student_submitted":
      return "ارسال‌شده";
    case "coach_review":
      return "در حال بررسی مربی";
    case "finalized":
      return "نهایی‌شده";
    case "draft":
      return "پیش‌نویس";
    default:
      return visit.status;
  }
}

export function studentVisitStatusVariant(visit: StudentVisit): StatusBadgeVariant {
  if (visit.status === "waiting_for_student" && isVisitExpired(visit)) {
    return "neutral";
  }
  switch (visit.status) {
    case "waiting_for_student":
      return "purple";
    case "student_submitted":
    case "coach_review":
      return "warning";
    case "finalized":
      return "success";
    default:
      return "neutral";
  }
}

export function matchesStudentVisitFilter(
  visit: StudentVisit,
  filter: StudentVisitFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "action":
      return isVisitOpenForStudent(visit);
    case "submitted":
      return visit.status === "student_submitted" || visit.status === "coach_review";
    case "finalized":
      return visit.status === "finalized";
    case "expired":
      return visit.status === "waiting_for_student" && isVisitExpired(visit);
    default:
      return true;
  }
}

export function summarizeStudentVisits(visits: StudentVisit[]) {
  const openActive = visits.filter(isVisitOpenForStudent);
  const submitted = visits.filter(
    (visit) => visit.status === "student_submitted" || visit.status === "coach_review"
  );
  const finalized = visits.filter((visit) => visit.status === "finalized");
  const expired = visits.filter(
    (visit) => visit.status === "waiting_for_student" && isVisitExpired(visit)
  );
  return { expired, finalized, openActive, submitted };
}

export function formatVisitDeadline(visit: StudentVisit): string | null {
  if (!visit.expiresAt) {
    return null;
  }
  try {
    return new Date(visit.expiresAt).toLocaleString("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return visit.expiresAt;
  }
}

export function formatVisitDate(visit: StudentVisit): string | null {
  return visit.visitDate?.trim() ? formatVisitDatePersian(visit.visitDate) : null;
}

export function visitActionLabel(visit: StudentVisit): string | null {
  if (isVisitOpenForStudent(visit)) {
    return "تکمیل ویزیت";
  }
  if (visit.status === "student_submitted") {
    return "در انتظار بررسی مربی";
  }
  if (visit.status === "coach_review") {
    return "در حال بررسی مربی";
  }
  if (visit.status === "finalized") {
    return "مشاهدهٔ جزئیات";
  }
  return "مشاهده";
}

/** Statuses the student portal may still surface; draft is excluded by API. */
export function isKnownStudentVisitStatus(status: VisitStatus): boolean {
  return (
    status === "waiting_for_student" ||
    status === "student_submitted" ||
    status === "coach_review" ||
    status === "finalized"
  );
}
