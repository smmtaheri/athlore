import { apiRequest } from "../../../shared/api/client";
import type {
  ProgramAssessmentMode,
  ProgramRequest,
  ProgramRequestDraft,
  ProgramRequestRepository,
  ProgramRequestSection,
  ProgramRequestStatus
} from "../types/programRequest";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mapRequest(value: unknown): ProgramRequest {
  const dto = record(value);
  const sections = Array.isArray(dto.sections) ? dto.sections : [];
  const completed = Array.isArray(dto.completed_sections) ? dto.completed_sections : [];
  return {
    assessmentMode: String(dto.assessment_mode ?? "online") as ProgramAssessmentMode,
    coachNotes: String(dto.coach_notes ?? ""),
    completedSections: completed.map(String) as ProgramRequestSection[],
    createdAt: String(dto.created_at ?? ""),
    fulfilledAt: dto.fulfilled_at == null ? null : String(dto.fulfilled_at),
    goal: String(dto.goal ?? ""),
    id: String(dto.id ?? ""),
    injuryNotes: String(dto.injury_notes ?? ""),
    nutritionNotes: String(dto.nutrition_notes ?? ""),
    profileSnapshot: record(dto.profile_snapshot),
    programIds: Array.isArray(dto.program_ids) ? dto.program_ids.map(String) : [],
    purpose: String(dto.purpose ?? "next") as ProgramRequest["purpose"],
    readAt: dto.read_at == null ? null : String(dto.read_at),
    sections: sections.map(String) as ProgramRequestSection[],
    sessionsPerWeek: dto.sessions_per_week == null ? null : Number(dto.sessions_per_week),
    sleepNotes: String(dto.sleep_notes ?? ""),
    startedAt: dto.started_at == null ? null : String(dto.started_at),
    status: String(dto.status ?? "submitted") as ProgramRequestStatus,
    studentId: String(dto.student_id ?? ""),
    studentName: String(dto.student_name ?? ""),
    trainingEnvironment: String(dto.training_environment ?? ""),
    trainingTimeNotes: String(dto.training_time_notes ?? ""),
    updatedAt: String(dto.updated_at ?? ""),
    visitId: dto.visit_id == null ? null : String(dto.visit_id)
  };
}

function toApi(draft: ProgramRequestDraft) {
  return {
    assessment_mode: draft.assessmentMode,
    goal: draft.goal,
    injury_notes: draft.injuryNotes,
    nutrition_notes: draft.nutritionNotes,
    purpose: draft.purpose,
    sections: draft.sections,
    sessions_per_week: draft.sessionsPerWeek,
    sleep_notes: draft.sleepNotes,
    training_environment: draft.trainingEnvironment,
    training_time_notes: draft.trainingTimeNotes
  };
}

export function createApiProgramRequestRepository(): ProgramRequestRepository {
  return {
    async cancelMine(id) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/me/program-requests/${encodeURIComponent(id)}/cancel/`,
        { method: "POST" }
      );
      return mapRequest(dto);
    },
    async cancelCoach(id) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/program-requests/${encodeURIComponent(id)}/cancel/`,
        { method: "POST" }
      );
      return mapRequest(dto);
    },
    async getDefaults() {
      const dto = await apiRequest<Record<string, unknown>>("/me/program-request-defaults/");
      return {
        assessmentMode: String(dto.assessment_mode ?? "online") as ProgramAssessmentMode,
        goal: String(dto.goal ?? ""),
        injuryNotes: String(dto.injury_notes ?? ""),
        nutritionNotes: String(dto.nutrition_notes ?? ""),
        purpose: String(dto.purpose ?? "next") as ProgramRequestDraft["purpose"],
        sections: Array.isArray(dto.sections)
          ? (dto.sections.map(String) as ProgramRequestSection[])
          : ["workout"],
        sessionsPerWeek: dto.sessions_per_week == null ? null : Number(dto.sessions_per_week),
        sleepNotes: String(dto.sleep_notes ?? ""),
        trainingEnvironment: String(dto.training_environment ?? ""),
        trainingTimeNotes: String(dto.training_time_notes ?? "")
      };
    },
    async listMine() {
      const dto = await apiRequest<Record<string, unknown>>("/me/program-requests/");
      return Array.isArray(dto.results) ? dto.results.map(mapRequest) : [];
    },
    async createMine(draft) {
      const dto = await apiRequest<Record<string, unknown>>("/me/program-requests/", {
        method: "POST",
        body: toApi(draft)
      });
      return mapRequest(dto);
    },
    async listCoach() {
      const dto = await apiRequest<Record<string, unknown>>("/program-requests/?status=open");
      return {
        count: Number(dto.count ?? 0),
        items: Array.isArray(dto.results) ? dto.results.map(mapRequest) : [],
        unreadCount: Number(dto.unread_count ?? 0)
      };
    },
    async markCoachQueueRead(ids) {
      await apiRequest<Record<string, unknown>>("/program-requests/mark-read/", {
        method: "POST",
        body: { ids }
      });
    },
    async getCoach(id) {
      const dto = await apiRequest<Record<string, unknown>>(`/program-requests/${id}/`);
      return mapRequest(dto);
    },
    async startCoach(id, assessmentMode, visitId) {
      const dto = await apiRequest<Record<string, unknown>>(`/program-requests/${id}/start/`, {
        method: "POST",
        body: {
          assessment_mode: assessmentMode,
          ...(visitId ? { visit_id: visitId } : {})
        }
      });
      return mapRequest(dto);
    }
  };
}

export const programRequestRepository = createApiProgramRequestRepository();
