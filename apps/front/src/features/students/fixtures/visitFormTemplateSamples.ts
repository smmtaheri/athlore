import fullAssessment from "./visitFormCatalog.json";
import type {
  VisitFormFieldDefinition,
  VisitFormFieldType,
  VisitFormSectionDefinition,
  VisitFormTemplate
} from "../types/visitForm";

function field(
  key: string,
  label: string,
  type: VisitFormFieldType,
  options: VisitFormFieldDefinition["options"] = [],
  extras: Partial<VisitFormFieldDefinition> = {}
): VisitFormFieldDefinition {
  return {
    coachEditable: true,
    coachHelpText: "",
    enabled: true,
    helpText: "",
    key,
    label,
    options,
    order: 0,
    prefillFrom: "",
    required: false,
    semanticKey: "",
    studentEditable: false,
    studentVisible: false,
    studentVisibleWhenFinalized: false,
    type,
    ...extras
  };
}

function section(key: string, label: string, fields: VisitFormFieldDefinition[], order: number) {
  return { fields: fields.map((item, index) => ({ ...item, order: index })), key, label, order };
}

function sample(
  key: string,
  name: string,
  description: string,
  sections: VisitFormSectionDefinition[]
): VisitFormTemplate {
  return {
    description,
    id: `sample-${key}`,
    isActive: true,
    isDefault: false,
    key,
    name,
    sections,
    theme: "athlore",
    version: 1
  };
}

const goals = [
  { label: "افزایش وزن و عضله", value: "gain_weight" },
  { label: "کاهش وزن", value: "lose_weight" },
  { label: "حفظ وزن", value: "maintain_weight" }
];
const levels = [
  { label: "مبتدی", value: "beginner" },
  { label: "متوسط", value: "intermediate" },
  { label: "نیمه‌حرفه‌ای", value: "semi_professional" },
  { label: "حرفه‌ای", value: "professional" }
];

const initialAssessment = sample(
  "initial_assessment_v1",
  "ارزیابی شروع همکاری",
  "اطلاعات پایه، هدف، سطح و محدودیت‌های شاگرد برای شروع برنامه‌ریزی.",
  [
    section(
      "profile",
      "اطلاعات و هدف",
      [
        field("full_name", "نام و نام خانوادگی", "text", [], {
          prefillFrom: "student.full_name",
          studentVisible: true
        }),
        field("age", "سن", "number", [], { prefillFrom: "student.age", studentVisible: true }),
        field("height_cm", "قد (سانتی‌متر)", "number", [], {
          prefillFrom: "student.height_cm",
          studentVisible: true
        }),
        field("weight_kg", "وزن (کیلوگرم)", "number", [], {
          prefillFrom: "student.weight_kg",
          semanticKey: "weight_kg",
          studentEditable: true,
          studentVisible: true
        }),
        field("goal", "هدف اصلی تمرین", "single_select", goals, {
          semanticKey: "goal",
          studentEditable: true,
          studentVisible: true
        }),
        field("training_level", "سطح تمرین", "single_select", levels, {
          semanticKey: "training_level",
          studentEditable: true,
          studentVisible: true
        }),
        field("sessions_per_week", "جلسه تمرین در هفته", "number", [], {
          semanticKey: "sessions_per_week",
          studentEditable: true,
          studentVisible: true
        })
      ],
      0
    ),
    section(
      "health",
      "سلامت و محدودیت‌ها",
      [
        field(
          "injuries",
          "آسیب یا محدودیت فعال",
          "multi_select",
          [
            { label: "گردن", value: "neck" },
            { label: "کمر", value: "back" },
            { label: "زانو", value: "knee" },
            { label: "شانه", value: "shoulder" },
            { label: "سایر", value: "other" }
          ],
          { semanticKey: "injuries", studentEditable: true, studentVisible: true }
        ),
        field("injury_notes", "توضیح تکمیلی", "textarea", [], {
          studentEditable: true,
          studentVisible: true
        })
      ],
      1
    )
  ]
);

const monthlyProgress = sample(
  "monthly_progress_v1",
  "پیگیری ماهانه پیشرفت",
  "ثبت تغییرات وزن، تمرین، خواب و نکته‌های ماه گذشته.",
  [
    section(
      "measurements",
      "اندازه‌گیری این ماه",
      [
        field("assessment_date", "تاریخ ارزیابی", "date", [], {
          semanticKey: "assessment_date",
          studentEditable: true,
          studentVisible: true
        }),
        field("weight_kg", "وزن فعلی (کیلوگرم)", "number", [], {
          studentEditable: true,
          studentVisible: true
        }),
        field("sessions_per_week", "جلسه تمرین در هفته", "number", [], {
          semanticKey: "sessions_per_week",
          studentEditable: true,
          studentVisible: true
        })
      ],
      0
    ),
    section(
      "feedback",
      "وضعیت و بازخورد",
      [
        field(
          "sleep_quality",
          "کیفیت خواب",
          "single_select",
          [
            { label: "ضعیف", value: "low" },
            { label: "متوسط", value: "medium" },
            { label: "خوب", value: "good" }
          ],
          { studentEditable: true, studentVisible: true }
        ),
        field("student_feedback", "توضیحات شاگرد", "textarea", [], {
          studentEditable: true,
          studentVisible: true
        }),
        field("coach_notes", "یادداشت مربی", "textarea")
      ],
      1
    )
  ]
);

export const visitFormTemplateSamples: VisitFormTemplate[] = [
  ...(fullAssessment as VisitFormTemplate[]),
  initialAssessment,
  monthlyProgress
];
