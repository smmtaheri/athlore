import type { StudentPdfFile } from "../../students/types/pdfFile";
import type { Student } from "../../students/types/student";
import type { StudentProgramSummary } from "../../students/types/studentProgram";
import type { StudentVisit } from "../../students/types/monthlyVisit";

export interface BodyCheckTodayItem {
  actualWeightKg: number | null;
  completion: {
    hasNutrition: boolean;
    hasSleep: boolean;
    hasWeight: boolean;
  };
  cycleId: string;
  isLogged: boolean;
  localDate: string;
  nutritionAdherenceScore: number | null;
  sleepDurationMinutes: number | null;
  sleepQualityScore: number | null;
  sleepStartTime: string | null;
  status: "logged" | "not_logged";
  studentId: string;
  studentName: string;
  targetWeightKg: number | null;
  weightDeltaKg: number | null;
  wakeTime: string | null;
}

export type BodyCheckCycleSummaryStatus =
  | "active"
  | "closed"
  | "expired"
  | "expiring_soon"
  | "no_active_cycle";

export interface BodyCheckCycleSummaryItem {
  cycleId: string | null;
  daysRemaining: number | null;
  endDate: string | null;
  startDate: string | null;
  status: BodyCheckCycleSummaryStatus;
  studentId: string;
  studentName: string;
}

export interface BodyCheckCycleSummary {
  active: number;
  expiringSoon: number;
  expired: number;
  items: BodyCheckCycleSummaryItem[];
  withoutActiveCycle: number;
}

export type MonthlyVisitStatus =
  | "not_sent"
  | "waiting_for_student"
  | "student_submitted"
  | "coach_review"
  | "finalized";

export type MonthlyVisitDueState = "not_due" | "due_soon" | "overdue";

export interface MonthlyVisitSummaryItem {
  daysUntilDue: number | null;
  dueDate: string | null;
  dueState: MonthlyVisitDueState;
  lastVisitDate: string | null;
  status: MonthlyVisitStatus;
  studentId: string;
  studentName: string;
  visitDate: string | null;
  visitId: string | null;
}

export interface MonthlyVisitSummary {
  activeStudents: number;
  asOf: string;
  coachReview: number;
  dueSoon: number;
  finalized: number;
  items: MonthlyVisitSummaryItem[];
  month: string;
  notSent: number;
  overdue: number;
  sent: number;
  studentSubmitted: number;
}

export interface DashboardMetrics {
  activeStudents: number;
  asOf: string;
  bodyCheckCycles: BodyCheckCycleSummary;
  bodyCheckToday: BodyCheckTodayItem[];
  draftPrograms: number;
  finalPrograms: number;
  followUpStudents: Student[];
  latestPrograms: StudentProgramSummary[];
  latestVisits: StudentVisit[];
  monthlyVisits: MonthlyVisitSummary;
  overdueVisits: Student[];
  pdfFilesFailed?: number;
  pdfFilesPending?: number;
  pdfGenerationAvailable?: boolean;
  readyPdfFiles: number;
  thisMonthVisits: number;
  todayTasks: string[];
  totalStudents: number;
}

export function calculateDashboardMetrics({
  pdfFiles,
  programs,
  students,
  visits
}: {
  pdfFiles: StudentPdfFile[];
  programs: StudentProgramSummary[];
  students: Student[];
  visits: StudentVisit[];
}): DashboardMetrics {
  const latestVisits = [...visits].sort(compareByUpdatedAt).slice(0, 5);
  const latestPrograms = [...programs].sort(compareByUpdatedAt).slice(0, 5);
  const studentsWithVisit = new Set(visits.map((visit) => visit.studentId));
  const overdueVisits = students
    .filter((student) => student.status === "active" && !studentsWithVisit.has(student.id))
    .slice(0, 5);
  const followUpStudents = students
    .filter(
      (student) =>
        student.injuries.hasInjury ||
        student.summary.medicalNote !== "بدون محدودیت" ||
        student.status === "inactive"
    )
    .slice(0, 5);

  return {
    activeStudents: students.filter((student) => student.status === "active").length,
    asOf: new Date().toISOString().slice(0, 10),
    bodyCheckCycles: {
      active: 0,
      expiringSoon: 0,
      expired: 0,
      items: [],
      withoutActiveCycle: students.length
    },
    bodyCheckToday: [],
    draftPrograms: programs.filter((program) => program.status === "draft").length,
    finalPrograms: programs.filter((program) => ["active", "ready"].includes(program.status))
      .length,
    followUpStudents,
    latestPrograms,
    latestVisits,
    monthlyVisits: emptyMonthlyVisitSummary(new Date().toISOString().slice(0, 10)),
    overdueVisits,
    readyPdfFiles: pdfFiles.filter((file) => file.status === "ready").length,
    thisMonthVisits: visits.length,
    todayTasks: [
      "مرور شاگردهای دارای محدودیت",
      "پیگیری برنامه‌های پیش نویس",
      "بررسی PDFهای در حال ساخت"
    ],
    totalStudents: students.length
  };
}

export function emptyMonthlyVisitSummary(asOf: string): MonthlyVisitSummary {
  return {
    activeStudents: 0,
    asOf,
    coachReview: 0,
    dueSoon: 0,
    finalized: 0,
    items: [],
    month: asOf.slice(0, 7),
    notSent: 0,
    overdue: 0,
    sent: 0,
    studentSubmitted: 0
  };
}

function compareByUpdatedAt(
  a: { createdAt?: string; updatedAt?: string },
  b: { createdAt?: string; updatedAt?: string }
) {
  return (
    Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "")
  );
}
