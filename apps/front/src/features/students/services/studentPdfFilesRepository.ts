import { appConfig } from "../../../app/config/appConfig";
import { publicAbsoluteUrl } from "../../../app/config/appOrigin";
import { createApiStudentPdfFilesRepository } from "../../../shared/api/pdfRepository";
import { studentPdfFileFixtures } from "../fixtures/studentPdfFiles";
import type { StudentPdfFile } from "../types/pdfFile";

/**
 * Retired from active API mode (P3).
 * Kept only for explicit mock/test repositories (`MODE=test` or `VITE_USE_MOCK_API=true`).
 * Legacy browser data is intentionally left in place and is not auto-deleted.
 */
export const STUDENT_PDF_FILES_STORAGE_KEY = "coach-assistant.student-pdf-files.v1";

export interface PdfShareCreateResult {
  expiresAt: string;
  id: string;
  shareUrl: string;
  token: string;
}

export interface StudentPdfFilesRepository {
  create(file: StudentPdfFile): Promise<StudentPdfFile>;
  createForProgram?(
    programId: string,
    options?: {
      deliveryOutputs?: "pair" | "single";
      fileName?: string;
      programVersionId?: string;
    }
  ): Promise<StudentPdfFile | { artifacts: StudentPdfFile[]; count: number }>;
  createShare?(fileId: string, options?: { expiresInDays?: number }): Promise<PdfShareCreateResult>;
  download?(
    fileId: string,
    fallbackName?: string
  ): Promise<{ blob: Blob; filename: string | null }>;
  list?(): Promise<StudentPdfFile[]>;
  listByProgram?(programId: string): Promise<StudentPdfFile[]>;
  listByStudent(studentId: string): Promise<StudentPdfFile[]>;
  regenerate(fileId: string): Promise<StudentPdfFile>;
  remove(fileId: string): Promise<void>;
  rename(fileId: string, fileName: string): Promise<StudentPdfFile>;
  reset(): Promise<StudentPdfFile[]>;
  revokeShare?(fileId: string): Promise<void>;
}

function cloneFiles(files: StudentPdfFile[]): StudentPdfFile[] {
  return files.map((file) => ({ ...file }));
}

function isPdfFileArray(value: unknown): value is StudentPdfFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as StudentPdfFile).id === "string" &&
        typeof (item as StudentPdfFile).studentId === "string"
    )
  );
}

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

