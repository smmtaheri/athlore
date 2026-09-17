export type StudentProgramStatus = "active" | "archived" | "draft" | "expired" | "ready";

export type StudentProgramType = "complete" | "nutrition" | "supplement" | "workout";

export interface StudentProgramSummary {
  createdAt: string;
  dateRange: string;
  generatedAt: string;
  id: string;
  isCurrent: boolean;
  programType: StudentProgramType;
  status: StudentProgramStatus;
  studentId: string;
  title: string;
  updatedAt: string;
  version: string;
}
