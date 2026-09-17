import type { CoachRules, ProgramTemplate } from "../../coach-rules/types/coachRules";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import type { Student } from "../../students/types/student";
import type {
  GeneratedProgram,
  NutritionMeal,
  ProgramGenerationInput,
  SupplementItem,
  TrainingDay,
  TrainingExercise
} from "../types/generatedProgram";

export interface GenerateProgramParams {
  input: ProgramGenerationInput;
  rules: CoachRules;
  student: Student;
  visit?: StudentVisit;
}

const fallbackMainExercises: Record<string, string[]> = {
  پا: ["پرس پا", "ددلیفت رومانیایی", "جلوپا دستگاه"],
  سینه: ["پرس سینه هالتر", "پرس بالا سینه دمبل", "کراس اور"],
  سرشانه: ["نشر جانب دمبل", "پرس سرشانه دستگاه", "فیس پول"],
  زیربغل: ["لت سیم کش", "روئینگ دستگاه", "بارفیکس کمکی"]
};

export function generateProgram({
  input,
  rules,
  student,
  visit
}: GenerateProgramParams): GeneratedProgram {
  const now = new Date().toISOString();
  const template =
    rules.templates.find((item) => item.id === input.templateId) ?? rules.templates[0];
  const id = createStableId(input.studentId, input.title, input.daysPerWeek);
  const includeTraining = input.programType === "workout" || input.programType === "complete";
  const includeNutrition = input.programType === "nutrition" || input.programType === "complete";
  const includeSupplements = input.programType === "supplement" || input.programType === "complete";

  return {
    createdAt: now,
    dateRange: `${input.durationWeeks} هفته`,
    id,
    nutrition: includeNutrition ? createNutrition(student, visit) : undefined,
    pdfSettings: {
      contactInfo: "شماره تماس مربی",
      fileTitle: input.title,
      includeCoachName: true,
      includeCoachNotes: true,
      includeNutrition,
      includeStudentName: true,
      includeSupplements,
      includeTraining,
      pageSize: "A4",
      style: "modern"
    },
    programType: input.programType,
    status: "draft",
    studentId: student.id,
    supplements: includeSupplements ? createSupplements() : undefined,
    title: input.title,
    training: includeTraining
      ? {
          days: createTrainingDays(input, rules, student, template),
          summary: `${input.daysPerWeek} روز تمرین بر اساس ${template.name} و سطح ${levelLabel(input.level)}`
        }
      : undefined,
    updatedAt: now,
    version: 1
  };
}

function createStableId(studentId: string, title: string, days: number) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `program-${studentId}-${slug || "generated"}-${days}`;
}

function createTrainingDays(
  input: ProgramGenerationInput,
  rules: CoachRules,
  student: Student,
  template: ProgramTemplate
): TrainingDay[] {
  const priorityMuscles = [
    ...input.musclePriorities,
    ...student.goals.weakMuscles,
    ...student.goals.musclePriorities
  ].filter(Boolean);
  const muscles = unique([
    ...priorityMuscles,
    ...template.musclePriorityOrder,
    "زیربغل",
    "پا",
    "سرشانه"
  ]);

  return Array.from({ length: input.daysPerWeek }, (_, index) => {
    const mainMuscle = muscles[index % muscles.length] ?? "سینه";
    const secondMuscle = muscles[(index + 1) % muscles.length] ?? "زیربغل";
    const targetMuscles = unique([mainMuscle, secondMuscle]);
    return {
      exercises: createExercises(targetMuscles, rules, student, input.level, index),
      id: `day-${index + 1}`,
      notes:
        index === 0
          ? "حرکات اصلی اول جلسه آمده اند و حجم عضله اولویت دار کمی بیشتر است."
          : "فرم صحیح و کنترل دامنه حرکت اولویت دارد.",
      order: index + 1,
      targetMuscles,
      title: template.split[index] ?? `روز ${index + 1}`
    };
  });
}

