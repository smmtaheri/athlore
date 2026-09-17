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

export interface DashboardMetrics {
  activeStudents: number;
  asOf: string;
  bodyCheckToday: BodyCheckTodayItem[];
  draftPrograms: number;
  finalPrograms: number;
  followUpStudents: Student[];
  latestPrograms: StudentProgramSummary[];
  latestVisits: StudentVisit[];
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
    bodyCheckToday: [],
    draftPrograms: programs.filter((program) => program.status === "draft").length,
    finalPrograms: programs.filter((program) => ["active", "ready"].includes(program.status))
      .length,
    followUpStudents,
    latestPrograms,
    latestVisits,
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

function compareByUpdatedAt(
  a: { createdAt?: string; updatedAt?: string },
  b: { createdAt?: string; updatedAt?: string }
) {
  return (
    Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "")
  );
}
