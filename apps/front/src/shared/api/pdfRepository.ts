import { apiDownload, apiRequest } from "./client";
import { paginatedFromApi, pdfFileFromApi } from "../adapters/apiAdapters";
import type { StudentPdfFilesRepository } from "../../features/students/services/studentPdfFilesRepository";
import { triggerBrowserDownload } from "./exportPdf";

export function createApiStudentPdfFilesRepository(): StudentPdfFilesRepository {
  return {
    async create(file) {
      const body: Record<string, unknown> = {
        file_name: file.fileName
      };
      if (file.programVersionId) {
        body.program_version_id = file.programVersionId;
      }
      const dto = await apiRequest<Record<string, unknown>>(
        `/programs/${file.programId}/pdf-files/`,
        { method: "POST", body }
      );
      return pdfFileFromApi(dto);
    },
    async createForProgram(programId, options = {}) {
      const body: Record<string, unknown> = {
        delivery_outputs: options.deliveryOutputs ?? "pair"
      };
      if (options.fileName) body.file_name = options.fileName;
      if (options.programVersionId) body.program_version_id = options.programVersionId;
      const dto = await apiRequest<Record<string, unknown>>(`/programs/${programId}/pdf-files/`, {
        method: "POST",
        body
      });
      const artifactsRaw = Array.isArray(dto.artifacts) ? dto.artifacts : null;
      if (artifactsRaw && artifactsRaw.length > 0) {
        const artifacts = artifactsRaw.map((item) =>
          pdfFileFromApi(item as Record<string, unknown>)
        );
        return { artifacts, count: artifacts.length };
      }
      return pdfFileFromApi(dto);
    },
    async list() {
      return [];
    },
    async listByStudent(studentId) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${studentId}/pdf-files/`, {
        query: { limit: 100, offset: 0, ordering: "-created_at" }
      });
      return paginatedFromApi(dto, pdfFileFromApi).results;
    },
    async listByProgram(programId) {
      const dto = await apiRequest<Record<string, unknown>>(`/programs/${programId}/pdf-files/`, {
        query: { limit: 100, offset: 0, ordering: "-created_at" }
      });
      return paginatedFromApi(dto, pdfFileFromApi).results;
    },
    async regenerate(fileId) {
      const dto = await apiRequest<Record<string, unknown>>(`/pdf-files/${fileId}/regenerate/`, {
        method: "POST",
        body: {}
      });
      return pdfFileFromApi(dto);
    },
    async remove(fileId) {
      await apiRequest(`/pdf-files/${fileId}/`, { method: "DELETE" });
    },
    async rename(fileId, fileName) {
      const dto = await apiRequest<Record<string, unknown>>(`/pdf-files/${fileId}/`, {
        method: "PATCH",
        body: { file_name: fileName }
      });
      return pdfFileFromApi(dto);
    },
    async reset() {
      return [];
    },
    async download(fileId, fallbackName = "program.pdf") {
      const result = await apiDownload(`/pdf-files/${fileId}/download/`);
      triggerBrowserDownload(result.blob, result.filename || fallbackName);
      return result;
    },
    async createShare(fileId, options = {}) {
      const body: Record<string, unknown> = {};
      if (options.expiresInDays != null) {
        body.expires_in_days = options.expiresInDays;
      }
      const dto = await apiRequest<{
        share_url: string;
        token: string;
        expires_at: string;
        id: string;
      }>(`/pdf-files/${fileId}/share/`, { method: "POST", body });
      return {
        shareUrl: dto.share_url,
        token: dto.token,
        expiresAt: dto.expires_at,
        id: dto.id
      };
    },
    async revokeShare(fileId) {
      await apiRequest(`/pdf-files/${fileId}/share/`, { method: "DELETE" });
    }
  };
}
