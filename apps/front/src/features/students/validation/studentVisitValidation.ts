import type {
  StudentVisit,
  StudentVisitFormErrors,
  StudentVisitFormField,
  StudentVisitFormValues,
  StudentVisitInput
} from "../types/monthlyVisit";
import type { Student } from "../types/student";

const defaultLevel = "medium" as const;
const fieldOrder: StudentVisitFormField[] = [
  "visitDate",
  "currentWeightKg",
  "bodyFatPercentage",
  "chestCm",
  "waistCm",
  "armCm",
  "thighCm",
  "hipCm",
  "overallPercent",
  "trainingPercent",
  "nutritionPercent",
  "supplementsPercent",
  "newInjuryNotes"
];

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function parseIsoDate(value: string): string | undefined {
  const normalized = toEnglishDigits(value).trim();
  const match = ISO_DATE_PATTERN.exec(normalized);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return normalized;
}

function parseNumber(value: string): number | undefined {
  const normalized = toEnglishDigits(value).trim().replace("٫", ".").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  return parseNumber(value);
}

function numberToString(value?: number): string {
  return value === undefined ? "" : String(value);
}

function validateOptionalPositiveNumber(
  errors: StudentVisitFormErrors,
  field: StudentVisitFormField,
  value: string,
  label: string
) {
  if (!value.trim()) {
    return;
  }

  const parsed = parseNumber(value);

  if (parsed === undefined || parsed < 0) {
    errors[field] = `${label} باید عدد معتبر باشد.`;
  }
}

function validatePercent(
  errors: StudentVisitFormErrors,
  field: StudentVisitFormField,
  value: string,
  label: string
) {
  const parsed = parseNumber(value);

  if (parsed === undefined || parsed < 0 || parsed > 100) {
    errors[field] = `${label} باید عددی بین ۰ تا ۱۰۰ باشد.`;
  }
}

export function createEmptyVisitFormValues(
  student: Student,
  latestVisit?: StudentVisit
): StudentVisitFormValues {
  const previousWeight = latestVisit?.currentWeightKg ?? student.weightKg;

  return {
    armCm: "",
    bodyFatPercentage: "",
    bodyFeeling: "مشابه قبل",
    chestCm: "",
    coachAssessment: "",
    coachNotes: "",
    coachPrivateNotes: "",
    currentWeightKg: String(student.weightKg),
    dailyEnergyLevel: defaultLevel,
    hasNewInjury: false,
    hipCm: "",
    newInjuryNotes: "",
    nextCycleGoal: "",
    nutritionPercent: "80",
    overallPercent: "80",
    previousWeightKg: String(previousWeight),
    sleepQuality: defaultLevel,
    stressLevel: defaultLevel,
    studentFeedback: "",
    supplementsPercent: "80",
    thighCm: "",
    trainingConditionChanges: "",
    trainingPercent: "80",
    visitDate: "",
    waistCm: ""
  };
}

export function studentVisitToFormValues(visit: StudentVisit): StudentVisitFormValues {
  return {
    armCm: numberToString(visit.measurements.armCm),
    bodyFatPercentage: numberToString(visit.bodyFatPercentage),
    bodyFeeling: visit.bodyFeeling,
    chestCm: numberToString(visit.measurements.chestCm),
    coachAssessment: visit.coachAssessment,
    coachNotes: visit.coachNotes,
    coachPrivateNotes: visit.coachPrivateNotes ?? "",
    currentWeightKg: String(visit.currentWeightKg),
    dailyEnergyLevel: visit.dailyEnergyLevel,
    hasNewInjury: visit.hasNewInjury,
    hipCm: numberToString(visit.measurements.hipCm),
    newInjuryNotes: visit.newInjuryNotes,
    nextCycleGoal: visit.nextCycleGoal,
    nutritionPercent: String(visit.adherence.nutritionPercent),
    overallPercent: String(visit.adherence.overallPercent),
    previousWeightKg: String(visit.previousWeightKg),
    sleepQuality: visit.sleepQuality,
    stressLevel: visit.stressLevel,
    studentFeedback: visit.studentFeedback,
    supplementsPercent: String(visit.adherence.supplementsPercent),
    thighCm: numberToString(visit.measurements.thighCm),
    trainingConditionChanges: visit.trainingConditionChanges,
    trainingPercent: String(visit.adherence.trainingPercent),
    visitDate: visit.visitDate,
    waistCm: numberToString(visit.measurements.waistCm)
  };
}

