import type { ProgramRequest } from "../../program-requests/types/programRequest";
import type { Student } from "../types/student";
import type {
  VisitFormAnswers,
  VisitFormAnswerValue,
  VisitFormFieldDefinition,
  VisitFormSectionDefinition
} from "../types/visitForm";

const retiredStandardFields = new Set([
  "full_name",
  "phone",
  "height_cm",
  "age",
  "weight_kg",
  "assessment_date",
  "has_nutrition_plan",
  "calorie_target",
  "free_text_plan",
  "coach_notes_general",
  "additional_notes",
  "split_saturday",
  "split_sunday",
  "split_monday",
  "split_tuesday",
  "split_wednesday",
  "split_thursday",
  "split_friday"
]);

export function isStandardVisitTemplate(key = ""): boolean {
  return key === "arman_visit_v1" || key.startsWith("athlete_assessment_reference_v1");
}

export function hasVisitAnswer(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== "" &&
    (!Array.isArray(value) || value.length > 0)
  );
}

const muscleAliases: Record<string, string> = {
  سرشانه: "shoulders",
  شانه: "shoulders",
  "پشت بازو": "triceps",
  ساق: "calves",
  سینه: "chest",
  "سینه بالا": "chest",
  بالاسینه: "chest",
  پا: "quadriceps",
  چهارسر: "quadriceps",
  ساعد: "forearms",
  زیربغل: "back",
  پشت: "back",
  همسترینگ: "hamstrings",
  شکم: "abs",
  "جلو بازو": "biceps",
  جلوبازو: "biceps",
  باسن: "glutes",
  سرینی: "glutes"
};

function muscleKey(value: string): string {
  return muscleAliases[value] ?? value;
}

function profileWeaknessChoices(student: Student, options: VisitFormFieldDefinition["options"]) {
  const values = student.goals.weakMuscles.map((item) => item.trim()).filter(Boolean);
  if (!values.length) return [];
  const selected: string[] = [];
  for (const value of values) {
    const normalized = muscleKey(value);
    const option = options.find(
      (item) =>
        item.value === value ||
        item.value === normalized ||
        item.label.trim().toLocaleLowerCase() === value.toLocaleLowerCase()
    );
    if (!option) return undefined;
    if (!selected.includes(option.value)) selected.push(option.value);
  }
  return selected;
}

function profileInjuryChoices(student: Student, options: VisitFormFieldDefinition["options"]) {
  if (!student.injuries.hasInjury) return [];
  const value = student.injuries.injuryType.trim().toLocaleLowerCase();
  const category = value.includes("neck") || value.includes("گردن")
    ? "neck"
    : value.includes("back") || value.includes("کمر")
      ? "back"
      : value.includes("knee") || value.includes("زانو")
        ? "knee"
        : value.includes("shoulder") || value.includes("شانه")
          ? "shoulder"
          : "other";
  const option = options.find((item) => item.value === category) ?? options.find((item) => item.value === "other");
  return option ? [option.value] : undefined;
}

export function visitFormLayout(
  sections: VisitFormSectionDefinition[],
  templateKey: string,
  answers: VisitFormAnswers
) {
  const standard = isStandardVisitTemplate(templateKey);
  const fields = sections.flatMap((section) => section.fields);
  const retired = (field: VisitFormFieldDefinition) =>
    standard && !field.required && retiredStandardFields.has(field.key);
  const liveFields = fields.filter((field) => !retired(field));
  const take = (...semanticKeys: string[]) =>
    liveFields.filter((field) => semanticKeys.includes(field.semanticKey));
  const weakFields = take("weak_muscles");
  const weak = new Set(
    weakFields.flatMap((field) => {
      const answer = answers[field.key];
      return Array.isArray(answer) ? answer.map(muscleKey) : [];
    })
  );
  const muscleDetails = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter(
        (field) =>
          field.semanticKey === "muscle_detail" &&
          (field.required ||
            weak.has(field.key.split(".")[1]) ||
            hasVisitAnswer(answers[field.key]))
      )
    }))
    .filter((section) => section.fields.length > 0);
  const primarySemantics = new Set([
    "goal",
    "training_level",
    "sessions_per_week",
    "training_environment",
    "equipment_available",
    "session_duration_minutes",
    "injuries",
    "weak_muscles",
    "muscle_detail",
    "training_methods"
  ]);
  return {
    liveFields,
    general: take("goal", "training_level", "sessions_per_week"),
    conditions: take("training_environment", "equipment_available", "session_duration_minutes"),
    injuries: liveFields.filter(
      (field) => field.semanticKey === "injuries" || field.key === "injury_notes"
    ),
    weakness: weakFields,
    muscleDetails,
    methods: take("training_methods"),
    additional: sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter(
          (field) =>
            !retired(field) &&
            !primarySemantics.has(field.semanticKey) &&
            field.key !== "injury_notes"
        )
      }))
      .filter((section) => section.fields.length > 0),
    historical: sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter(
          (field) => retired(field) && hasVisitAnswer(answers[field.key])
        )
      }))
      .filter((section) => section.fields.length > 0)
  };
}

