/** Snake_case Backend DTOs ↔ camelCase Frontend view models. */

import type {
  CoachRules,
  NutritionTemplateSummary,
  SupplementTemplateSummary
} from "../../features/coach-rules/types/coachRules";
import type {
  GeneratedProgram,
  GenerationEvidence
} from "../../features/programs/types/generatedProgram";
import type {
  StudentActivateLoginResult,
  StudentVisit,
  StudentVisitInput,
  VisitAnswerRevision
} from "../../features/students/types/monthlyVisit";
import type {
  VisitFormAnswers,
  VisitFormFieldDefinition,
  VisitFormFieldType,
  VisitFormSectionDefinition,
  VisitFormTemplate,
  VisitFormTemplateSnapshot,
  VisitStatus
} from "../../features/students/types/visitForm";
import { isVisitStatus } from "../../features/students/types/visitForm";
import type { StudentPdfFile, StudentPdfFileStatus } from "../../features/students/types/pdfFile";
import type {
  StudentProgramSummary,
  StudentProgramType
} from "../../features/students/types/studentProgram";
import type {
  Student,
  StudentInput,
  StudentPortalAccess,
  StudentPortalStatus
} from "../../features/students/types/student";
import type {
  BodyCheckCycleSummary,
  BodyCheckCycleSummaryItem,
  BodyCheckTodayItem,
  DashboardMetrics,
  MonthlyVisitSummary,
  MonthlyVisitSummaryItem
} from "../../features/dashboard/services/dashboardMetrics";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  if (value == null) {
    return fallback;
  }
  return String(value);
}

export function studentFromApi(dto: Record<string, unknown>): Student {
  const goals = (dto.goals as Record<string, unknown>) || {};
  const injuries = (dto.injuries as Record<string, unknown>) || {};
  const equipment = (dto.equipment as Record<string, unknown>) || {};
  const lifestyle = (dto.lifestyle as Record<string, unknown>) || {};
  const preferences = (dto.preferences as Record<string, unknown>) || {};
  const trainingBackground = (dto.training_background as Record<string, unknown>) || {};
  const trainingConditions = (dto.training_conditions as Record<string, unknown>) || {};
  const summary = (dto.summary as Record<string, unknown>) || {};

  return {
    age: num(dto.age),
    coachNotes: String(dto.coach_notes ?? ""),
    createdAt: String(dto.created_at ?? ""),
    dietaryPreferences: asStringArray(dto.dietary_preferences),
    dietaryRestrictions: asStringArray(dto.dietary_restrictions),
    equipment: {
      hasBarbell: Boolean(equipment.has_barbell),
      hasCable: Boolean(equipment.has_cable),
      hasDumbbell: Boolean(equipment.has_dumbbell),
      hasFullGym: Boolean(equipment.has_full_gym),
      hasMachines: Boolean(equipment.has_machines)
    },
    foodAllergies: asStringArray(dto.food_allergies),
    foodIntolerances: asStringArray(dto.food_intolerances),
    fullName: String(dto.full_name ?? ""),
    gender: (dto.gender as Student["gender"]) || "male",
    goals: {
      musclePriorities: asStringArray(goals.muscle_priorities),
      primaryGoal: (goals.primary_goal as Student["goals"]["primaryGoal"]) || "hypertrophy",
      secondaryGoal: String(goals.secondary_goal ?? ""),
      strongMuscles: asStringArray(goals.strong_muscles),
      weakMuscles: asStringArray(goals.weak_muscles)
    },
    heightCm: num(dto.height_cm),
    id: String(dto.id),
    injuries: {
      aggravatingMovements: asStringArray(injuries.aggravating_movements),
      disallowedExercises: asStringArray(injuries.disallowed_exercises),
      hasInjury: Boolean(injuries.has_injury),
      injuryType: String(injuries.injury_type ?? "")
    },
    lifestyle: {
      dailyActivityLevel: String(lifestyle.daily_activity_level ?? ""),
      occupation: String(lifestyle.occupation ?? ""),
      sleepQuality: String(lifestyle.sleep_quality ?? ""),
      stressLevel: String(lifestyle.stress_level ?? "")
    },
    nutritionNotes: String(dto.nutrition_notes ?? ""),
    phoneNumber: dto.phone_number == null ? "" : String(dto.phone_number),
    portalAccess: portalAccessFromApi(dto.portal_access),
    preferences: {
      dislikedTrainingStyles: String(preferences.disliked_training_styles ?? ""),
      favoriteExercises: String(preferences.favorite_exercises ?? ""),
      intensityPreference: String(preferences.intensity_preference ?? ""),
      varietyPreference: String(preferences.variety_preference ?? "")
    },
    relevantMedicalNotes: String(dto.relevant_medical_notes ?? ""),
    status: (dto.status as Student["status"]) || "active",
    summary: {
      currentProgramTitle: String(summary.current_program_title ?? ""),
      lastVisitDate: summary.last_visit_date ? String(summary.last_visit_date) : "",
      medicalNote: String(summary.medical_note ?? "")
    },
    supplementRestrictions: asStringArray(dto.supplement_restrictions),
    trainingBackground: {
      basicMovementFamiliarity: String(trainingBackground.basic_movement_familiarity ?? ""),
      hasFreeWeightExperience: Boolean(trainingBackground.has_free_weight_experience),
      level: (trainingBackground.level as Student["trainingBackground"]["level"]) || "beginner",
      trainingExperience: String(trainingBackground.training_experience ?? "")
    },
    trainingConditions: {
      cardioInterest: String(trainingConditions.cardio_interest ?? ""),
      heavyTrainingInterest: String(trainingConditions.heavy_training_interest ?? ""),
      sessionDurationMinutes: num(trainingConditions.session_duration_minutes, 60),
      trainingDaysPerWeek: num(trainingConditions.training_days_per_week, 4),
      trainingPreference: String(trainingConditions.training_preference ?? "")
    },
    updatedAt: String(dto.updated_at ?? ""),
    weightKg: num(dto.weight_kg)
  };
}

