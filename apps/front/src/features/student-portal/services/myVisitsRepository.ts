import { apiRequest } from "../../../shared/api/client";
import { visitFromApi } from "../../../shared/adapters/apiAdapters";
import { paginatedFromApi } from "../../../shared/adapters/apiAdapters";
import type { VisitFormAnswers } from "../../students/types/visitForm";
import type { StudentVisit } from "../../students/types/monthlyVisit";

export interface MyVisitsRepository {
  getById(visitId: string): Promise<StudentVisit | null>;
  list(): Promise<StudentVisit[]>;
  submit(visitId: string): Promise<StudentVisit>;
  updateAnswers(visitId: string, answers: VisitFormAnswers): Promise<StudentVisit>;
}

export function createMyVisitsRepository(): MyVisitsRepository {
  return {
    async list() {
      const dto = await apiRequest<Record<string, unknown>>("/me/visits/", {
        query: { limit: 100, offset: 0 }
      });
      return paginatedFromApi(dto, visitFromApi).results;
    },
    async getById(visitId) {
      try {
        const dto = await apiRequest<Record<string, unknown>>(`/me/visits/${visitId}/`);
        return visitFromApi(dto);
      } catch (error) {
        if ((error as { code?: string }).code === "not_found") {
          return null;
        }
        throw error;
      }
    },
    async updateAnswers(visitId, answers) {
      const dto = await apiRequest<Record<string, unknown>>(`/me/visits/${visitId}/`, {
        method: "PATCH",
        body: { answers }
      });
      return visitFromApi(dto);
    },
    async submit(visitId) {
      const dto = await apiRequest<Record<string, unknown>>(`/me/visits/${visitId}/submit/`, {
        method: "POST",
        body: {}
      });
      return visitFromApi(dto);
    }
  };
}

export const myVisitsRepository = createMyVisitsRepository();
