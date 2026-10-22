export type ProgramRequestSection = "workout" | "nutrition" | "supplement";
export type ProgramRequestStatus =
  "submitted" | "awaiting_info" | "in_progress" | "fulfilled" | "cancelled";
export type ProgramRequestPurpose = "first" | "next" | "revision";
export type ProgramAssessmentMode = "online" | "in_person" | "none";

export interface ProgramRequest {
  assessmentMode: ProgramAssessmentMode;
  coachNotes: string;
  completedSections: ProgramRequestSection[];
  createdAt: string;
  fulfilledAt: string | null;
  goal: string;
  id: string;
  injuryNotes: string;
  nutritionNotes: string;
  profileSnapshot: Record<string, unknown>;
  programIds: string[];
  purpose: ProgramRequestPurpose;
  readAt: string | null;
  sections: ProgramRequestSection[];
  sessionsPerWeek: number | null;
  sleepNotes: string;
  startedAt: string | null;
  status: ProgramRequestStatus;
  studentId: string;
  studentName: string;
  trainingEnvironment: string;
  trainingTimeNotes: string;
  updatedAt: string;
  visitId: string | null;
}

export interface ProgramRequestDraft {
  assessmentMode: ProgramAssessmentMode;
  goal: string;
  injuryNotes: string;
  nutritionNotes: string;
  purpose: ProgramRequestPurpose;
  sections: ProgramRequestSection[];
  sessionsPerWeek: number | null;
  sleepNotes: string;
  trainingEnvironment: string;
  trainingTimeNotes: string;
}

export interface ProgramRequestRepository {
  cancelCoach(id: string): Promise<ProgramRequest>;
  cancelMine(id: string): Promise<ProgramRequest>;
  createMine(draft: ProgramRequestDraft): Promise<ProgramRequest>;
  getDefaults(): Promise<ProgramRequestDraft>;
  getCoach(id: string): Promise<ProgramRequest>;
  listCoach(): Promise<{ count: number; items: ProgramRequest[]; unreadCount: number }>;
  listMine(): Promise<ProgramRequest[]>;
  markCoachQueueRead(ids: string[]): Promise<void>;
  startCoach(
    id: string,
    assessmentMode: ProgramAssessmentMode,
    visitId?: string
  ): Promise<ProgramRequest>;
}