export function studentInputToApi(input: StudentInput): Record<string, unknown> {
  return {
    age: input.age,
    coach_notes: input.coachNotes,
    dietary_preferences: input.dietaryPreferences ?? [],
    dietary_restrictions: input.dietaryRestrictions ?? [],
    equipment: {
      has_barbell: input.equipment.hasBarbell,
      has_cable: input.equipment.hasCable,
      has_dumbbell: input.equipment.hasDumbbell,
      has_full_gym: input.equipment.hasFullGym,
      has_machines: input.equipment.hasMachines
    },
    food_allergies: input.foodAllergies ?? [],
    food_intolerances: input.foodIntolerances ?? [],
    full_name: input.fullName,
    gender: input.gender,
    goals: {
      muscle_priorities: input.goals.musclePriorities,
      primary_goal: input.goals.primaryGoal,
      secondary_goal: input.goals.secondaryGoal,
      strong_muscles: input.goals.strongMuscles,
      weak_muscles: input.goals.weakMuscles
    },
    height_cm: input.heightCm,
    weight_kg: input.weightKg,
    injuries: {
      aggravating_movements: input.injuries.aggravatingMovements,
      disallowed_exercises: input.injuries.disallowedExercises,
      has_injury: input.injuries.hasInjury,
      injury_type: input.injuries.injuryType
    },
    lifestyle: {
      daily_activity_level: input.lifestyle.dailyActivityLevel,
      occupation: input.lifestyle.occupation,
      sleep_quality: input.lifestyle.sleepQuality,
      stress_level: input.lifestyle.stressLevel
    },
    nutrition_notes: input.nutritionNotes ?? "",
    phone_number: input.phoneNumber || null,
    preferences: {
      disliked_training_styles: input.preferences.dislikedTrainingStyles,
      favorite_exercises: input.preferences.favoriteExercises,
      intensity_preference: input.preferences.intensityPreference,
      variety_preference: input.preferences.varietyPreference
    },
    relevant_medical_notes: input.relevantMedicalNotes ?? "",
    status: input.status,
    supplement_restrictions: input.supplementRestrictions ?? [],
    training_background: {
      basic_movement_familiarity: input.trainingBackground.basicMovementFamiliarity,
      has_free_weight_experience: input.trainingBackground.hasFreeWeightExperience,
      level: input.trainingBackground.level,
      training_experience: input.trainingBackground.trainingExperience
    },
    training_conditions: {
      cardio_interest: input.trainingConditions.cardioInterest,
      heavy_training_interest: input.trainingConditions.heavyTrainingInterest,
      session_duration_minutes: input.trainingConditions.sessionDurationMinutes,
      training_days_per_week: input.trainingConditions.trainingDaysPerWeek,
      training_preference: input.trainingConditions.trainingPreference
    }
  };
}

export function visitFromApi(dto: Record<string, unknown>): StudentVisit {
  const measurements = (dto.measurements as Record<string, unknown>) || {};
  const adherence = (dto.adherence as Record<string, unknown>) || {};
  const statusRaw = dto.status;
  const status: VisitStatus = isVisitStatus(statusRaw) ? statusRaw : "finalized";
  const snapshot = visitFormTemplateSnapshotFromApi(dto.form_template_snapshot);
  return {
    adherence: {
      nutritionPercent: num(adherence.nutrition_percent),
      overallPercent: num(adherence.overall_percent),
      supplementsPercent: num(adherence.supplements_percent),
      trainingPercent: num(adherence.training_percent)
    },
    answerSources:
      dto.answer_sources && typeof dto.answer_sources === "object" && !Array.isArray(dto.answer_sources)
        ? Object.fromEntries(
            Object.entries(dto.answer_sources as Record<string, unknown>).map(([key, value]) => [
              key,
              str(value)
            ])
          )
        : undefined,
    answers: visitFormAnswersFromApi(dto.answers),
    bodyFatPercentage: dto.body_fat_percentage == null ? undefined : num(dto.body_fat_percentage),
    bodyFeeling: String(dto.body_feeling ?? ""),
    coachAssessment: String(dto.coach_assessment ?? ""),
    coachNotes: String(dto.coach_notes ?? ""),
    coachPrivateNotes: String(dto.coach_private_notes ?? ""),
    createdAt: String(dto.created_at ?? ""),
    currentWeightKg: num(dto.current_weight_kg),
    dailyEnergyLevel: (dto.daily_energy_level as StudentVisit["dailyEnergyLevel"]) || "medium",
    expiresAt: dto.expires_at == null ? null : str(dto.expires_at),
    finalizedAt: dto.finalized_at == null ? null : str(dto.finalized_at),
    formTemplateId: dto.form_template_id == null ? null : str(dto.form_template_id),
    formTemplateKey: str(dto.form_template_key),
    isExpired: Boolean(dto.is_expired),
    formTemplateName: str(dto.form_template_name || snapshot.name || dto.form_template_key),
    formTemplateSnapshot: snapshot,
    formTemplateVersion: num(dto.form_template_version, 1),
    hasNewInjury: Boolean(dto.has_new_injury),
    id: String(dto.id),
    measurements: {
      armCm: measurements.arm_cm == null ? undefined : num(measurements.arm_cm),
      chestCm: measurements.chest_cm == null ? undefined : num(measurements.chest_cm),
      hipCm: measurements.hip_cm == null ? undefined : num(measurements.hip_cm),
      thighCm: measurements.thigh_cm == null ? undefined : num(measurements.thigh_cm),
      waistCm: measurements.waist_cm == null ? undefined : num(measurements.waist_cm)
    },
    newInjuryNotes: String(dto.new_injury_notes ?? ""),
    nextCycleGoal: String(dto.next_cycle_goal ?? ""),
    previousWeightKg: num(dto.previous_weight_kg),
    sentAt: dto.sent_at == null ? null : str(dto.sent_at),
    sleepQuality: (dto.sleep_quality as StudentVisit["sleepQuality"]) || "medium",
    status,
    stressLevel: (dto.stress_level as StudentVisit["stressLevel"]) || "medium",
    studentFeedback: String(dto.student_feedback ?? ""),
    studentId: String(dto.student_id ?? ""),
    submittedByStudentAt: dto.submitted_by_student_at == null ? null : str(dto.submitted_by_student_at),
    trainingConditionChanges: String(dto.training_condition_changes ?? ""),
    updatedAt: String(dto.updated_at ?? ""),
    visitDate: String(dto.visit_date ?? "")
  };
}

