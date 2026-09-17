import type { StudentProgramType } from "./studentProgram";

export type StudentPdfFileStatus = "failed" | "generating" | "pending" | "ready" | "rendering";

export interface StudentPdfFile {
  contentType: StudentProgramType;
  fileName: string;
  generatedAt: string;
  hasActiveShare?: boolean;
  id: string;
  programId: string;
  programTitle: string;
  programVersionId?: string;
  /** Raw share URL is only available immediately after createShare — never persisted. */
  shareUrl?: string;
  size: string;
  sizeBytes?: number;
  status: StudentPdfFileStatus;
  studentId: string;
  version: string;
}
