import { apiDownload, apiRequest, apiUploadFormData } from "../../../shared/api/client";
import {
  bodyCheckCycleCreateToApi,
  bodyCheckCycleFromApi,
  bodyCheckCycleUpdateToApi,
  bodyCheckDashboardFromApi,
  bodyCheckDayFromApi,
  bodyCheckEntryInputToApi,
  bodyCheckPhotoFromApi
} from "../adapters/bodyCheckAdapters";
import type {
  BodyCheckCycle,
  BodyCheckCycleCreateInput,
  BodyCheckCycleUpdateInput,
  BodyCheckDashboardSnapshot,
  BodyCheckDay,
  BodyCheckEntryInput,
  BodyCheckPhoto
} from "../types/bodyCheck";

export interface StudentBodyCheckRepository {
  getActive(): Promise<{
    cycle: BodyCheckCycle | null;
    dashboard: BodyCheckDashboardSnapshot | null;
    history?: BodyCheckCycle[];
  }>;
  getDashboard(): Promise<BodyCheckDashboardSnapshot | null>;
  saveEntry(input: BodyCheckEntryInput): Promise<BodyCheckDay>;
  uploadPhoto(weekNumber: number, file: File): Promise<BodyCheckPhoto>;
  downloadPhoto(photoId: string): Promise<Blob>;
}

export interface CoachBodyCheckRepository {
  listCycles(studentId: string): Promise<BodyCheckCycle[]>;
  getCycle(studentId: string, cycleId: string): Promise<BodyCheckCycle>;
  createCycle(studentId: string, input: BodyCheckCycleCreateInput): Promise<BodyCheckCycle>;
  updateCycle(
    studentId: string,
    cycleId: string,
    input: BodyCheckCycleUpdateInput
  ): Promise<BodyCheckCycle>;
  closeCycle(studentId: string, cycleId: string): Promise<BodyCheckCycle>;
  suggestTargets(
    studentId: string,
    startingWeightKg: number,
    goalWeightKg: number
  ): Promise<number[]>;
  uploadPhoto(studentId: string, cycleId: string, weekNumber: number, file: File): Promise<BodyCheckPhoto>;
  deletePhoto(studentId: string, cycleId: string, photoId: string): Promise<void>;
  downloadPhoto(photoId: string): Promise<Blob>;
}

export function createStudentBodyCheckRepository(): StudentBodyCheckRepository {
  return {
    async getActive() {
      const dto = await apiRequest<Record<string, unknown>>("/me/body-check/");
      return {
        cycle: dto.cycle ? bodyCheckCycleFromApi(dto.cycle as Record<string, unknown>) : null,
        dashboard: bodyCheckDashboardFromApi(dto.dashboard as Record<string, unknown> | null),
        history: Array.isArray(dto.history)
          ? (dto.history as Record<string, unknown>[]).map(bodyCheckCycleFromApi)
          : []
      };
    },
    async getDashboard() {
      const dto = await apiRequest<Record<string, unknown> | null>("/me/body-check/dashboard/");
      return bodyCheckDashboardFromApi(dto);
    },
    async saveEntry(input) {
      const dto = await apiRequest<Record<string, unknown>>("/me/body-check/entries/", {
        method: "PUT",
        body: bodyCheckEntryInputToApi(input)
      });
      return bodyCheckDayFromApi(dto);
    },
    async uploadPhoto(weekNumber, file) {
      const form = new FormData();
      form.append("week_number", String(weekNumber));
      form.append("file", file);
      const dto = await apiUploadFormData<Record<string, unknown>>("/me/body-check/photos/", form);
      return bodyCheckPhotoFromApi(dto);
    },
    async downloadPhoto(photoId) {
      const result = await apiDownload(`/body-check/photos/${photoId}/download/`);
      return result.blob;
    }
  };
}

export function createCoachBodyCheckRepository(): CoachBodyCheckRepository {
  return {
    async listCycles(studentId) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/body-check/cycles/`
      );
      const results = (dto.results as Record<string, unknown>[]) || [];
      return results.map(bodyCheckCycleFromApi);
    },
    async getCycle(studentId, cycleId) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/body-check/cycles/${cycleId}/`
      );
      return bodyCheckCycleFromApi(dto);
    },
    async createCycle(studentId, input) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/body-check/cycles/`,
        { method: "POST", body: bodyCheckCycleCreateToApi(input) }
      );
      return bodyCheckCycleFromApi(dto);
    },
    async updateCycle(studentId, cycleId, input) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/body-check/cycles/${cycleId}/`,
        { method: "PATCH", body: bodyCheckCycleUpdateToApi(input) }
      );
      return bodyCheckCycleFromApi(dto);
    },
    async closeCycle(studentId, cycleId) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/body-check/cycles/${cycleId}/close/`,
        { method: "POST", body: {} }
      );
      return bodyCheckCycleFromApi(dto);
    },
    async suggestTargets(studentId, startingWeightKg, goalWeightKg) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/body-check/suggest-targets/`,
        {
          method: "POST",
          body: {
            starting_weight_kg: startingWeightKg,
            goal_weight_kg: goalWeightKg
          }
        }
      );
      return Array.isArray(dto.daily_targets_kg)
        ? (dto.daily_targets_kg as unknown[]).map((v) => Number(v))
        : [];
    },
    async uploadPhoto(studentId, cycleId, weekNumber, file) {
      const form = new FormData();
      form.append("week_number", String(weekNumber));
      form.append("file", file);
      const dto = await apiUploadFormData<Record<string, unknown>>(
        `/students/${studentId}/body-check/cycles/${cycleId}/photos/`,
        form
      );
      return bodyCheckPhotoFromApi(dto);
    },
    async deletePhoto(studentId, cycleId, photoId) {
      await apiRequest(`/students/${studentId}/body-check/cycles/${cycleId}/photos/${photoId}/`, {
        method: "DELETE"
      });
    },
    async downloadPhoto(photoId) {
      const result = await apiDownload(`/body-check/photos/${photoId}/download/`);
      return result.blob;
    }
  };
}

export const studentBodyCheckRepository = createStudentBodyCheckRepository();
export const coachBodyCheckRepository = createCoachBodyCheckRepository();