export function visitAnswerRevisionFromApi(dto: Record<string, unknown>): VisitAnswerRevision {
  return {
    actorId: dto.actor_id == null ? null : str(dto.actor_id),
    createdAt: str(dto.created_at),
    fieldKey: str(dto.field_key),
    id: str(dto.id),
    source: str(dto.source),
    value: dto.value
  };
}

function portalAccessFromApi(value: unknown): StudentPortalAccess | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const dto = value as Record<string, unknown>;
  const statusRaw = str(dto.status, "not_started");
  const status: StudentPortalStatus =
    statusRaw === "pending_activation" ||
    statusRaw === "password_reset_required" ||
    statusRaw === "active" ||
    statusRaw === "disabled" ||
    statusRaw === "not_started"
      ? statusRaw
      : "not_started";
  return {
    accountActivated: Boolean(dto.account_activated),
    hasPendingInitialPassword: Boolean(
      dto.has_pending_initial_password ?? dto.must_change_password
    ),
    mustChangePassword: Boolean(dto.must_change_password),
    portalEnabled: Boolean(dto.portal_enabled),
    status,
    username: dto.username == null ? null : str(dto.username)
  };
}

export function studentActivateLoginFromApi(dto: Record<string, unknown>): StudentActivateLoginResult {
  const initial =
    dto.initial_password == null
      ? dto.temporary_password == null
        ? null
        : str(dto.temporary_password)
      : str(dto.initial_password);
  return {
    initialPassword: initial,
    portalAccess: portalAccessFromApi(dto.portal_access),
    purpose: dto.purpose == null ? undefined : str(dto.purpose),
    studentId: str(dto.student_id),
    temporaryPassword: initial,
    username: dto.username == null ? null : str(dto.username)
  };
}

export function visitInputToApi(input: Partial<StudentVisitInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.visitDate !== undefined) body.visit_date = input.visitDate;
  if (input.currentWeightKg !== undefined) body.current_weight_kg = input.currentWeightKg;
  if (input.previousWeightKg !== undefined) body.previous_weight_kg = input.previousWeightKg;
  if (input.bodyFatPercentage !== undefined) body.body_fat_percentage = input.bodyFatPercentage;
  if (input.dailyEnergyLevel !== undefined) body.daily_energy_level = input.dailyEnergyLevel;
  if (input.sleepQuality !== undefined) body.sleep_quality = input.sleepQuality;
  if (input.stressLevel !== undefined) body.stress_level = input.stressLevel;
  if (input.bodyFeeling !== undefined) body.body_feeling = input.bodyFeeling;
  if (input.studentFeedback !== undefined) body.student_feedback = input.studentFeedback;
  if (input.coachAssessment !== undefined) body.coach_assessment = input.coachAssessment;
  if (input.coachNotes !== undefined) body.coach_notes = input.coachNotes;
  if (input.coachPrivateNotes !== undefined) body.coach_private_notes = input.coachPrivateNotes;
  if (input.hasNewInjury !== undefined) body.has_new_injury = input.hasNewInjury;
  if (input.newInjuryNotes !== undefined) body.new_injury_notes = input.newInjuryNotes;
  if (input.nextCycleGoal !== undefined) body.next_cycle_goal = input.nextCycleGoal;
  if (input.trainingConditionChanges !== undefined) {
    body.training_condition_changes = input.trainingConditionChanges;
  }
  if (input.formTemplateId !== undefined) body.form_template_id = input.formTemplateId;
  if (input.answers !== undefined) body.answers = input.answers;
  if (input.status !== undefined) body.status = input.status;
  if (input.measurements) {
    body.measurements = {
      arm_cm: input.measurements.armCm ?? null,
      chest_cm: input.measurements.chestCm ?? null,
      hip_cm: input.measurements.hipCm ?? null,
      thigh_cm: input.measurements.thighCm ?? null,
      waist_cm: input.measurements.waistCm ?? null
    };
  }
  if (input.adherence) {
    body.adherence = {
      nutrition_percent: input.adherence.nutritionPercent,
      overall_percent: input.adherence.overallPercent,
      supplements_percent: input.adherence.supplementsPercent,
      training_percent: input.adherence.trainingPercent
    };
  }
  return body;
}

const VISIT_FORM_FIELD_TYPES: VisitFormFieldType[] = [
  "text",
  "number",
  "boolean",
  "single_select",
  "multi_select",
  "textarea",
  "date"
];

function visitFormFieldTypeFromApi(value: unknown): VisitFormFieldType {
  const raw = str(value, "text");
  return VISIT_FORM_FIELD_TYPES.includes(raw as VisitFormFieldType)
    ? (raw as VisitFormFieldType)
    : "text";
}

function visitFormFieldFromApi(dto: Record<string, unknown>): VisitFormFieldDefinition {
  const options = Array.isArray(dto.options)
    ? dto.options.map((item) => {
        const option = (item as Record<string, unknown>) || {};
        return {
          label: str(option.label || option.value),
          value: str(option.value)
        };
      })
    : [];

  return {
    coachEditable: dto.coach_editable == null ? undefined : bool(dto.coach_editable, true),
    enabled: bool(dto.enabled, true),
    helpText: str(dto.help_text ?? dto.helpText),
    key: str(dto.key),
    label: str(dto.label),
    options,
    order: num(dto.order),
    prefillFrom: str(dto.prefill_from ?? dto.prefillFrom),
    required: bool(dto.required),
    semanticKey: str(dto.semantic_key ?? dto.semanticKey),
    studentEditable: dto.student_editable == null ? undefined : bool(dto.student_editable),
    studentVisible: dto.student_visible == null ? undefined : bool(dto.student_visible),
    studentVisibleWhenFinalized:
      dto.student_visible_when_finalized == null
        ? undefined
        : bool(dto.student_visible_when_finalized),
    type: visitFormFieldTypeFromApi(dto.type)
  };
}

