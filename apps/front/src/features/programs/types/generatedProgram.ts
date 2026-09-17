import type { StudentProgramStatus, StudentProgramType } from "../../students/types/studentProgram";

export type GeneratedProgramStatus = Extract<
  StudentProgramStatus,
  "active" | "archived" | "draft" | "ready"
>;

export type ProgramPreviewTab = "training" | "nutrition" | "supplements" | "pdf";

export interface TrainingExercise {
  id: string;
  name: string;
  notes: string;
  order: number;
  rest: string;
  rpe: string;
  sets: number;
  targetMuscle: string;
  reps: string;
  rawPrescription?: string;
  selectionSource?: string;
  supersetGroupId?: string | null;
  supersetWithPrevious?: boolean;
  supersetPartnerName?: string | null;
}

export interface TrainingDay {
  exercises: TrainingExercise[];
  id: string;
  notes: string;
  order: number;
  targetMuscles: string[];
  title: string;
}

export interface TrainingProgram {
  days: TrainingDay[];
  summary: string;
}

export interface NutritionFood {
  amount: string;
  alternatives: string;
  id: string;
  name: string;
}

export interface NutritionMeal {
  foods: NutritionFood[];
  id: string;
  notes: string;
  order: number;
  title: string;
}

export interface NutritionProgram {
  dailyWater: string;
  meals: NutritionMeal[];
  notes: string;
}

export interface SupplementItem {
  amount: string;
  id: string;
  name: string;
  notes: string;
  order: number;
  timing: string;
}

export interface SupplementPlan {
  items: SupplementItem[];
  medicalNote: string;
  summary: string;
}

export interface ProgramPdfSettings {
  contactInfo: string;
  fileTitle: string;
  includeCoachName: boolean;
  includeCoachNotes: boolean;
  includeNutrition: boolean;
  includeStudentName: boolean;
  includeSupplements: boolean;
  includeTraining: boolean;
  pageSize: "A4";
  style: "simple" | "modern" | "colorful";
}

/**
 * Exercise selection reasoning surfaced from the generator/generation-run.
 * All fields are best-effort — the generator does not (yet) report every
 * category for every run, so consumers must treat missing data as "not
 * reported" rather than "empty by design".
 */
export interface GenerationEvidenceExerciseSelection {
  excludedMovements: string[];
  historical: string[];
  preferred: string[];
  replacements: GenerationEvidenceReplacement[];
}

export interface GenerationEvidenceReplacement {
  from: string;
  reason?: string;
  to: string;
}

export interface GenerationEvidenceMuscleFocus {
  priorityMuscles: string[];
  weakMuscles: string[];
}

export interface GenerationEvidenceNutritionSupplement {
  nutritionSelectionReasons: string[];
  supplementSelectionReasons: string[];
}

export interface GenerationEvidenceCatalog {
  excluded: Array<{ name: string; reason: string }>;
  selected: Array<{ levels: string[]; name: string; reason?: string; regions: string[]; source: string }>;
}

export interface GenerationEvidenceTechnique {
  appliedCount: number;
  handler?: string;
  name: string;
  parameters: Record<string, unknown>;
  source?: string;
  status: string;
}

/**
 * Structured, non-AI-prose explanation of why a program draft was generated
 * the way it was. Populated from the Program detail `generator` summary
 * and/or `GET /generation-runs/{id}/` — never rendered as free-form AI text.
 */
export interface GenerationEvidence {
  daysPerWeek?: number;
  equipment: string[];
  exerciseCatalog?: GenerationEvidenceCatalog;
  exerciseSelection: GenerationEvidenceExerciseSelection;
  generationRunId: string;
  generatorVersion: string;
  injuryRules: string[];
  muscleFocus: GenerationEvidenceMuscleFocus;
  nutritionSupplement: GenerationEvidenceNutritionSupplement;
  ruleSetId?: string;
  studentGoal?: string;
  studentId: string;
  studentLevel?: string;
  techniques?: GenerationEvidenceTechnique[];
  templateId?: string;
  templateName?: string;
  visitDate?: string;
  visitId?: string;
  warnings: string[];
}

export interface GeneratedProgram {
  createdAt: string;
  dateRange: string;
  /** Present when the Backend attached generation provenance to this program/version. */
  evidence?: GenerationEvidence;
  /** Convenience shortcut mirroring evidence.generationRunId — used to lazily fetch full evidence. */
  generationRunId?: string;
  id: string;
  nutrition?: NutritionProgram;
  pdfSettings: ProgramPdfSettings;
  programType: StudentProgramType;
  status: GeneratedProgramStatus;
  studentId: string;
  supplements?: SupplementPlan;
  title: string;
  training?: TrainingProgram;
  updatedAt: string;
  version: number;
}

export interface ProgramGenerationInput {
  applyExerciseBank: boolean;
  applyGeneralRules: boolean;
  applyInjuryRules: boolean;
  applyLevelRules: boolean;
  applyMusclePriorityRules: boolean;
  customInstructions: string;
  daysPerWeek: number;
  durationWeeks: number;
  goal: string;
  level: string;
  musclePriorities: string[];
  programType: StudentProgramType;
  studentId: string;
  templateId: string;
  title: string;
}
