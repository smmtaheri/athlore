export type CoachRuleSection =
  | "templates"
  | "levels"
  | "injuries"
  | "muscles"
  | "exercises"
  | "general"
  | "nutritionTemplates"
  | "supplementTemplates"
  | "visitForms";

export type TrainingLevelKey = "beginner" | "intermediate" | "advanced";

export interface ProgramTemplate {
  daysPerWeek: number;
  goal: string;
  id: string;
  intensity: string;
  isActive: boolean;
  level: TrainingLevelKey;
  mainGoal: string;
  musclePriorityOrder: string[];
  name: string;
  restTime: string;
  specialRules: string[];
  split: string[];
  volume: string;
}

export interface LevelRule {
  allowedTechniques: string[];
  coachNotes: string;
  forbiddenExercises: string[];
  id: TrainingLevelKey;
  intensity: string;
  requiredExercises: string[];
  volume: string;
}

export interface InjuryRule {
  alternatives: string[];
  forbiddenExercises: string[];
  id: string;
  isActive: boolean;
  name: string;
  notes: string;
}

export interface MusclePriorityRule {
  extraExercises: number;
  extraSets: number;
  id: string;
  muscle: string;
  notes: string;
  orderChange: string;
}

export interface ExerciseBankGroup {
  beginnerFriendly: string[];
  favoriteExercises: string[];
  forbiddenExercises: string[];
  group: string;
  id: string;
  professionalFriendly: string[];
}

export interface GeneralCoachRule {
  category: string;
  description: string;
  id: string;
  importance: "high" | "medium" | "low";
  isActive: boolean;
  order: number;
  title: string;
}

export interface GeneralCoachRules {
  extraNotes: string;
  items: GeneralCoachRule[];
}

export type TemplateReviewStatus = "draft" | "active" | "archived" | string;

/**
 * Reference nutrition template imported/generated on the Backend. The
 * aggregate `/coach-rules/` endpoint does not return these yet — the FE
 * renders whatever is present and otherwise shows a read-only empty state.
 */
export interface NutritionTemplateSummary {
  goal?: string;
  id: string;
  isEligibleForAutoSelect: boolean;
  name: string;
  needsCoachReview: boolean;
  notes?: string;
  status: TemplateReviewStatus;
}

/** Reference supplement template — same review workflow as nutrition templates. */
export interface SupplementTemplateSummary {
  id: string;
  isEligibleForAutoSelect: boolean;
  name: string;
  needsCoachReview: boolean;
  notes?: string;
  status: TemplateReviewStatus;
}

export interface CoachRules {
  exerciseBank: ExerciseBankGroup[];
  generalRules: GeneralCoachRules;
  injuries: InjuryRule[];
  levels: LevelRule[];
  musclePriorities: MusclePriorityRule[];
  /** Optional — only present once the Backend aggregate includes it. */
  nutritionTemplates?: NutritionTemplateSummary[];
  /** Optional — only present once the Backend aggregate includes it. */
  supplementTemplates?: SupplementTemplateSummary[];
  templates: ProgramTemplate[];
  updatedAt: string;
}

export type CoachRulesInput = CoachRules;
