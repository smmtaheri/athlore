import type {
  BodyCheckCycle,
  BodyCheckCycleCreateInput,
  BodyCheckCycleUpdateInput,
  BodyCheckDashboardSnapshot,
  BodyCheckDay,
  BodyCheckDayCompletion,
  BodyCheckMeals,
  BodyCheckPhoto,
  BodyCheckReportSummary
} from "../types/bodyCheck";

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function completionFromApi(dto: Record<string, unknown> | undefined): BodyCheckDayCompletion {
  const c = dto || {};
  return {
    hasMeals: Boolean(c.has_meals),
    hasNutrition: Boolean(c.has_nutrition),
    hasSleep: Boolean(c.has_sleep),
    hasWeight: Boolean(c.has_weight),
    isLogged: Boolean(c.is_logged)
  };
}

function mealsFromApi(value: unknown): BodyCheckMeals | null {
  if (!value || typeof value !== "object") return null;
  const dto = value as Record<string, unknown>;
  return {
    meal1: str(dto.meal_1),
    meal2: str(dto.meal_2),
    meal3: str(dto.meal_3),
    meal4: str(dto.meal_4),
    meal5: str(dto.meal_5),
    meal6: str(dto.meal_6)
  };
}

export function bodyCheckDayFromApi(dto: Record<string, unknown>): BodyCheckDay {
  return {
    actualWeightKg: numOrNull(dto.actual_weight_kg),
    completion: completionFromApi(dto.completion as Record<string, unknown> | undefined),
    createdAt: dto.created_at == null ? null : str(dto.created_at),
    dayNumber: num(dto.day_number),
    id: dto.id == null ? null : str(dto.id),
    isLogged: Boolean(dto.is_logged),
    localDate: str(dto.local_date),
    meals: mealsFromApi(dto.meals),
    nutritionAdherenceScore: numOrNull(dto.nutrition_adherence_score),
    sleepDurationMinutes: numOrNull(dto.sleep_duration_minutes),
    sleepQualityScore: numOrNull(dto.sleep_quality_score),
    sleepStartTime: dto.sleep_start_time == null ? null : str(dto.sleep_start_time),
    status: dto.status === "logged" ? "logged" : "not_logged",
    targetWeightKg: numOrNull(dto.target_weight_kg),
    updatedAt: dto.updated_at == null ? null : str(dto.updated_at),
    wakeTime: dto.wake_time == null ? null : str(dto.wake_time),
    weekNumber: num(dto.week_number),
    weightDeltaKg: numOrNull(dto.weight_delta_kg)
  };
}

export function bodyCheckReportFromApi(dto: Record<string, unknown>): BodyCheckReportSummary {
  return {
    avgNutritionAdherenceScore: numOrNull(dto.avg_nutrition_adherence_score),
    avgSleepDurationMinutes: numOrNull(dto.avg_sleep_duration_minutes),
    avgSleepQualityScore: numOrNull(dto.avg_sleep_quality_score),
    avgSleepStartTime: dto.avg_sleep_start_time == null ? null : str(dto.avg_sleep_start_time),
    avgWakeTime: dto.avg_wake_time == null ? null : str(dto.avg_wake_time),
    cycleLengthDays: num(dto.cycle_length_days, 30),
    deltaToGoalKg: numOrNull(dto.delta_to_goal_kg),
    goalWeightKg: num(dto.goal_weight_kg),
    lastActualWeightDate: dto.last_actual_weight_date == null ? null : str(dto.last_actual_weight_date),
    lastActualWeightKg: numOrNull(dto.last_actual_weight_kg),
    loggedDays: num(dto.logged_days),
    missingDays: num(dto.missing_days),
    nutritionScoreDays: num(dto.nutrition_score_days),
    sleepDurationDays: num(dto.sleep_duration_days),
    sleepQualityDays: num(dto.sleep_quality_days),
    sleepStartTimeDays: num(dto.sleep_start_time_days),
    startingWeightKg: num(dto.starting_weight_kg),
    wakeTimeDays: num(dto.wake_time_days)
  };
}

export function bodyCheckPhotoFromApi(dto: Record<string, unknown>): BodyCheckPhoto {
  return {
    contentType: str(dto.content_type),
    downloadPath: str(dto.download_path),
    id: str(dto.id),
    originalFilename: str(dto.original_filename),
    sizeBytes: num(dto.size_bytes),
    uploadedAt: str(dto.uploaded_at),
    weekNumber: num(dto.week_number)
  };
}