function visitFormSectionFromApi(dto: Record<string, unknown>): VisitFormSectionDefinition {
  const fields = Array.isArray(dto.fields)
    ? dto.fields.map((item) => visitFormFieldFromApi((item as Record<string, unknown>) || {}))
    : [];

  return {
    fields,
    key: str(dto.key),
    label: str(dto.label),
    order: num(dto.order)
  };
}

function visitFormSectionsFromApi(value: unknown): VisitFormSectionDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => visitFormSectionFromApi((item as Record<string, unknown>) || {}));
}

function visitFormFieldToApi(field: VisitFormFieldDefinition): Record<string, unknown> {
  return {
    coach_editable: field.coachEditable ?? true,
    enabled: field.enabled,
    help_text: field.helpText,
    key: field.key,
    label: field.label,
    options: field.options.map((option) => ({ label: option.label, value: option.value })),
    order: field.order,
    prefill_from: field.prefillFrom,
    required: field.required,
    semantic_key: field.semanticKey,
    student_editable: field.studentEditable ?? false,
    student_visible: field.studentVisible ?? false,
    student_visible_when_finalized:
      field.studentVisibleWhenFinalized ?? field.studentVisible ?? false,
    type: field.type
  };
}

function visitFormSectionToApi(section: VisitFormSectionDefinition): Record<string, unknown> {
  return {
    fields: section.fields.map(visitFormFieldToApi),
    key: section.key,
    label: section.label,
    order: section.order
  };
}

export function visitFormTemplateFromApi(dto: Record<string, unknown>): VisitFormTemplate {
  return {
    createdAt: dto.created_at ? str(dto.created_at) : undefined,
    description: str(dto.description),
    id: str(dto.id),
    isActive: bool(dto.is_active, true),
    isDefault: bool(dto.is_default),
    key: str(dto.key),
    name: str(dto.name),
    sections: visitFormSectionsFromApi(dto.sections),
    updatedAt: dto.updated_at ? str(dto.updated_at) : undefined,
    version: num(dto.version, 1)
  };
}

export function visitFormTemplateToApi(
  template: Partial<VisitFormTemplate>
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (template.key !== undefined) body.key = template.key;
  if (template.name !== undefined) body.name = template.name;
  if (template.description !== undefined) body.description = template.description;
  if (template.version !== undefined) body.version = template.version;
  if (template.isActive !== undefined) body.is_active = template.isActive;
  if (template.isDefault !== undefined) body.is_default = template.isDefault;
  if (template.sections !== undefined) {
    body.sections = template.sections.map(visitFormSectionToApi);
  }
  return body;
}

function visitFormTemplateSnapshotFromApi(value: unknown): VisitFormTemplateSnapshot {
  const dto = (value as Record<string, unknown>) || {};
  return {
    id: dto.id ? str(dto.id) : undefined,
    key: dto.key ? str(dto.key) : undefined,
    name: dto.name ? str(dto.name) : undefined,
    sections: Array.isArray(dto.sections) ? visitFormSectionsFromApi(dto.sections) : undefined,
    version: dto.version == null ? undefined : num(dto.version, 1)
  };
}

function visitFormAnswersFromApi(value: unknown): VisitFormAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as VisitFormAnswers) };
}

export function nutritionTemplateFromApi(dto: Record<string, unknown>): NutritionTemplateSummary {
  return {
    goal: dto.goal ? str(dto.goal) : undefined,
    id: str(dto.id),
    isEligibleForAutoSelect: bool(dto.is_eligible_for_auto_select),
    name: str(dto.name),
    needsCoachReview: bool(dto.needs_coach_review, true),
    notes: dto.notes ? str(dto.notes) : undefined,
    status: str(dto.status, "draft")
  };
}

export function supplementTemplateFromApi(dto: Record<string, unknown>): SupplementTemplateSummary {
  return {
    id: str(dto.id),
    isEligibleForAutoSelect: bool(dto.is_eligible_for_auto_select),
    name: str(dto.name),
    needsCoachReview: bool(dto.needs_coach_review, true),
    notes: dto.notes ? str(dto.notes) : undefined,
    status: str(dto.status, "draft")
  };
}