export function createStudentPdfFilesRepository(storage = getStorage()): StudentPdfFilesRepository {
  const read = (): StudentPdfFile[] => {
    if (!storage) {
      return cloneFiles(studentPdfFileFixtures);
    }

    const raw = storage.getItem(STUDENT_PDF_FILES_STORAGE_KEY);

    if (!raw) {
      const initialFiles = cloneFiles(studentPdfFileFixtures);
      storage.setItem(STUDENT_PDF_FILES_STORAGE_KEY, JSON.stringify(initialFiles));
      return initialFiles;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (isPdfFileArray(parsed)) {
        return cloneFiles(parsed);
      }
    } catch {
      // Invalid local data should never leak into UI state.
    }

    const fallbackFiles = cloneFiles(studentPdfFileFixtures);
    storage.setItem(STUDENT_PDF_FILES_STORAGE_KEY, JSON.stringify(fallbackFiles));
    return fallbackFiles;
  };

  const write = (files: StudentPdfFile[]) => {
    if (storage) {
      storage.setItem(STUDENT_PDF_FILES_STORAGE_KEY, JSON.stringify(files));
    }
  };

  return {
    async create(file) {
      const files = read();
      const nextFile = { ...file };
      const nextFiles = [nextFile, ...files.filter((item) => item.id !== file.id)];
      write(nextFiles);
      return cloneFiles([nextFile])[0];
    },
    async createForProgram(programId, options = {}) {
      if ((options.deliveryOutputs ?? "pair") === "pair") {
        const training: StudentPdfFile = {
          contentType: "workout",
          fileName: "mock_تمرین_v1.pdf",
          generatedAt: new Date().toLocaleString("fa-IR"),
          id: `pdf-mock-train-${programId}-${Date.now()}`,
          programId,
          programTitle: "Mock program",
          programVersionId: options.programVersionId,
          size: "mock",
          status: "ready",
          studentId: "mock-student",
          version: "v1"
        };
        const nutrition: StudentPdfFile = {
          contentType: "nutrition",
          fileName: "mock_تغذیه_مکمل_v1.pdf",
          generatedAt: new Date().toLocaleString("fa-IR"),
          id: `pdf-mock-nutrition-${programId}-${Date.now()}`,
          programId,
          programTitle: "Mock program",
          programVersionId: options.programVersionId,
          size: "mock",
          status: "ready",
          studentId: "mock-student",
          version: "v1"
        };
        await this.create(training);
        await this.create(nutrition);
        return { artifacts: [training, nutrition], count: 2 };
      }
      const file: StudentPdfFile = {
        contentType: "complete",
        fileName: options.fileName || "program.pdf",
        generatedAt: new Date().toLocaleString("fa-IR"),
        id: `pdf-mock-${programId}-${Date.now()}`,
        programId,
        programTitle: "Mock program",
        programVersionId: options.programVersionId,
        size: "mock",
        status: "ready",
        studentId: "mock-student",
        version: "v1"
      };
      return this.create(file);
    },
    async list() {
      return read();
    },
    async listByStudent(studentId) {
      return read().filter((file) => file.studentId === studentId);
    },
    async listByProgram(programId) {
      return read().filter((file) => file.programId === programId);
    },
    async regenerate(fileId) {
      const files = read();
      const index = files.findIndex((file) => file.id === fileId);

      if (index === -1) {
        throw new Error("PDF file was not found.");
      }

      const updatedFile: StudentPdfFile = {
        ...files[index],
        size: "-",
        status: "generating"
      };
      const nextFiles = [...files];
      nextFiles[index] = updatedFile;
      write(nextFiles);
      return cloneFiles([updatedFile])[0];
    },
    async remove(fileId) {
      const files = read();
      const nextFiles = files.filter((file) => file.id !== fileId);

      if (nextFiles.length === files.length) {
        throw new Error("PDF file was not found.");
      }

      write(nextFiles);
    },
    async rename(fileId, fileName) {
      const files = read();
      const index = files.findIndex((file) => file.id === fileId);

      if (index === -1) {
        throw new Error("PDF file was not found.");
      }

      const updatedFile: StudentPdfFile = {
        ...files[index],
        fileName
      };
      const nextFiles = [...files];
      nextFiles[index] = updatedFile;
      write(nextFiles);
      return cloneFiles([updatedFile])[0];
    },
    async reset() {
      const initialFiles = cloneFiles(studentPdfFileFixtures);
      write(initialFiles);
      return initialFiles;
    },
    async download(fileId, fallbackName = "program.pdf") {
      const file = read().find((item) => item.id === fileId);
      if (!file || file.status !== "ready") {
        throw new Error("PDF is not ready.");
      }
      const blob = new Blob(["%PDF-1.4 mock"], { type: "application/pdf" });
      return { blob, filename: fallbackName };
    },
    async createShare(fileId) {
      const file = read().find((item) => item.id === fileId);
      if (!file) {
        throw new Error("PDF file was not found.");
      }
      const token = `mock-share-${fileId}`;
      const shareUrl = publicAbsoluteUrl(`/api/v1/shared/pdf/${token}`);
      const files = read().map((item) =>
        item.id === fileId ? { ...item, hasActiveShare: true, shareUrl } : item
      );
      write(files);
      return {
        id: `share-${fileId}`,
        shareUrl,
        token,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
      };
    },
    async revokeShare(fileId) {
      const files = read().map((item) =>
        item.id === fileId ? { ...item, hasActiveShare: false, shareUrl: undefined } : item
      );
      write(files);
    }
  };
}

export const studentPdfFilesRepository: StudentPdfFilesRepository = appConfig.useMockRepositories
  ? createStudentPdfFilesRepository()
  : createApiStudentPdfFilesRepository();