export function bodyCheckCycleFromApi(dto: Record<string, unknown>): BodyCheckCycle {
  return {
    coachId: str(dto.coach_id),
    createdAt: str(dto.created_at),
    cycleLengthDays: num(dto.cycle_length_days, 30),
    dailyTargetsKg: Array.isArray(dto.daily_targets_kg)
      ? (dto.daily_targets_kg as unknown[]).map((v) => num(v))
      : [],
    days: Array.isArray(dto.days)
      ? (dto.days as Record<string, unknown>[]).map(bodyCheckDayFromApi)
      : undefined,
    endDate: str(dto.end_date),
    goalWeightKg: num(dto.goal_weight_kg),
    id: str(dto.id),
    localToday: str(dto.local_today),
    mealDetailEnabled: Boolean(dto.meal_detail_enabled),
    photos: Array.isArray(dto.photos)
      ? (dto.photos as Record<string, unknown>[]).map(bodyCheckPhotoFromApi)
      : undefined,
    report: dto.report ? bodyCheckReportFromApi(dto.report as Record<string, unknown>) : undefined,
    startDate: str(dto.start_date),
    startingWeightKg: num(dto.starting_weight_kg),
    status:
      dto.status === "closed" || dto.status === "expired"
        ? dto.status
        : "active",
    studentId: str(dto.student_id),
    updatedAt: str(dto.updated_at)
  };
}

export function bodyCheckDashboardFromApi(
  dto: Record<string, unknown> | null | undefined
): BodyCheckDashboardSnapshot | null {
  if (!dto || !dto.cycle) return null;
  return {
    cycle: bodyCheckCycleFromApi(dto.cycle as Record<string, unknown>),
    lastActualWeightDate:
      dto.last_actual_weight_date == null ? null : str(dto.last_actual_weight_date),
    lastActualWeightKg: numOrNull(dto.last_actual_weight_kg),
    lastTargetWeightKg: numOrNull(dto.last_target_weight_kg),
    lastWeightDeltaKg: numOrNull(dto.last_weight_delta_kg),
    today: dto.today ? bodyCheckDayFromApi(dto.today as Record<string, unknown>) : null,
    todayInCycle: Boolean(dto.today_in_cycle)
  };
}

export function bodyCheckCycleCreateToApi(input: BodyCheckCycleCreateInput): Record<string, unknown> {
  return {
    daily_targets_kg: input.dailyTargetsKg,
    goal_weight_kg: input.goalWeightKg,
    meal_detail_enabled: input.mealDetailEnabled ?? false,
    start_date: input.startDate,
    starting_weight_kg: input.startingWeightKg
  };
}

export function bodyCheckCycleUpdateToApi(input: BodyCheckCycleUpdateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.dailyTargetsKg !== undefined) body.daily_targets_kg = input.dailyTargetsKg;
  if (input.goalWeightKg !== undefined) body.goal_weight_kg = input.goalWeightKg;
  if (input.mealDetailEnabled !== undefined) body.meal_detail_enabled = input.mealDetailEnabled;
  if (input.startingWeightKg !== undefined) body.starting_weight_kg = input.startingWeightKg;
  if (input.status !== undefined) body.status = input.status;
  return body;
}

export function bodyCheckEntryInputToApi(input: {
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
}): Record<string, unknown> {
  const body: Record<string, unknown> = { local_date: input.localDate };
  if (input.actualWeightKg !== undefined) body.actual_weight_kg = input.actualWeightKg;
  if (input.sleepStartTime !== undefined) body.sleep_start_time = input.sleepStartTime;
  if (input.wakeTime !== undefined) body.wake_time = input.wakeTime;
  if (input.sleepQualityScore !== undefined) body.sleep_quality_score = input.sleepQualityScore;
  if (input.nutritionAdherenceScore !== undefined) {
    body.nutrition_adherence_score = input.nutritionAdherenceScore;
  }
  if (input.meal1 !== undefined) body.meal_1 = input.meal1;
  if (input.meal2 !== undefined) body.meal_2 = input.meal2;
  if (input.meal3 !== undefined) body.meal_3 = input.meal3;
  if (input.meal4 !== undefined) body.meal_4 = input.meal4;
  if (input.meal5 !== undefined) body.meal_5 = input.meal5;
  if (input.meal6 !== undefined) body.meal_6 = input.meal6;
  return body;
}
