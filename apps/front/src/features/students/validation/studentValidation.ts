import type {
  StudentFormErrors,
  StudentFormField,
  StudentFormValues,
  StudentInput
} from "../types/student";
import { validateIranMobileInput } from "../../../shared/phone/iranMobile";

export const emptyStudentFormValues: StudentFormValues = {
  age: "",
  aggravatingMovements: "",
  basicMovementFamiliarity: "تقریبا خوب",
  cardioInterest: "",
  coachNotes: "",
  dailyActivityLevel: "",
  dietaryPreferences: "",
  dietaryRestrictions: "",
  disallowedExercises: "",
  dislikedTrainingStyles: "",
  favoriteExercises: "",
  foodAllergies: "",
  foodIntolerances: "",
  fullName: "",
  gender: "male",
  hasBarbell: false,
  hasCable: false,
  hasDumbbell: false,
  hasFreeWeightExperience: false,
  hasFullGym: false,
  hasInjury: false,
  hasMachines: false,
  heightCm: "",
  heavyTrainingInterest: "",
  injuryType: "",
  intensityPreference: "",
  musclePriorities: [],
  nutritionNotes: "",
  occupation: "",
  phoneNumber: "",
  primaryGoal: "",
  relevantMedicalNotes: "",
  secondaryGoal: "",
  sessionDurationMinutes: "",
  sleepQuality: "",
  status: "active",
  stressLevel: "",
  strongMuscles: [],
  supplementRestrictions: "",
  trainingDaysPerWeek: "",
  trainingExperience: "",
  trainingLevel: "",
  trainingPreference: "",
  varietyPreference: "",
  weakMuscles: [],
  weightKg: ""
};

const fieldOrder: StudentFormField[] = [
  "fullName",
  "phoneNumber",
  "age",
  "heightCm",
  "weightKg",
  "primaryGoal",
  "trainingLevel",
  "trainingDaysPerWeek",
  "sessionDurationMinutes",
  "injuryType",
  "aggravatingMovements"
];