export function coachRulesFromApi(dto: Record<string, unknown>): CoachRules {
  const general = (dto.general_rules as Record<string, unknown>) || {};
  const nutritionTemplates = dto.nutrition_templates as Record<string, unknown>[] | undefined;
  const supplementTemplates = dto.supplement_templates as Record<string, unknown>[] | undefined;
  return {
    exerciseBank: ((dto.exercise_bank as Record<string, unknown>[]) || []).map((item) => ({
      beginnerFriendly: asStringArray(item.beginner_friendly),
      favoriteExercises: asStringArray(item.favorite_exercises),
      forbiddenExercises: asStringArray(item.forbidden_exercises),
      group: String(item.group ?? item.group_name ?? ""),
      id: String(item.id ?? ""),
      professionalFriendly: asStringArray(item.professional_friendly)
    })),
    generalRules: {
      extraNotes: String(general.extra_notes ?? ""),
      items: ((general.items as Record<string, unknown>[]) || []).map((item) => ({
        category: String(item.category ?? ""),
        description: String(item.description ?? ""),
        id: String(item.id ?? ""),
        importance: (item.importance as "high" | "medium" | "low") || "medium",
        isActive: Boolean(item.is_active ?? true),
        order: num(item.order ?? item.sort_order),
        title: String(item.title ?? "")
      }))
    },
    injuries: ((dto.injuries as Record<string, unknown>[]) || []).map((item) => ({
      alternatives: asStringArray(item.alternatives),
      forbiddenExercises: asStringArray(item.forbidden_exercises),
      id: String(item.id ?? ""),
      isActive: Boolean(item.is_active ?? true),
      name: String(item.name ?? ""),
      notes: String(item.notes ?? "")
    })),
    levels: ((dto.levels as Record<string, unknown>[]) || []).map((item) => ({
      allowedTechniques: asStringArray(item.allowed_techniques),
      coachNotes: String(item.coach_notes ?? ""),
      forbiddenExercises: asStringArray(item.forbidden_exercises),
      id: String(item.id ?? item.level_key ?? "beginner") as CoachRules["levels"][number]["id"],
      intensity: String(item.intensity ?? ""),
      requiredExercises: asStringArray(item.required_exercises),
      volume: String(item.volume ?? "")
    })),
    musclePriorities: ((dto.muscle_priorities as Record<string, unknown>[]) || []).map((item) => ({
      extraExercises: num(item.extra_exercises),
      extraSets: num(item.extra_sets),
      id: String(item.id ?? ""),
      muscle: String(item.muscle ?? ""),
      notes: String(item.notes ?? ""),
      orderChange: String(item.order_change ?? "")
    })),
    templates: ((dto.templates as Record<string, unknown>[]) || []).map((item) => ({
      daysPerWeek: num(item.days_per_week),
      goal: String(item.goal ?? ""),
      id: String(item.id ?? ""),
      intensity: String(item.intensity ?? ""),
      isActive: Boolean(item.is_active ?? true),
      level: (item.level as "beginner" | "intermediate" | "advanced") || "beginner",
      mainGoal: String(item.main_goal ?? ""),
      musclePriorityOrder: asStringArray(item.muscle_priority_order),
      name: String(item.name ?? ""),
      restTime: String(item.rest_time ?? ""),
      specialRules: asStringArray(item.special_rules),
      split: asStringArray(item.split),
      volume: String(item.volume ?? "")
    })),
    ...(nutritionTemplates
      ? { nutritionTemplates: nutritionTemplates.map(nutritionTemplateFromApi) }
      : {}),
    ...(supplementTemplates
      ? { supplementTemplates: supplementTemplates.map(supplementTemplateFromApi) }
      : {}),
    updatedAt: String(dto.updated_at ?? "")
  };
}

export function coachRulesToApi(rules: CoachRules): Record<string, unknown> {
  return {
    exercise_bank: rules.exerciseBank.map((item, index) => ({
      beginner_friendly: item.beginnerFriendly,
      favorite_exercises: item.favoriteExercises,
      forbidden_exercises: item.forbiddenExercises,
      group: item.group,
      professional_friendly: item.professionalFriendly,
      sort_order: index
    })),
    general_rules: {
      extra_notes: rules.generalRules.extraNotes,
      items: rules.generalRules.items.map((item) => ({
        category: item.category,
        description: item.description,
        importance: item.importance,
        is_active: item.isActive,
        order: item.order,
        title: item.title
      }))
    },
    injuries: rules.injuries.map((item, index) => ({
      alternatives: item.alternatives,
      forbidden_exercises: item.forbiddenExercises,
      is_active: item.isActive,
      name: item.name,
      notes: item.notes,
      sort_order: index
    })),
    levels: rules.levels.map((item) => ({
      allowed_techniques: item.allowedTechniques,
      coach_notes: item.coachNotes,
      forbidden_exercises: item.forbiddenExercises,
      id: item.id,
      intensity: item.intensity,
      required_exercises: item.requiredExercises,
      volume: item.volume
    })),
    muscle_priorities: rules.musclePriorities.map((item, index) => ({
      extra_exercises: item.extraExercises,
      extra_sets: item.extraSets,
      muscle: item.muscle,
      notes: item.notes,
      order_change: item.orderChange,
      sort_order: index
    })),
    templates: rules.templates.map((item, index) => ({
      days_per_week: item.daysPerWeek,
      goal: item.goal,
      intensity: item.intensity,
      is_active: item.isActive,
      level: item.level,
      main_goal: item.mainGoal,
      muscle_priority_order: item.musclePriorityOrder,
      name: item.name,
      rest_time: item.restTime,
      sort_order: index,
      special_rules: item.specialRules,
      split: item.split,
      volume: item.volume
    }))
  };
}

export function programSummaryFromApi(dto: Record<string, unknown>): StudentProgramSummary {
  const versionNum = num(dto.version, 1);
  return {
    createdAt: String(dto.created_at ?? ""),
    dateRange: String(dto.date_range ?? ""),
    generatedAt: String(dto.created_at ?? ""),
    id: String(dto.id),
    isCurrent: Boolean(dto.is_current),
    programType: (dto.program_type as StudentProgramSummary["programType"]) || "complete",
    status: (dto.status as StudentProgramSummary["status"]) || "draft",
    studentId: String(dto.student_id ?? ""),
    title: String(dto.title ?? ""),
    updatedAt: String(dto.updated_at ?? ""),
    version: `v${versionNum}`
  };
}

/**
 * Best-effort mapping from the lightweight `generator` summary embedded in
 * `GET /programs/{id}/` (`{ generation_run_id, engine, warnings, seed }` as of
 * the current Backend contract). This is enough to show the GenerationRun ID
 * and warnings immediately; the panel fetches the full run for the rest.
 */
export function generationEvidenceFromProgramGeneratorMeta(
  meta: Record<string, unknown>,
  studentId: string
): GenerationEvidence {
  return {
    equipment: [],
    exerciseCatalog: { excluded: [], selected: [] },
    exerciseSelection: {
      excludedMovements: [],
      historical: [],
      preferred: [],
      replacements: []
    },
    generationRunId: str(meta.generation_run_id),
    generatorVersion: str(meta.engine),
    injuryRules: [],
    muscleFocus: { priorityMuscles: [], weakMuscles: [] },
    nutritionSupplement: { nutritionSelectionReasons: [], supplementSelectionReasons: [] },
    studentId,
    techniques: [],
    warnings: asStringArray(meta.warnings)
  };
}