export function validateStudentVisitForm(values: StudentVisitFormValues): StudentVisitFormErrors {
  const errors: StudentVisitFormErrors = {};
  const currentWeight = parseNumber(values.currentWeightKg);

  if (!values.visitDate.trim()) {
    errors.visitDate = "تاریخ ویزیت الزامی است.";
  } else if (!parseIsoDate(values.visitDate)) {
    errors.visitDate = "تاریخ ویزیت باید میلادی و به شکل YYYY-MM-DD باشد (مثلاً 2026-08-09).";
  }

  if (!currentWeight || currentWeight < 30 || currentWeight > 250) {
    errors.currentWeightKg = "وزن فعلی باید یک عدد معتبر بین ۳۰ تا ۲۵۰ کیلوگرم باشد.";
  }

  validateOptionalPositiveNumber(
    errors,
    "bodyFatPercentage",
    values.bodyFatPercentage,
    "درصد چربی"
  );
  validateOptionalPositiveNumber(errors, "chestCm", values.chestCm, "دور سینه");
  validateOptionalPositiveNumber(errors, "waistCm", values.waistCm, "دور کمر");
  validateOptionalPositiveNumber(errors, "armCm", values.armCm, "دور بازو");
  validateOptionalPositiveNumber(errors, "thighCm", values.thighCm, "دور ران");
  validateOptionalPositiveNumber(errors, "hipCm", values.hipCm, "دور باسن");
  validatePercent(errors, "overallPercent", values.overallPercent, "میزان پایبندی کلی");
  validatePercent(errors, "trainingPercent", values.trainingPercent, "میزان رعایت تمرینات");
  validatePercent(errors, "nutritionPercent", values.nutritionPercent, "میزان رعایت تغذیه");
  validatePercent(errors, "supplementsPercent", values.supplementsPercent, "میزان رعایت مکمل ها");

  if (values.hasNewInjury && !values.newInjuryNotes.trim()) {
    errors.newInjuryNotes = "جزئیات آسیب یا محدودیت جدید را وارد کنید.";
  }

  return errors;
}

export function getFirstVisitErrorField(
  errors: StudentVisitFormErrors
): StudentVisitFormField | undefined {
  return fieldOrder.find((field) => errors[field]);
}

export function visitFormValuesToInput(values: StudentVisitFormValues): StudentVisitInput {
  const currentWeight = parseNumber(values.currentWeightKg);
  const previousWeight = parseNumber(values.previousWeightKg);
  const overallPercent = parseNumber(values.overallPercent);
  const trainingPercent = parseNumber(values.trainingPercent);
  const nutritionPercent = parseNumber(values.nutritionPercent);
  const supplementsPercent = parseNumber(values.supplementsPercent);

  if (
    currentWeight === undefined ||
    previousWeight === undefined ||
    overallPercent === undefined ||
    trainingPercent === undefined ||
    nutritionPercent === undefined ||
    supplementsPercent === undefined
  ) {
    throw new Error("Visit form values are not valid.");
  }

  return {
    adherence: {
      nutritionPercent,
      overallPercent,
      supplementsPercent,
      trainingPercent
    },
    bodyFatPercentage: optionalNumber(values.bodyFatPercentage),
    bodyFeeling: values.bodyFeeling.trim(),
    coachAssessment: values.coachAssessment.trim(),
    coachNotes: values.coachNotes.trim(),
    coachPrivateNotes: values.coachPrivateNotes.trim(),
    currentWeightKg: currentWeight,
    dailyEnergyLevel: values.dailyEnergyLevel,
    hasNewInjury: values.hasNewInjury,
    measurements: {
      armCm: optionalNumber(values.armCm),
      chestCm: optionalNumber(values.chestCm),
      hipCm: optionalNumber(values.hipCm),
      thighCm: optionalNumber(values.thighCm),
      waistCm: optionalNumber(values.waistCm)
    },
    newInjuryNotes: values.hasNewInjury ? values.newInjuryNotes.trim() : "بدون مورد جدید",
    nextCycleGoal: values.nextCycleGoal.trim(),
    previousWeightKg: previousWeight,
    sleepQuality: values.sleepQuality,
    stressLevel: values.stressLevel,
    studentFeedback: values.studentFeedback.trim(),
    trainingConditionChanges: values.trainingConditionChanges.trim(),
    visitDate: parseIsoDate(values.visitDate) ?? toEnglishDigits(values.visitDate).trim()
  };
}