function parsePositiveNumber(value: string): number | undefined {
  const normalized = value.trim().replace("٫", ".").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function splitList(value: string): string[] {
  return value
    .split(/[,،\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(values: string[]): string {
  return values.join("، ");
}

export function validateStudentForm(values: StudentFormValues): StudentFormErrors {
  const errors: StudentFormErrors = {};
  const age = parsePositiveNumber(values.age);
  const height = parsePositiveNumber(values.heightCm);
  const weight = parsePositiveNumber(values.weightKg);
  const trainingDays = parsePositiveNumber(values.trainingDaysPerWeek);
  const sessionDuration = parsePositiveNumber(values.sessionDurationMinutes);

  if (!values.fullName.trim()) {
    errors.fullName = "نام شاگرد الزامی است.";
  }

  const phoneError = validateIranMobileInput(values.phoneNumber);
  if (phoneError) {
    errors.phoneNumber = phoneError;
  }

  if (!age || age < 12 || age > 90) {
    errors.age = "سن باید یک عدد معتبر بین ۱۲ تا ۹۰ باشد.";
  }

  if (!height || height < 80 || height > 230) {
    errors.heightCm = "قد باید یک عدد معتبر بین ۸۰ تا ۲۳۰ سانتی متر باشد.";
  }

  if (!weight || weight < 30 || weight > 250) {
    errors.weightKg = "وزن باید یک عدد معتبر بین ۳۰ تا ۲۵۰ کیلوگرم باشد.";
  }

  if (!values.primaryGoal) {
    errors.primaryGoal = "هدف اصلی الزامی است.";
  }

  if (!values.trainingLevel) {
    errors.trainingLevel = "سطح تمرینی الزامی است.";
  }

  if (!trainingDays || trainingDays < 1 || trainingDays > 7) {
    errors.trainingDaysPerWeek = "تعداد روز تمرین باید بین ۱ تا ۷ باشد.";
  }

  if (!sessionDuration || sessionDuration <= 0 || sessionDuration > 240) {
    errors.sessionDurationMinutes = "مدت جلسه باید یک عدد مثبت و منطقی باشد.";
  }

  if (values.hasInjury && !values.injuryType.trim()) {
    errors.injuryType = "نوع آسیب را وارد کنید.";
  }

  if (values.hasInjury && splitList(values.aggravatingMovements).length === 0) {
    errors.aggravatingMovements = "حداقل یک حرکت آزاردهنده یا محدودیت را وارد کنید.";
  }

  return errors;
}

export function getFirstErrorField(errors: StudentFormErrors): StudentFormField | undefined {
  return fieldOrder.find((field) => errors[field]);
}

export function studentToFormValues(student: StudentInput): StudentFormValues {
  return {
    age: String(student.age),
    aggravatingMovements: joinList(student.injuries.aggravatingMovements),
    basicMovementFamiliarity: student.trainingBackground.basicMovementFamiliarity,
    cardioInterest: student.trainingConditions.cardioInterest,
    coachNotes: student.coachNotes,
    dailyActivityLevel: student.lifestyle.dailyActivityLevel,
    dietaryPreferences: joinList(student.dietaryPreferences ?? []),
    dietaryRestrictions: joinList(student.dietaryRestrictions ?? []),
    disallowedExercises: joinList(student.injuries.disallowedExercises),
    dislikedTrainingStyles: student.preferences.dislikedTrainingStyles,
    favoriteExercises: student.preferences.favoriteExercises,
    foodAllergies: joinList(student.foodAllergies ?? []),
    foodIntolerances: joinList(student.foodIntolerances ?? []),
    fullName: student.fullName,
    gender: student.gender,
    hasBarbell: student.equipment.hasBarbell,
    hasCable: student.equipment.hasCable,
    hasDumbbell: student.equipment.hasDumbbell,
    hasFreeWeightExperience: student.trainingBackground.hasFreeWeightExperience,
    hasFullGym: student.equipment.hasFullGym,
    hasInjury: student.injuries.hasInjury,
    hasMachines: student.equipment.hasMachines,
    heightCm: String(student.heightCm),
    heavyTrainingInterest: student.trainingConditions.heavyTrainingInterest,
    injuryType: student.injuries.injuryType,
    intensityPreference: student.preferences.intensityPreference,
    musclePriorities: student.goals.musclePriorities,
    nutritionNotes: student.nutritionNotes ?? "",
    occupation: student.lifestyle.occupation,
    phoneNumber: student.phoneNumber ?? "",
    primaryGoal: student.goals.primaryGoal,
    relevantMedicalNotes: student.relevantMedicalNotes ?? "",
    secondaryGoal: student.goals.secondaryGoal,
    sessionDurationMinutes: String(student.trainingConditions.sessionDurationMinutes),
    sleepQuality: student.lifestyle.sleepQuality,
    status: student.status,
    stressLevel: student.lifestyle.stressLevel,
    strongMuscles: student.goals.strongMuscles,
    supplementRestrictions: joinList(student.supplementRestrictions ?? []),
    trainingDaysPerWeek: String(student.trainingConditions.trainingDaysPerWeek),
    trainingExperience: student.trainingBackground.trainingExperience,
    trainingLevel: student.trainingBackground.level,
    trainingPreference: student.trainingConditions.trainingPreference,
    varietyPreference: student.preferences.varietyPreference,
    weakMuscles: student.goals.weakMuscles,
    weightKg: String(student.weightKg)
  };
}

export function formValuesToStudentInput(
  values: StudentFormValues,
  previous?: StudentInput
): StudentInput {
  const hasInjury = values.hasInjury;
  const primaryGoal = values.primaryGoal;
  const trainingLevel = values.trainingLevel;

  if (!primaryGoal || !trainingLevel) {
    throw new Error("Student form values are not valid.");
  }

  return {
    age: Number(values.age),
    coachNotes: values.coachNotes.trim(),
    dietaryPreferences: splitList(values.dietaryPreferences),
    dietaryRestrictions: splitList(values.dietaryRestrictions),
    equipment: {
      hasBarbell: values.hasBarbell,
      hasCable: values.hasCable,
      hasDumbbell: values.hasDumbbell,
      hasFullGym: values.hasFullGym,
      hasMachines: values.hasMachines
    },
    foodAllergies: splitList(values.foodAllergies),
    foodIntolerances: splitList(values.foodIntolerances),
    fullName: values.fullName.trim(),
    gender: values.gender,
    goals: {
      musclePriorities: values.musclePriorities,
      primaryGoal,
      secondaryGoal: values.secondaryGoal.trim(),
      strongMuscles: values.strongMuscles,
      weakMuscles: values.weakMuscles
    },
    heightCm: Number(values.heightCm),
    injuries: {
      aggravatingMovements: hasInjury ? splitList(values.aggravatingMovements) : [],
      disallowedExercises: hasInjury ? splitList(values.disallowedExercises) : [],
      hasInjury,
      injuryType: hasInjury ? values.injuryType.trim() : ""
    },
    lifestyle: {
      dailyActivityLevel: values.dailyActivityLevel.trim(),
      occupation: values.occupation.trim(),
      sleepQuality: values.sleepQuality.trim(),
      stressLevel: values.stressLevel.trim()
    },
    nutritionNotes: values.nutritionNotes.trim(),
    phoneNumber: values.phoneNumber.trim(),
    preferences: {
      dislikedTrainingStyles: values.dislikedTrainingStyles.trim(),
      favoriteExercises: values.favoriteExercises.trim(),
      intensityPreference: values.intensityPreference.trim(),
      varietyPreference: values.varietyPreference.trim()
    },
    relevantMedicalNotes: values.relevantMedicalNotes.trim(),
    status: values.status,
    summary: {
      currentProgramTitle:
        previous?.summary.currentProgramTitle ||
        values.musclePriorities.join(" و ") ||
        "برنامه جدید",
      lastVisitDate: previous?.summary.lastVisitDate || "بدون مراجعه",
      medicalNote:
        previous?.summary.medicalNote || (hasInjury ? values.injuryType.trim() : "بدون محدودیت")
    },
    supplementRestrictions: splitList(values.supplementRestrictions),
    trainingBackground: {
      basicMovementFamiliarity: values.basicMovementFamiliarity.trim(),
      hasFreeWeightExperience: values.hasFreeWeightExperience,
      level: trainingLevel,
      trainingExperience: values.trainingExperience.trim()
    },
    trainingConditions: {
      cardioInterest: values.cardioInterest.trim(),
      heavyTrainingInterest: values.heavyTrainingInterest.trim(),
      sessionDurationMinutes: Number(values.sessionDurationMinutes),
      trainingDaysPerWeek: Number(values.trainingDaysPerWeek),
      trainingPreference: values.trainingPreference.trim()
    },
    weightKg: Number(values.weightKg)
  };
}