/**
 * Maps `GET /api/v1/generation-runs/{id}/` (or a forward-compatible
 * `evidence` sub-object, if the Backend adds one later) into the structured
 * evidence shown on the "چرا این برنامه ساخته شد؟" panel. Every field is
 * read defensively — the current Backend only returns `request` /
 * `input_snapshot` / `output_snapshot`, not a dedicated evidence object.
 */
export function generationEvidenceFromApi(dto: Record<string, unknown>): GenerationEvidence {
  const inputSnapshot = (dto.input_snapshot as Record<string, unknown>) || {};
  const outputSnapshot = (dto.output_snapshot as Record<string, unknown>) || {};
  const generatorMeta = (outputSnapshot.generator as Record<string, unknown>) || {};
  const explicitEvidence =
    (dto.evidence as Record<string, unknown>) ||
    (generatorMeta.evidence as Record<string, unknown>) ||
    null;
  const request = (dto.request as Record<string, unknown>) || {};
  const student = (inputSnapshot.student as Record<string, unknown>) || {};
  const goals = (student.goals as Record<string, unknown>) || {};
  const injuries = (student.injuries as Record<string, unknown>) || {};
  const equipment = (student.equipment as Record<string, unknown>) || {};
  const template = (inputSnapshot.template as Record<string, unknown>) || {};
  const visit = (inputSnapshot.visit as Record<string, unknown>) || null;

  const injuryRules: string[] = [];
  if (bool(injuries.has_injury)) {
    if (injuries.injury_type) {
      injuryRules.push(`نوع آسیب: ${str(injuries.injury_type)}`);
    }
    for (const movement of asStringArray(injuries.aggravating_movements)) {
      injuryRules.push(`حرکت آزاردهنده حذف‌شده: ${movement}`);
    }
  }

  const equipmentList = Object.entries(equipment)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => str(key));

  const base: GenerationEvidence = {
    daysPerWeek: numOrUndefined(
      template.days_per_week ?? generatorMeta.days_per_week ?? request.days_per_week
    ),
    equipment: equipmentList,
    exerciseCatalog: { excluded: [], selected: [] },
    exerciseSelection: {
      excludedMovements: asStringArray(injuries.disallowed_exercises),
      historical: [],
      preferred: [],
      replacements: []
    },
    generationRunId: str(dto.id),
    generatorVersion: str(
      inputSnapshot.generator_version ?? generatorMeta.version ?? dto.engine ?? ""
    ),
    injuryRules,
    muscleFocus: {
      priorityMuscles: asStringArray(goals.muscle_priorities),
      weakMuscles: asStringArray(goals.weak_muscles)
    },
    nutritionSupplement: {
      nutritionSelectionReasons: [],
      supplementSelectionReasons: []
    },
    ruleSetId: inputSnapshot.rules_digest ? str(inputSnapshot.rules_digest) : undefined,
    studentGoal: goals.primary_goal ? str(goals.primary_goal) : undefined,
    studentId: str(dto.student_id ?? student.id ?? ""),
    studentLevel: template.level ? str(template.level) : undefined,
    techniques: [],
    templateId: template.id
      ? str(template.id)
      : request.template_id
        ? str(request.template_id)
        : undefined,
    templateName: template.name
      ? str(template.name)
      : generatorMeta.template_name
        ? str(generatorMeta.template_name)
        : undefined,
    visitDate: visit?.visit_date ? str(visit.visit_date) : undefined,
    visitId: visit?.id ? str(visit.id) : undefined,
    warnings: asStringArray(dto.warnings ?? generatorMeta.warnings)
  };

  if (!explicitEvidence) {
    return base;
  }

  // Forward-compatible: prefer an explicit `evidence` object once the Backend adds one.
  return {
    ...base,
    equipment: explicitEvidence.equipment
      ? asStringArray(explicitEvidence.equipment)
      : base.equipment,
    exerciseSelection: {
      excludedMovements: explicitEvidence.excluded_movements
        ? asStringArray(explicitEvidence.excluded_movements)
        : base.exerciseSelection.excludedMovements,
      historical: asStringArray(explicitEvidence.historical),
      preferred: asStringArray(explicitEvidence.preferred),
      replacements: (Array.isArray(explicitEvidence.replacements)
        ? (explicitEvidence.replacements as Record<string, unknown>[])
        : []
      ).map((item) => ({
        from: str(item.from),
        reason: item.reason ? str(item.reason) : undefined,
        to: str(item.to)
      }))
    },
    exerciseCatalog: {
      excluded: (Array.isArray(explicitEvidence.structured_catalog_excluded)
        ? (explicitEvidence.structured_catalog_excluded as Record<string, unknown>[])
        : []
      ).map((item) => ({ name: str(item.name), reason: str(item.reason) })),
      selected: (Array.isArray(explicitEvidence.structured_catalog_selected)
        ? (explicitEvidence.structured_catalog_selected as Record<string, unknown>[])
        : []
      ).map((item) => ({
        levels: asStringArray(item.levels),
        name: str(item.name),
        reason: item.reason ? str(item.reason) : undefined,
        regions: asStringArray(item.regions),
        source: str(item.source)
      }))
    },
    injuryRules: explicitEvidence.injury_rules
      ? asStringArray(explicitEvidence.injury_rules)
      : injuryRules,
    nutritionSupplement: {
      nutritionSelectionReasons: asStringArray(explicitEvidence.nutrition_selection_reasons),
      supplementSelectionReasons: asStringArray(explicitEvidence.supplement_selection_reasons)
    },
    ruleSetId: explicitEvidence.rule_set_id ? str(explicitEvidence.rule_set_id) : base.ruleSetId,
    techniques: (Array.isArray(explicitEvidence.techniques)
      ? (explicitEvidence.techniques as Record<string, unknown>[])
      : []
    ).map((item) => ({
      appliedCount: num(item.applied_count),
      handler: item.handler ? str(item.handler) : undefined,
      name: str(item.name),
      parameters: (item.parameters as Record<string, unknown>) || {},
      source: item.source ? str(item.source) : undefined,
      status: str(item.status)
    }))
  };
}

