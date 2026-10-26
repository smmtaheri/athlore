export type CoachRuleSection =
  | "templates"
  | "levels"
  | "injuries"
  | "muscles"
  | "exercises"
  | "trainingSystems"
  | "nutritionTemplates"
  | "supplementTemplates"
  | "visitForms";

export type TrainingLevelKey = "beginner" | "intermediate" | "advanced";

export interface TemplateSlot {
  muscle_key: string;
  exercise_id: string | null;
  unit: "reps" | "seconds";
  minimum: number;
  maximum: number;
  reps_source: "default" | "system" | "custom";
}

export interface TemplateBlock {
  system_key: string | null;
  sets: number | null;
  rest_seconds: number | null;
  between_seconds: number | null;
  slots: TemplateSlot[];
}

export interface TemplateExecutionPlan {
  version: 1;
  description: string;
  defaults: { sets: number; minimum: number; maximum: number; rest_seconds: number; rir: number };
  days: Array<{ muscles: string[]; blocks: TemplateBlock[] }>;
}

export interface ProgramTemplate {
  executionPlan?: TemplateExecutionPlan;
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

export interface StructuredExerciseTarget {
  muscle: string;
  muscleKey: string;
  region?: string | null;
  regionKey?: string | null;
  role: "primary" | "secondary";
}

export interface StructuredExercise {
  aliases: string[];
  coachNotes: string;
  equipmentKeys: string[];
  id: string;
  isActive: boolean;
  isArchived: boolean;
  isPreferred: boolean;
  isProhibited: boolean;
  levels: string[];
  movementPattern: string;
  name: string;
  nameEn: string;
  priority: number;
  sourceDocument: string;
  targets: StructuredExerciseTarget[];
}

export interface TrainingTechniqueConfig {
  allowedLevels: string[];
  baseTechniqueKey: string | null;
  enabled: boolean;
  handlerStatus: "implemented" | "manual_only";
  id: string | null;
  key: string;
  maxPerSession: number;
  name: string;
  parameters: Record<string, unknown>;
  source: "platform" | "coach_override" | "coach_private";
}

export interface TrainingSystem {
  allowed_levels: string[];
  base_technique_key: string | null;
  description: string;
  enabled: boolean;
  execution_method: string;
  handler_key?: string;
  handler_status: "implemented" | "manual_only";
  id: string | null;
  key: string;
  max_per_session: number;
  name: string;
  parameter_schema?: Record<string, unknown>;
  parameters: Record<string, unknown>;
  recipe?: TrainingRecipe;
  public_definition?: {
    key?: string;
    name?: string;
    description?: string;
    execution_method?: string;
    parameter_schema?: Record<string, unknown>;
    recipe?: TrainingRecipe;
  } | null;
  source: "platform" | "coach_override" | "coach_private";
}

export interface TrainingRecipeStep {
  op: string;
  [key: string]: unknown;
}

export interface TrainingRecipeGrouping {
  allow_compound?: boolean;
  exercise_order?: "generated" | "isolation_first" | "compound_first";
  exercise_prescriptions?: Array<Record<string, unknown>>;
  max_groups_per_session: number;
  mode: "same_muscle" | "same_muscle_isolation" | "antagonist" | "any_eligible" | "alternating";
  rest_after_seconds: number;
  rest_between_seconds: number;
  size: number;
}

export interface TrainingRecipe {
  grouping?: TrainingRecipeGrouping;
  steps: TrainingRecipeStep[];
  target: "all" | "last_exercise" | "last_isolation" | "last_set";
  version: 1;
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
  generationRules?: GenerationRules;
  exerciseCatalog?: StructuredExercise[];
  generalRules: GeneralCoachRules;
  injuries: InjuryRule[];
  levels: LevelRule[];
  musclePriorities: MusclePriorityRule[];
  /** Optional — only present once the Backend aggregate includes it. */
  nutritionTemplates?: NutritionTemplateSummary[];
  /** Optional — only present once the Backend aggregate includes it. */
  supplementTemplates?: SupplementTemplateSummary[];
  templates: ProgramTemplate[];
  trainingTechniques?: TrainingTechniqueConfig[];
  updatedAt: string;
}

export type CoachRulesInput = CoachRules;

export interface GenerationRules {
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  rir: number;
  focus_extra_sets: number;
  weakness_auto_focus: boolean;
  warmup_minutes: number;
  progression: "double_progression" | "maintain";
}
