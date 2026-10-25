import type {
  StudentVisit,
  StudentVisitFormErrors,
  StudentVisitFormField,
  StudentVisitFormValues,
  StudentVisitInput
} from "../types/monthlyVisit";
import type { Student } from "../types/student";
import {
  calendarInputValue,
  calendarInputToIso,
  todayCalendarInput,
  calendarName
} from "../../../shared/dates/calendar";

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
  "supplementsPercent"
];

function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
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
  if (!value.trim()) return;
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
    bodyFeeling: "",
    chestCm: "",
    coachAssessment: "",
    coachNotes: "",
    coachPrivateNotes: "",
    currentWeightKg: String(student.weightKg),
    dailyEnergyLevel: "",
    hasNewInjury: false,
    hipCm: "",
    newInjuryNotes: "",
    nextCycleGoal: "",
    nutritionPercent: "",
    overallPercent: "",
    previousWeightKg: String(previousWeight),
    sleepQuality: "",
    stressLevel: "",
    studentFeedback: "",
    supplementsPercent: "",
    thighCm: "",
    trainingConditionChanges: "",
    trainingPercent: "",
    visitDate: todayCalendarInput(),
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
    dailyEnergyLevel: visit.dailyEnergyLevel ?? "",
    hasNewInjury: visit.hasNewInjury,
    hipCm: numberToString(visit.measurements.hipCm),
    newInjuryNotes: visit.newInjuryNotes,
    nextCycleGoal: visit.nextCycleGoal,
    nutritionPercent:
      visit.adherence.nutritionPercent == null ? "" : String(visit.adherence.nutritionPercent),
    overallPercent:
      visit.adherence.overallPercent == null ? "" : String(visit.adherence.overallPercent),
    previousWeightKg: String(visit.previousWeightKg),
    sleepQuality: visit.sleepQuality ?? "",
    stressLevel: visit.stressLevel ?? "",
    studentFeedback: visit.studentFeedback,
    supplementsPercent:
      visit.adherence.supplementsPercent == null ? "" : String(visit.adherence.supplementsPercent),
    thighCm: numberToString(visit.measurements.thighCm),
    trainingConditionChanges: visit.trainingConditionChanges,
    trainingPercent:
      visit.adherence.trainingPercent == null ? "" : String(visit.adherence.trainingPercent),
    visitDate: calendarInputValue(visit.visitDate),
    waistCm: numberToString(visit.measurements.waistCm)
  };
}

export function validateStudentVisitForm(values: StudentVisitFormValues): StudentVisitFormErrors {
  const errors: StudentVisitFormErrors = {};
  const currentWeight = parseNumber(values.currentWeightKg);

  if (!values.visitDate.trim()) {
    errors.visitDate = "تاریخ ویزیت الزامی است.";
  } else if (!calendarInputToIso(values.visitDate)) {
    errors.visitDate = `تاریخ ویزیت ${calendarName()} را به شکل سال/ماه/روز وارد کنید.`;
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
  const overallPercent = optionalNumber(values.overallPercent) ?? null;
  const trainingPercent = optionalNumber(values.trainingPercent) ?? null;
  const nutritionPercent = optionalNumber(values.nutritionPercent) ?? null;
  const supplementsPercent = optionalNumber(values.supplementsPercent) ?? null;

  if (currentWeight === undefined || previousWeight === undefined) {
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
    dailyEnergyLevel: values.dailyEnergyLevel || null,
    hasNewInjury: values.hasNewInjury,
    measurements: {
      armCm: optionalNumber(values.armCm),
      chestCm: optionalNumber(values.chestCm),
      hipCm: optionalNumber(values.hipCm),
      thighCm: optionalNumber(values.thighCm),
      waistCm: optionalNumber(values.waistCm)
    },
    newInjuryNotes: values.newInjuryNotes.trim(),
    nextCycleGoal: values.nextCycleGoal.trim(),
    previousWeightKg: previousWeight,
    sleepQuality: values.sleepQuality || null,
    stressLevel: values.stressLevel || null,
    studentFeedback: values.studentFeedback.trim(),
    trainingConditionChanges: values.trainingConditionChanges.trim(),
    visitDate: calendarInputToIso(values.visitDate) ?? toEnglishDigits(values.visitDate).trim()
  };
}
