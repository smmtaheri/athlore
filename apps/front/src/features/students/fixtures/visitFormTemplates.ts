import type { VisitFormTemplate } from "../types/visitForm";

/** Generic mock template — used only when VITE_USE_MOCK_API=true. */
export const visitFormTemplateFixture: VisitFormTemplate = {
  createdAt: "2026-01-01T00:00:00.000Z",
  description: "قالب فرم ویزیت قابل پیکربندی مربی برای ثبت وضعیت شاگرد.",
  id: "tpl-default-v1",
  isActive: true,
  isDefault: true,
  key: "default_v1",
  name: "فرم ویزیت پایه",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
  sections: [
    {
      key: "core",
      label: "ارزیابی پایه",
      order: 0,
      fields: [
        {
          key: "goal",
          semanticKey: "goal",
          label: "هدف اصلی",
          type: "single_select",
          options: [
            { value: "hypertrophy", label: "هایپرتروفی" },
            { value: "fat_loss", label: "کاهش چربی" },
            { value: "maintain_weight", label: "حفظ وزن" },
            { value: "gain_weight", label: "افزایش وزن" }
          ],
          required: true,
          enabled: true,
          order: 0,
          helpText: "",
          prefillFrom: ""
        },
        {
          key: "training_level",
          semanticKey: "training_level",
          label: "سطح تمرین",
          type: "single_select",
          options: [
            { value: "beginner", label: "مبتدی" },
            { value: "intermediate", label: "متوسط" },
            { value: "advanced", label: "پیشرفته" }
          ],
          required: false,
          enabled: true,
          order: 1,
          helpText: "",
          prefillFrom: ""
        },
        {
          key: "injuries",
          semanticKey: "injuries",
          label: "آسیب‌ها",
          type: "multi_select",
          options: [
            { value: "neck", label: "گردن" },
            { value: "back", label: "کمر" },
            { value: "knee", label: "زانو" },
            { value: "shoulder", label: "شانه" }
          ],
          required: false,
          enabled: true,
          order: 2,
          helpText: "مواردی که باید در برنامه لحاظ شود.",
          prefillFrom: ""
        },
        {
          key: "weak_muscles",
          semanticKey: "weak_muscles",
          label: "عضلات ضعیف",
          type: "multi_select",
          options: [
            { value: "chest", label: "سینه" },
            { value: "back", label: "پشت" },
            { value: "shoulders", label: "شانه" },
            { value: "legs", label: "پا" },
            { value: "arms", label: "بازو" }
          ],
          required: false,
          enabled: true,
          order: 3,
          helpText: "",
          prefillFrom: ""
        },
        {
          key: "sessions_per_week",
          semanticKey: "sessions_per_week",
          label: "روزهای تمرین در هفته",
          type: "number",
          options: [],
          required: false,
          enabled: true,
          order: 4,
          helpText: "",
          prefillFrom: ""
        },
        {
          key: "notes_summary",
          semanticKey: "",
          label: "خلاصه مشاهدات",
          type: "textarea",
          options: [],
          required: false,
          enabled: true,
          order: 5,
          helpText: "یادداشت آزاد مربی در این ویزیت.",
          prefillFrom: ""
        }
      ]
    }
  ]
};

/** @deprecated Use visitFormTemplateFixture */
export const assessmentTemplateFixture = visitFormTemplateFixture;
