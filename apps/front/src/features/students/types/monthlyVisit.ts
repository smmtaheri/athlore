import type {
  VisitFormAnswers,
  VisitFormTemplateSnapshot,
  VisitStatus
} from "./visitForm";

export type VisitLevel = "low" | "medium" | "good" | "high";

export interface StudentVisitMeasurements {
  armCm?: number;
  chestCm?: number;
  hipCm?: number;
  thighCm?: number;
  waistCm?: number;
}

export interface StudentVisitAdherence {
  overallPercent: number;
  nutritionPercent: number;
  supplementsPercent: number;
  trainingPercent: number;
}

export interface StudentVisit {
  adherence: StudentVisitAdherence;
  answerSources?: Record<string, string>;
  answers: VisitFormAnswers;
  bodyFatPercentage?: number;
  bodyFeeling: string;
  coachAssessment: string;
  coachNotes: string;
  coachPrivateNotes: string;
  createdAt: string;
  currentWeightKg: number;
  dailyEnergyLevel: VisitLevel;
  expiresAt?: string | null;
  finalizedAt?: string | null;
  isExpired?: boolean;
  formTemplateId: string | null;
  formTemplateKey: string;
  formTemplateName: string;
  formTemplateSnapshot: VisitFormTemplateSnapshot;
  formTemplateVersion: number;
  hasNewInjury: boolean;
  id: string;
  measurements: StudentVisitMeasurements;
  newInjuryNotes: string;
  nextCycleGoal: string;
  previousWeightKg: number;
  sentAt?: string | null;
  sleepQuality: VisitLevel;
  status: VisitStatus;
  stressLevel: VisitLevel;
  studentFeedback: string;
  studentId: string;
  submittedByStudentAt?: string | null;
  trainingConditionChanges: string;
  updatedAt: string;
  visitDate: string;
}

export interface VisitAnswerRevision {
  actorId: string | null;
  createdAt: string;
  fieldKey: string;
  id: string;
  source: string;
  value: unknown;
}

export interface StudentActivateLoginResult {
  initialPassword?: string | null;
  portalAccess?: import("./student").StudentPortalAccess;
  purpose?: string;
  studentId: string;
  temporaryPassword?: string | null;
  username?: string | null;
}

export type StudentVisitInput = Omit<
  StudentVisit,
  | "answerSources"
  | "answers"
  | "coachPrivateNotes"
  | "createdAt"
  | "finalizedAt"
  | "formTemplateId"
  | "formTemplateKey"
  | "formTemplateName"
  | "formTemplateSnapshot"
  | "formTemplateVersion"
  | "id"
  | "status"
  | "studentId"
  | "submittedByStudentAt"
  | "updatedAt"
> & {
  answers?: VisitFormAnswers;
  coachPrivateNotes?: string;
  formTemplateId?: string | null;
  status?: VisitStatus;
};

export interface StudentVisitFormValues {
  armCm: string;
  bodyFatPercentage: string;
  bodyFeeling: string;
  chestCm: string;
  coachAssessment: string;
  coachNotes: string;
  coachPrivateNotes: string;
  currentWeightKg: string;
  dailyEnergyLevel: VisitLevel;
  hasNewInjury: boolean;
  hipCm: string;
  newInjuryNotes: string;
  nextCycleGoal: string;
  nutritionPercent: string;
  overallPercent: string;
  previousWeightKg: string;
  sleepQuality: VisitLevel;
  stressLevel: VisitLevel;
  studentFeedback: string;
  supplementsPercent: string;
  thighCm: string;
  trainingConditionChanges: string;
  trainingPercent: string;
  visitDate: string;
  waistCm: string;
}

export type StudentVisitFormField = keyof StudentVisitFormValues;
export type StudentVisitFormErrors = Partial<Record<StudentVisitFormField, string>>;
