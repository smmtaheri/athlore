export type StudentGender = "male" | "female";
export type StudentStatus = "active" | "inactive";
export type TrainingLevel = "beginner" | "intermediate" | "advanced";
export type PrimaryGoal =
  "hypertrophy" | "fat_loss" | "strength" | "body_recomposition" | "general_health";

export interface StudentGoals {
  primaryGoal: PrimaryGoal;
  secondaryGoal: string;
  musclePriorities: string[];
  weakMuscles: string[];
  strongMuscles: string[];
}

export interface StudentTrainingBackground {
  basicMovementFamiliarity: string;
  hasFreeWeightExperience: boolean;
  level: TrainingLevel;
  trainingExperience: string;
}

export interface StudentTrainingConditions {
  cardioInterest: string;
  heavyTrainingInterest: string;
  sessionDurationMinutes: number;
  trainingDaysPerWeek: number;
  trainingPreference: string;
}

export interface StudentInjuries {
  aggravatingMovements: string[];
  disallowedExercises: string[];
  hasInjury: boolean;
  injuryType: string;
}

export interface StudentEquipment {
  hasBarbell: boolean;
  hasCable: boolean;
  hasDumbbell: boolean;
  hasFullGym: boolean;
  hasMachines: boolean;
}

export interface StudentLifestyle {
  dailyActivityLevel: string;
  occupation: string;
  sleepQuality: string;
  stressLevel: string;
}

export interface StudentPreferences {
  favoriteExercises: string;
  intensityPreference: string;
  dislikedTrainingStyles: string;
  varietyPreference: string;
}

export interface StudentListSummary {
  currentProgramTitle: string;
  lastVisitDate: string;
  medicalNote: string;
}

export type StudentPortalStatus =
  | "not_started"
  | "pending_activation"
  | "password_reset_required"
  | "active"
  | "disabled";

export interface StudentPortalAccess {
  accountActivated: boolean;
  hasPendingInitialPassword: boolean;
  mustChangePassword: boolean;
  portalEnabled: boolean;
  status: StudentPortalStatus;
  username?: string | null;
}

/**
 * Nutrition/supplement safety data. All fields are nullable on the Backend —
 * missing values are treated as "not reported" (empty array / empty string),
 * never as "confirmed no restrictions".
 */
export interface Student {
  age: number;
  coachNotes: string;
  createdAt: string;
  /** Comma/newline separated list on the form, stored as an array. */
  dietaryPreferences?: string[];
  /** Comma/newline separated list on the form, stored as an array. */
  dietaryRestrictions?: string[];
  equipment: StudentEquipment;
  /** Comma/newline separated list on the form, stored as an array. */
  foodAllergies?: string[];
  /** Comma/newline separated list on the form, stored as an array. */
  foodIntolerances?: string[];
  fullName: string;
  gender: StudentGender;
  goals: StudentGoals;
  heightCm: number;
  id: string;
  injuries: StudentInjuries;
  lifestyle: StudentLifestyle;
  /** Free-text notes. Does not affect generation — for coach/PDF reference only. */
  nutritionNotes?: string;
  phoneNumber?: string;
  portalAccess?: StudentPortalAccess;
  preferences: StudentPreferences;
  /** Free-text notes. Does not affect generation — for coach/PDF reference only. */
  relevantMedicalNotes?: string;
  status: StudentStatus;
  summary: StudentListSummary;
  /** Comma/newline separated list on the form, stored as an array. */
  supplementRestrictions?: string[];
  trainingBackground: StudentTrainingBackground;
  trainingConditions: StudentTrainingConditions;
  updatedAt: string;
  weightKg: number;
}

export type StudentInput = Omit<Student, "createdAt" | "id" | "updatedAt">;

export interface StudentFormValues {
  age: string;
  basicMovementFamiliarity: string;
  cardioInterest: string;
  coachNotes: string;
  dailyActivityLevel: string;
  dietaryPreferences: string;
  dietaryRestrictions: string;
  disallowedExercises: string;
  favoriteExercises: string;
  foodAllergies: string;
  foodIntolerances: string;
  fullName: string;
  gender: StudentGender;
  hasBarbell: boolean;
  hasCable: boolean;
  hasDumbbell: boolean;
  hasFreeWeightExperience: boolean;
  hasFullGym: boolean;
  hasInjury: boolean;
  hasMachines: boolean;
  heightCm: string;
  heavyTrainingInterest: string;
  injuryType: string;
  intensityPreference: string;
  nutritionNotes: string;
  phoneNumber: string;
  primaryGoal: PrimaryGoal | "";
  relevantMedicalNotes: string;
  secondaryGoal: string;
  sessionDurationMinutes: string;
  status: StudentStatus;
  stressLevel: string;
  supplementRestrictions: string;
  trainingDaysPerWeek: string;
  trainingExperience: string;
  trainingLevel: TrainingLevel | "";
  trainingPreference: string;
  varietyPreference: string;
  weightKg: string;
  weakMuscles: string[];
  musclePriorities: string[];
  strongMuscles: string[];
  aggravatingMovements: string;
  dislikedTrainingStyles: string;
  occupation: string;
  sleepQuality: string;
}

export type StudentFormField = keyof StudentFormValues;
export type StudentFormErrors = Partial<Record<StudentFormField, string>>;

export interface StudentsListFilters {
  goal: PrimaryGoal | "all";
  level: TrainingLevel | "all";
  search: string;
  status: StudentStatus | "all";
}
