import type { StudentProgramType } from "./studentProgram";
import type { ProgramPdfSection } from "../../programs/types/generatedProgram";

export type StudentPdfFileStatus = "failed" | "generating" | "pending" | "ready" | "rendering";

export interface StudentPdfFile {
  contentType: StudentProgramType;
  fileName: string;
  generatedAt: string;
  hasActiveShare?: boolean;
  id: string;
  programId: string;
  programDateRange?: string;
  programTitle: string;
  programVersionId?: string;
  section?: ProgramPdfSection | null;
  source?: "generated" | "uploaded";
  /** Raw share URL is only available immediately after createShare — never persisted. */
  shareUrl?: string;
  size: string;
  sizeBytes?: number;
  status: StudentPdfFileStatus;
  studentId: string;
  version: string;
}
