export type BodyCheckCycleStatus = "active" | "closed" | "expired";

export interface BodyCheckDayCompletion {
  hasMeals: boolean;
  hasNutrition: boolean;
  hasSleep: boolean;
  hasWeight: boolean;
  isLogged: boolean;
}

export interface BodyCheckMeals {
  meal1: string;
  meal2: string;
  meal3: string;
  meal4: string;
  meal5: string;
  meal6: string;
}

export interface BodyCheckDay {
  actualWeightKg: number | null;
  completion: BodyCheckDayCompletion;
  createdAt: string | null;
  dayNumber: number;
  id: string | null;
  isLogged: boolean;
  localDate: string;
  meals: BodyCheckMeals | null;
  nutritionAdherenceScore: number | null;
  sleepDurationMinutes: number | null;
  sleepQualityScore: number | null;
  sleepStartTime: string | null;
  status: "logged" | "not_logged";
  targetWeightKg: number | null;
  updatedAt: string | null;
  wakeTime: string | null;
  weekNumber: number;
  weightDeltaKg: number | null;
}

export interface BodyCheckReportSummary {
  avgNutritionAdherenceScore: number | null;
  avgSleepDurationMinutes: number | null;
  avgSleepQualityScore: number | null;
  avgSleepStartTime: string | null;
  avgWakeTime: string | null;
  cycleLengthDays: number;
  deltaToGoalKg: number | null;
  goalWeightKg: number;
  lastActualWeightDate: string | null;
  lastActualWeightKg: number | null;
  loggedDays: number;
  missingDays: number;
  nutritionScoreDays: number;
  sleepDurationDays: number;
  sleepQualityDays: number;
  sleepStartTimeDays: number;
  startingWeightKg: number;
  wakeTimeDays: number;
}

export interface BodyCheckPhoto {
  contentType: string;
  downloadPath: string;
  id: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  weekNumber: number;
}

export interface BodyCheckCycle {
  coachId: string;
  createdAt: string;
  cycleLengthDays: number;
  dailyTargetsKg: number[];
  days?: BodyCheckDay[];
  endDate: string;
  goalWeightKg: number;
  id: string;
  localToday: string;
  mealDetailEnabled: boolean;
  photos?: BodyCheckPhoto[];
  report?: BodyCheckReportSummary;
  startDate: string;
  startingWeightKg: number;
  status: BodyCheckCycleStatus;
  studentId: string;
  updatedAt: string;
}

export interface BodyCheckDashboardSnapshot {
  cycle: BodyCheckCycle;
  lastActualWeightDate: string | null;
  lastActualWeightKg: number | null;
  lastTargetWeightKg: number | null;
  lastWeightDeltaKg: number | null;
  today: BodyCheckDay | null;
  todayInCycle: boolean;
}

export interface BodyCheckEntryInput {
  actualWeightKg?: number | null;
  localDate: string;
  meal1?: string;
  meal2?: string;
  meal3?: string;
  meal4?: string;
  meal5?: string;
  meal6?: string;
  nutritionAdherenceScore?: number | null;
  sleepQualityScore?: number | null;
  sleepStartTime?: string | null;
  wakeTime?: string | null;
}

export interface BodyCheckCycleCreateInput {
  dailyTargetsKg?: number[];
  goalWeightKg: number;
  mealDetailEnabled?: boolean;
  startDate: string;
  startingWeightKg: number;
}

export interface BodyCheckCycleUpdateInput {
  dailyTargetsKg?: number[];
  goalWeightKg?: number;
  mealDetailEnabled?: boolean;
  startingWeightKg?: number;
  status?: BodyCheckCycleStatus;
}