function numOrUndefined(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function programDetailFromApi(dto: Record<string, unknown>): GeneratedProgram {
  const draft = (dto.current_draft as Record<string, unknown>) || null;
  const versionNum = draft ? num(draft.version_number, num(dto.version, 1)) : num(dto.version, 1);
  const status = (dto.status as GeneratedProgram["status"]) || "draft";

  const nutritionRaw = dto.nutrition as Record<string, unknown> | null | undefined;
  const supplementsRaw = dto.supplements as Record<string, unknown> | null | undefined;

  const nutrition = nutritionRaw
    ? {
        dailyWater: String(nutritionRaw.dailyWater ?? nutritionRaw.daily_water ?? ""),
        meals: Array.isArray(nutritionRaw.meals)
          ? (nutritionRaw.meals as GeneratedProgram["nutrition"] extends infer N
              ? N extends { meals: infer M }
                ? M
                : never
              : never)
          : [],
        notes: String(nutritionRaw.notes ?? "")
      }
    : undefined;

  const supplements = supplementsRaw
    ? {
        items: (Array.isArray(supplementsRaw.items) ? supplementsRaw.items : []).map(
          (item: Record<string, unknown>, index: number) => ({
            amount: String(item.amount ?? ""),
            id: String(item.id ?? `supp-${index + 1}`),
            name: String(item.name ?? ""),
            notes: String(item.notes ?? item.instructions ?? ""),
            order: num(item.order, index + 1),
            timing: String(item.timing ?? "")
          })
        ),
        medicalNote: String(supplementsRaw.warnings ?? supplementsRaw.notes ?? ""),
        summary: String(supplementsRaw.notes ?? "")
      }
    : undefined;

  return {
    createdAt: String(dto.created_at ?? ""),
    dateRange: String(dto.date_range ?? dto.date_range_label ?? ""),
    id: String(dto.id),
    nutrition: nutrition as GeneratedProgram["nutrition"],
    pdfSettings: {
      contactInfo: "",
      fileTitle: String(dto.title ?? ""),
      includeCoachName: true,
      includeCoachNotes: true,
      includeNutrition: true,
      includeStudentName: true,
      includeSupplements: true,
      includeTraining: true,
      pageSize: "A4" as const,
      style: "modern" as const,
      ...((dto.pdf_settings as Record<string, unknown>) || {})
    } as GeneratedProgram["pdfSettings"],
    programType: (dto.program_type as GeneratedProgram["programType"]) || "complete",
    status,
    studentId: String(dto.student_id ?? ""),
    supplements,
    title: String(dto.title ?? ""),
    training: (dto.training as GeneratedProgram["training"]) ?? undefined,
    updatedAt: String(dto.updated_at ?? ""),
    version: versionNum,
    ...(draft ? { draftId: String(draft.id) } : {}),
    ...(dto.generator
      ? {
          evidence: generationEvidenceFromProgramGeneratorMeta(
            dto.generator as Record<string, unknown>,
            String(dto.student_id ?? "")
          ),
          generationRunId: str((dto.generator as Record<string, unknown>).generation_run_id)
        }
      : {}),
    ...(dto.versions ? { versions: dto.versions } : {}),
    ...(dto.provenance ? { provenance: dto.provenance } : {}),
    ...(dto.latest_finalized_version
      ? { latestFinalizedVersion: dto.latest_finalized_version }
      : {})
  } as GeneratedProgram & Record<string, unknown>;
}

export function programPatchToApi(program: Partial<GeneratedProgram>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (program.training !== undefined) body.training = program.training;
  if (program.nutrition !== undefined) body.nutrition = program.nutrition;
  if (program.supplements !== undefined) body.supplements = program.supplements;
  if (program.pdfSettings !== undefined) body.pdf_settings = program.pdfSettings;
  return body;
}

export function dashboardFromApi(dto: Record<string, unknown>): DashboardMetrics {
  return {
    activeStudents: num(dto.active_students),
    asOf: str(dto.as_of),
    bodyCheckCycles: bodyCheckCycleSummaryFromApi(
      (dto.body_check_cycles as Record<string, unknown>) || {}
    ),
    bodyCheckToday: ((dto.body_check_today as Record<string, unknown>[]) || []).map(
      bodyCheckTodayFromApi
    ),
    draftPrograms: num(dto.draft_programs),
    finalPrograms: num(dto.final_programs),
    followUpStudents: ((dto.follow_up_students as Record<string, unknown>[]) || []).map(
      studentFromApi
    ),
    latestPrograms: ((dto.latest_programs as Record<string, unknown>[]) || []).map(
      programSummaryFromApi
    ),
    latestVisits: ((dto.latest_visits as Record<string, unknown>[]) || []).map(visitFromApi),
    monthlyVisits: monthlyVisitSummaryFromApi(
      (dto.monthly_visits as Record<string, unknown>) || {}
    ),
    overdueVisits: ((dto.overdue_visits as Record<string, unknown>[]) || []).map(studentFromApi),
    readyPdfFiles: num(dto.ready_pdf_files ?? dto.pdf_files_ready),
    thisMonthVisits: num(dto.this_month_visits),
    todayTasks: asStringArray(dto.today_tasks),
    totalStudents: num(dto.total_students),
    pdfGenerationAvailable: bool(dto.pdf_generation_available, true),
    pdfFilesFailed: num(dto.pdf_files_failed),
    pdfFilesPending: num(dto.pdf_files_pending)
  };
}

function monthlyVisitSummaryFromApi(dto: Record<string, unknown>): MonthlyVisitSummary {
  return {
    activeStudents: num(dto.active_students),
    asOf: str(dto.as_of),
    coachReview: num(dto.coach_review),
    dueSoon: num(dto.due_soon),
    finalized: num(dto.finalized),
    items: Array.isArray(dto.items)
      ? (dto.items as Record<string, unknown>[]).map(monthlyVisitSummaryItemFromApi)
      : [],
    month: str(dto.month),
    notSent: num(dto.not_sent),
    overdue: num(dto.overdue),
    sent: num(dto.sent),
    studentSubmitted: num(dto.student_submitted)
  };
}

function monthlyVisitSummaryItemFromApi(dto: Record<string, unknown>): MonthlyVisitSummaryItem {
  const status = str(dto.status);
  return {
    daysUntilDue: dto.days_until_due == null ? null : num(dto.days_until_due),
    dueDate: dto.due_date == null ? null : str(dto.due_date),
    dueState:
      dto.due_state === "due_soon" || dto.due_state === "overdue" ? dto.due_state : "not_due",
    lastVisitDate: dto.last_visit_date == null ? null : str(dto.last_visit_date),
    status:
      status === "waiting_for_student" ||
      status === "student_submitted" ||
      status === "coach_review" ||
      status === "finalized"
        ? status
        : "not_sent",
    studentId: str(dto.student_id),
    studentName: str(dto.student_name),
    visitDate: dto.visit_date == null ? null : str(dto.visit_date),
    visitId: dto.visit_id == null ? null : str(dto.visit_id)
  };
}

function bodyCheckCycleSummaryFromApi(dto: Record<string, unknown>): BodyCheckCycleSummary {
  return {
    active: num(dto.active),
    expiringSoon: num(dto.expiring_soon),
    expired: num(dto.expired),
    items: Array.isArray(dto.items)
      ? (dto.items as Record<string, unknown>[]).map(bodyCheckCycleSummaryItemFromApi)
      : [],
    withoutActiveCycle: num(dto.without_active_cycle)
  };
}

function bodyCheckCycleSummaryItemFromApi(
  dto: Record<string, unknown>
): BodyCheckCycleSummaryItem {
  const status = String(dto.status);
  return {
    cycleId: dto.cycle_id == null ? null : str(dto.cycle_id),
    daysRemaining: dto.days_remaining == null ? null : num(dto.days_remaining),
    endDate: dto.end_date == null ? null : str(dto.end_date),
    startDate: dto.start_date == null ? null : str(dto.start_date),
    status:
      status === "closed" ||
      status === "expired" ||
      status === "expiring_soon" ||
      status === "no_active_cycle"
        ? status
        : "active",
    studentId: str(dto.student_id),
    studentName: str(dto.student_name)
  };
}

function bodyCheckTodayFromApi(dto: Record<string, unknown>): BodyCheckTodayItem {
  const completion = (dto.completion as Record<string, unknown>) || {};
  return {
    actualWeightKg: nullableNum(dto.actual_weight_kg),
    completion: {
      hasNutrition: Boolean(completion.has_nutrition),
      hasSleep: Boolean(completion.has_sleep),
      hasWeight: Boolean(completion.has_weight)
    },
    cycleId: str(dto.cycle_id),
    isLogged: Boolean(dto.is_logged),
    localDate: str(dto.local_date),
    nutritionAdherenceScore: nullableNum(dto.nutrition_adherence_score),
    sleepDurationMinutes: nullableNum(dto.sleep_duration_minutes),
    sleepQualityScore: nullableNum(dto.sleep_quality_score),
    sleepStartTime: dto.sleep_start_time == null ? null : str(dto.sleep_start_time),
    status: dto.status === "logged" ? "logged" : "not_logged",
    studentId: str(dto.student_id),
    studentName: str(dto.student_name),
    targetWeightKg: nullableNum(dto.target_weight_kg),
    weightDeltaKg: nullableNum(dto.weight_delta_kg),
    wakeTime: dto.wake_time == null ? null : str(dto.wake_time)
  };
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function nullableNum(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function mapPdfStatus(raw: unknown): StudentPdfFileStatus {
  const value = String(raw || "");
  if (value === "ready") return "ready";
  if (value === "failed") return "failed";
  if (value === "pending") return "pending";
  if (value === "rendering") return "rendering";
  if (value === "generating") return "generating";
  return "generating";
}

export function pdfFileFromApi(dto: Record<string, unknown>): StudentPdfFile {
  const share = (dto.share as Record<string, unknown> | null) || null;
  const sizeBytes = dto.size_bytes == null ? undefined : num(dto.size_bytes);
  const generated =
    dto.generated_at != null
      ? new Date(String(dto.generated_at)).toLocaleString("fa-IR")
      : dto.created_at != null
        ? new Date(String(dto.created_at)).toLocaleString("fa-IR")
        : "-";
  return {
    id: str(dto.id),
    studentId: str(dto.student_id),
    programId: str(dto.program_id),
    programVersionId: dto.program_version_id ? str(dto.program_version_id) : undefined,
    programTitle: str(dto.program_title || ""),
    contentType: str(dto.program_type || "complete") as StudentProgramType,
    fileName: str(dto.file_name || dto.display_name || "program.pdf"),
    generatedAt: generated,
    version: str(dto.version_label || ""),
    status: mapPdfStatus(dto.status),
    size: formatBytes(sizeBytes),
    sizeBytes,
    hasActiveShare: Boolean(share?.has_active_link)
  };
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export function paginatedFromApi<T>(
  dto: Record<string, unknown>,
  mapItem: (item: Record<string, unknown>) => T
): Paginated<T> {
  return {
    count: num(dto.count),
    next: dto.next == null ? null : String(dto.next),
    previous: dto.previous == null ? null : String(dto.previous),
    results: ((dto.results as Record<string, unknown>[]) || []).map(mapItem)
  };
}