/** Keep hidden detail answers from continuing to prescribe a deselected muscle. */
export function reconcileWeakMuscleAnswers(
  previous: VisitFormAnswers,
  next: VisitFormAnswers,
  fields: VisitFormFieldDefinition[],
  audience: "coach" | "athlete" = "coach"
): VisitFormAnswers {
  const weakField = fields.find((field) => field.semanticKey === "weak_muscles");
  if (!weakField || previous[weakField.key] === next[weakField.key]) return next;
  const selected = next[weakField.key];
  if (!Array.isArray(selected)) return next;
  const selectedMuscles = new Set(selected.map(muscleKey));
  const result = { ...next };
  for (const field of fields) {
    if (
      field.semanticKey === "muscle_detail" &&
      (audience === "coach" ? field.coachEditable !== false : field.studentEditable === true) &&
      !selectedMuscles.has(field.key.split(".")[1]) &&
      hasVisitAnswer(previous[field.key])
    ) {
      result[field.key] = null;
    }
  }
  return result;
}

export function prefillVisitAnswers(
  student: Student,
  sections: VisitFormSectionDefinition[],
  request?: ProgramRequest | null
): VisitFormAnswers {
  const equipment = student.equipment.availableEquipment ?? [
    ...(student.equipment.hasFullGym ? ["full_gym"] : []),
    ...(student.equipment.hasDumbbell ? ["dumbbell"] : []),
    ...(student.equipment.hasBarbell ? ["barbell"] : []),
    ...(student.equipment.hasCable ? ["cable"] : []),
    ...(student.equipment.hasMachines ? ["machines"] : [])
  ];
  const semanticValues: Record<string, VisitFormAnswerValue | undefined> = {
    goal: student.goals.primaryGoal,
    training_level: student.trainingBackground.level,
    sessions_per_week: request?.sessionsPerWeek ?? student.trainingConditions.trainingDaysPerWeek,
    training_environment: request
      ? request.trainingEnvironment
      : student.trainingConditions.environment,
    equipment_available: request ? request.equipmentAvailable : equipment,
    session_duration_minutes: request
      ? request.sessionDurationMinutes
      : student.trainingConditions.sessionDurationMinutes
  };
  const aliases: Record<string, string[]> = {
    hypertrophy: ["hypertrophy", "gain_weight"],
    fat_loss: ["fat_loss", "lose_weight"],
    maintain: ["maintain", "maintain_weight"],
    advanced: ["advanced", "professional", "semi_professional"]
  };
  const answers: VisitFormAnswers = {};
  for (const field of sections.flatMap((section) => section.fields)) {
    if (field.coachEditable === false) continue;
    let value = semanticValues[field.semanticKey];
    if (field.type === "multi_select" && field.semanticKey === "weak_muscles") {
      value = profileWeaknessChoices(student, field.options);
      if (Array.isArray(value)) {
        answers[field.key] = value;
        continue;
      }
    } else if (field.type === "multi_select" && field.semanticKey === "injuries") {
      value = profileInjuryChoices(student, field.options);
      if (Array.isArray(value)) {
        answers[field.key] = value;
        continue;
      }
    }
    if (!hasVisitAnswer(value)) continue;
    if (field.type === "single_select") {
      const candidates = aliases[String(value)] ?? [String(value)];
      value = candidates.find((item) => field.options.some((option) => option.value === item));
    } else if (field.type === "multi_select") {
      if (!Array.isArray(value)) continue;
      value = value.filter((item) => field.options.some((option) => option.value === item));
    } else if (field.type === "number") {
      value = Number(value);
      if (!Number.isFinite(value)) continue;
    }
    if (hasVisitAnswer(value)) answers[field.key] = value as VisitFormAnswerValue;
  }
  return answers;
}
