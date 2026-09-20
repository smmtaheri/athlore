import type { PrimaryGoal, StudentGender, StudentStatus, TrainingLevel } from "./student";

export const genderLabels: Record<StudentGender, string> = {
  female: "زن",
  male: "مرد"
};

export const statusLabels: Record<StudentStatus, string> = {
  active: "فعال",
  inactive: "غیرفعال"
};

export const goalLabels: Record<PrimaryGoal, string> = {
  body_recomposition: "فرم دهی بدن",
  fat_loss: "کاهش وزن",
  general_health: "سلامت عمومی",
  hypertrophy: "عضله سازی",
  strength: "افزایش قدرت"
};

export const trainingLevelLabels: Record<TrainingLevel, string> = {
  advanced: "حرفه‌ای",
  beginner: "مبتدی",
  intermediate: "نیمه‌حرفه‌ای"
};

export const genderOptions = [
  { label: genderLabels.male, value: "male" },
  { label: genderLabels.female, value: "female" }
] as const;

export const statusOptions = [
  { label: statusLabels.active, value: "active" },
  { label: statusLabels.inactive, value: "inactive" }
] as const;

export const goalOptions = [
  { label: goalLabels.hypertrophy, value: "hypertrophy" },
  { label: goalLabels.fat_loss, value: "fat_loss" },
  { label: goalLabels.strength, value: "strength" },
  { label: goalLabels.body_recomposition, value: "body_recomposition" },
  { label: goalLabels.general_health, value: "general_health" }
] as const;

export const trainingLevelOptions = [
  { label: trainingLevelLabels.beginner, value: "beginner" },
  { label: trainingLevelLabels.intermediate, value: "intermediate" },
  { label: trainingLevelLabels.advanced, value: "advanced" }
] as const;

export const muscleOptions = [
  "سینه",
  "سرشانه",
  "پشت بازو",
  "زیربغل",
  "جلو بازو",
  "پا",
  "شکم",
  "کمر"
];

export const familiarityOptions = [
  { label: "نیاز به آموزش", value: "نیاز به آموزش" },
  { label: "تقریبا خوب", value: "تقریبا خوب" },
  { label: "خوب", value: "خوب" },
  { label: "عالی", value: "عالی" }
];

export const activityOptions = [
  { label: "کم", value: "کم" },
  { label: "متوسط", value: "متوسط" },
  { label: "زیاد", value: "زیاد" }
];
