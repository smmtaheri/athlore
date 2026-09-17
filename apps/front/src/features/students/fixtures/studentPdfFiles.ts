import type { StudentPdfFile } from "../types/pdfFile";

export const studentPdfFileFixtures: StudentPdfFile[] = [
  {
    contentType: "complete",
    fileName: "برنامه_کامل_v1.2_محمد_طاهری.pdf",
    generatedAt: "۱۴۰۴/۰۲/۰۵ - ۱۸:۳۰",
    id: "pdf-mohammad-complete-v12",
    programId: "program-mohammad-complete-v12",
    programTitle: "چهارروزه حجم متوسط",
    size: "2.4 MB",
    status: "ready",
    studentId: "mohammad-taheri",
    version: "۱.۲"
  },
  {
    contentType: "nutrition",
    fileName: "برنامه_غذایی_v1.1_محمد_طاهری.pdf",
    generatedAt: "۱۴۰۴/۰۱/۰۸ - ۱۵:۲۰",
    id: "pdf-mohammad-nutrition-v11",
    programId: "program-mohammad-nutrition-v11",
    programTitle: "برنامه تغذیه ای هفته تا ۴",
    size: "1.8 MB",
    status: "ready",
    studentId: "mohammad-taheri",
    version: "۱.۱"
  },
  {
    contentType: "workout",
    fileName: "برنامه_تمرینی_v1.1_محمد_طاهری.pdf",
    generatedAt: "۱۴۰۴/۰۱/۰۳ - ۱۱:۰۵",
    id: "pdf-mohammad-workout-v11",
    programId: "program-mohammad-complete-v11",
    programTitle: "چهارروزه حجم متوسط",
    size: "1.2 MB",
    status: "ready",
    studentId: "mohammad-taheri",
    version: "۱.۱"
  },
  {
    contentType: "complete",
    fileName: "برنامه_کامل_v1.3_محمد_طاهری.pdf",
    generatedAt: "۱۴۰۴/۰۲/۱۰ - ۱۰:۱۵",
    id: "pdf-mohammad-complete-v13",
    programId: "program-mohammad-complete-v12",
    programTitle: "چهارروزه حجم متوسط",
    size: "-",
    status: "generating",
    studentId: "mohammad-taheri",
    version: "۱.۳"
  },
  {
    contentType: "supplement",
    fileName: "برنامه_مکمل_v1.0_محمد_طاهری.pdf",
    generatedAt: "۱۴۰۴/۰۱/۲۴ - ۱۸:۴۰",
    id: "pdf-mohammad-supplement-v10",
    programId: "program-mohammad-supplement-v10",
    programTitle: "برنامه مکمل عمومی",
    size: "-",
    status: "failed",
    studentId: "mohammad-taheri",
    version: "۱.۰"
  }
];