function createExercises(
  muscles: string[],
  rules: CoachRules,
  student: Student,
  level: string,
  dayIndex: number
): TrainingExercise[] {
  const forbidden = new Set([
    ...student.injuries.disallowedExercises,
    ...student.injuries.aggravatingMovements,
    ...rules.injuries.flatMap((injury) =>
      student.injuries.injuryType.includes(injury.name.replace(" ", ""))
        ? injury.forbiddenExercises
        : []
    )
  ]);
  const levelRule = rules.levels.find((item) => item.id === level);
  const baseSetCount = level === "advanced" ? 4 : level === "intermediate" ? 3 : 2;
  const exercises = muscles.flatMap((muscle) => {
    const bank = rules.exerciseBank.find((item) => muscle.includes(item.group));
    const names = [
      ...(bank?.favoriteExercises ?? fallbackMainExercises[muscle] ?? []),
      ...(bank?.beginnerFriendly ?? []),
      ...(fallbackMainExercises[muscle] ?? [])
    ];
    return unique(names)
      .filter((name) => !forbidden.has(name))
      .slice(0, muscle === muscles[0] ? 3 : 2)
      .map((name, index): TrainingExercise => {
        const priorityBonus =
          student.goals.weakMuscles.some((weakMuscle) => muscle.includes(weakMuscle)) ||
          student.goals.musclePriorities.some((priority) => muscle.includes(priority))
            ? 1
            : 0;
        return {
          id: `${dayIndex + 1}-${muscle}-${index + 1}`,
          name,
          notes: index === 0 ? "حرکت اصلی جلسه؛ با گرم کردن کافی شروع شود." : "",
          order: index + 1,
          rest: level === "beginner" ? "۶۰ ثانیه" : "۹۰ ثانیه",
          reps: level === "advanced" ? "۸-۱۰" : "۱۰-۱۲",
          rpe: levelRule?.intensity ?? "متوسط",
          sets: baseSetCount + (index === 0 ? priorityBonus : 0),
          targetMuscle: muscle
        };
      });
  });

  return exercises.map((exercise, index) => ({ ...exercise, order: index + 1 }));
}

function createNutrition(
  student: Student,
  visit?: StudentVisit
): { dailyWater: string; meals: NutritionMeal[]; notes: string } {
  const weight = visit?.currentWeightKg ?? student.weightKg;
  return {
    dailyWater: `${Math.round(weight * 35)} میلی لیتر در روز`,
    meals: [
      {
        foods: [
          { amount: "۱ پیمانه", alternatives: "نان سبوس دار", id: "breakfast-1", name: "جو دوسر" },
          { amount: "۲ عدد", alternatives: "پنیر کم چرب", id: "breakfast-2", name: "تخم مرغ" }
        ],
        id: "breakfast",
        notes: "نمونه قابل ویرایش؛ مقدار نهایی با نظر مربی تنظیم شود.",
        order: 1,
        title: "صبحانه"
      },
      {
        foods: [
          { amount: "۱ کف دست", alternatives: "ماهی یا گوشت کم چرب", id: "lunch-1", name: "مرغ" },
          { amount: "۱ پیمانه", alternatives: "سیب زمینی", id: "lunch-2", name: "برنج" }
        ],
        id: "lunch",
        notes: "",
        order: 2,
        title: "ناهار"
      },
      {
        foods: [
          { amount: "۱ کاسه", alternatives: "سالاد", id: "dinner-1", name: "سبزیجات" },
          {
            amount: "۱ وعده",
            alternatives: "تخم مرغ یا حبوبات",
            id: "dinner-2",
            name: "پروتئین سبک"
          }
        ],
        id: "dinner",
        notes: "وعده سبک تر برای کنترل خواب و ریکاوری.",
        order: 3,
        title: "شام"
      }
    ],
    notes: "این برنامه غذایی نمونه و قابل ویرایش است و محاسبه پزشکی یا درمانی انجام نمی دهد."
  };
}

function createSupplements(): { items: SupplementItem[]; medicalNote: string; summary: string } {
  return {
    items: [
      {
        amount: "۱ وعده نمایشی",
        id: "creatine",
        name: "کراتین",
        notes: "نمونه قابل ویرایش توسط مربی.",
        order: 1,
        timing: "همراه وعده غذایی"
      },
      {
        amount: "در صورت نیاز",
        id: "protein",
        name: "پروتئین وی",
        notes: "برای تکمیل دریافت پروتئین، نه جایگزین وعده اصلی.",
        order: 2,
        timing: "بعد تمرین"
      }
    ],
    medicalNote: "مصرف مکمل باید با شرایط سلامت شاگرد و نظر متخصص مربوطه هماهنگ شود.",
    summary: "نمونه مکمل های قابل ویرایش برای شروع جریان محصول"
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function levelLabel(level: string) {
  if (level === "beginner") {
    return "مبتدی";
  }
  if (level === "advanced") {
    return "حرفه ای";
  }
  return "متوسط";
}
