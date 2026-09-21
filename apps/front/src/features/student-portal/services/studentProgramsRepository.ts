import { apiDownload, apiRequest } from "../../../shared/api/client";
import {
  paginatedFromApi,
  pdfFileFromApi,
  programDetailFromApi,
  programSummaryFromApi
} from "../../../shared/adapters/apiAdapters";
import { triggerBrowserDownload } from "../../../shared/api/exportPdf";
import type { GeneratedProgram } from "../../programs/types/generatedProgram";
import type { StudentPdfFile } from "../../students/types/pdfFile";
import type { StudentProgramSummary } from "../../students/types/studentProgram";

export interface StudentProgramsRepository {
  list(): Promise<StudentProgramSummary[]>;
  getById(programId: string): Promise<GeneratedProgram | null>;
  listPdfFiles(programId: string): Promise<StudentPdfFile[]>;
  createPdfFiles(programId: string): Promise<StudentPdfFile[]>;
  downloadPdf(fileId: string, fallbackName?: string): Promise<void>;
}

export function createStudentProgramsRepository(): StudentProgramsRepository {
  return {
    async list() {
      const dto = await apiRequest<Record<string, unknown>>("/me/programs/", {
        query: { limit: 100, offset: 0 }
      });
      return paginatedFromApi(dto, programSummaryFromApi).results;
    },
    async getById(programId) {
      try {
        const dto = await apiRequest<Record<string, unknown>>(`/me/programs/${programId}/`);
        return programDetailFromApi(dto);
      } catch (error) {
        if ((error as { code?: string }).code === "not_found") {
          return null;
        }
        throw error;
      }
    },
    async listPdfFiles(programId) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/me/programs/${programId}/pdf-files/`,
        { query: { limit: 100, offset: 0, ordering: "-created_at" } }
      );
      return paginatedFromApi(dto, pdfFileFromApi).results;
    },
    async createPdfFiles(programId) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/me/programs/${programId}/pdf-files/`,
        { method: "POST", body: {} }
      );
      return Array.isArray(dto.artifacts)
        ? (dto.artifacts as Record<string, unknown>[]).map(pdfFileFromApi)
        : [pdfFileFromApi(dto)];
    },
    async downloadPdf(fileId, fallbackName = "program.pdf") {
      const result = await apiDownload(`/me/pdf-files/${fileId}/download/`);
      triggerBrowserDownload(result.blob, result.filename || fallbackName);
    }
  };
}

export const studentProgramsRepository = createStudentProgramsRepository();
