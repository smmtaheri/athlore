import type { StudentProgramSummary } from "../types/studentProgram";

const now = "2026-07-31T00:00:00.000Z";

export const studentProgramFixtures: StudentProgramSummary[] = [
  {
    createdAt: now,
    dateRange: "۱۴۰۴/۰۲/۱۰ تا ۱۴۰۴/۰۶/۱۰ (۱۲ هفته)",
    generatedAt: "۱۴۰۴/۰۲/۰۵",
    id: "program-mohammad-complete-v12",
    isCurrent: true,
    programType: "complete",
    status: "active",
    studentId: "mohammad-taheri",
    title: "چهارروزه حجم متوسط",
    updatedAt: now,
    version: "۱.۲"
  },
  {
    createdAt: now,
    dateRange: "۱۴۰۴/۰۲/۱۰ تا ۱۴۰۴/۰۳/۱۰ (۴ هفته)",
    generatedAt: "۱۴۰۴/۰۲/۰۵",
    id: "program-mohammad-nutrition-v11",
    isCurrent: false,
    programType: "nutrition",
    status: "ready",
    studentId: "mohammad-taheri",
    title: "برنامه تغذیه ای هفته تا ۴",
    updatedAt: now,
    version: "۱.۱"
  },
  {
    createdAt: now,
    dateRange: "۱۴۰۴/۰۲/۱۰ تا ۱۴۰۴/۰۶/۱۰ (۱۲ هفته)",
    generatedAt: "۱۴۰۴/۰۲/۰۵",
    id: "program-mohammad-supplement-v10",
    isCurrent: false,
    programType: "supplement",
    status: "ready",
    studentId: "mohammad-taheri",
    title: "برنامه مکمل عمومی",
    updatedAt: now,
    version: "۱.۰"
  },
  {
    createdAt: now,
    dateRange: "۱۴۰۴/۰۱/۲۵ تا ۱۴۰۴/۰۲/۱۰ (۲ هفته)",
    generatedAt: "۱۴۰۴/۰۱/۲۰",
    id: "program-mohammad-complete-v11",
    isCurrent: false,
    programType: "complete",
    status: "draft",
    studentId: "mohammad-taheri",
    title: "چهارروزه حجم متوسط",
    updatedAt: now,
    version: "۱.۱"
  },
  {
    createdAt: now,
    dateRange: "۱۴۰۴/۰۱/۱۵ تا ۱۴۰۴/۰۱/۲۵ (۲ هفته)",
    generatedAt: "۱۴۰۴/۰۱/۱۰",
    id: "program-mohammad-complete-v10",
    isCurrent: false,
    programType: "complete",
    status: "expired",
    studentId: "mohammad-taheri",
    title: "چهارروزه حجم متوسط",
    updatedAt: now,
    version: "۱.۰"
  }
];
