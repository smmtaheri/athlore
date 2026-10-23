import type {
  ProgramTemplate,
  TemplateBlock,
  TemplateExecutionPlan,
  TemplateSlot
} from "../types/coachRules";

export const templateMuscles = [
  ["chest", "سینه"],
  ["back", "زیربغل"],
  ["shoulders", "سرشانه"],
  ["quadriceps", "چهارسر ران"],
  ["hamstrings", "همسترینگ"],
  ["glutes", "باسن"],
  ["biceps", "جلو بازو"],
  ["triceps", "پشت بازو"],
  ["calves", "ساق"],
  ["core", "شکم"]
] as const;

export function newSlot(muscle = "", defaults = { minimum: 10, maximum: 12 }): TemplateSlot {
  return {
    muscle_key: muscle,
    exercise_id: null,
    unit: "reps",
    minimum: defaults.minimum,
    maximum: defaults.maximum,
    reps_source: "default"
  };
}

export function newBlock(muscle = "", defaults = { minimum: 10, maximum: 12 }): TemplateBlock {
  return {
    system_key: null,
    sets: null,
    rest_seconds: null,
    between_seconds: null,
    slots: [newSlot(muscle, defaults)]
  };
}

export function newExecutionPlan(): TemplateExecutionPlan {
  return {
    version: 1,
    description: "",
    defaults: { sets: 3, minimum: 10, maximum: 12, rest_seconds: 90, rir: 2 },
    days: [{ muscles: [], blocks: [] }]
  };
}

export function convertTemplate(template: ProgramTemplate): TemplateExecutionPlan {
  const plan = newExecutionPlan();
  plan.description = template.specialRules.join("\n");
  plan.days = Array.from({ length: template.daysPerWeek }, (_, index) => {
    const text = (template.split[index] ?? "").replaceAll("‌", " ");
    const muscles = templateMuscles
      .filter(([key, label]) => text.includes(label) || text.toLowerCase().includes(key))
      .map(([key]) => String(key));
    if (/فول بادی|full.body/i.test(text))
      muscles.push("chest", "back", "quadriceps", "hamstrings", "shoulders");
    else if (/(^|\s)پا($|\s)/.test(text)) muscles.push("quadriceps", "hamstrings", "calves");
    const unique = [...new Set(muscles)];
    return { muscles: unique, blocks: unique.map((muscle) => newBlock(muscle, plan.defaults)) };
  });
  return plan;
}

export function withExecutionPlan(
  template: ProgramTemplate,
  plan: TemplateExecutionPlan
): ProgramTemplate {
  return {
    ...template,
    executionPlan: plan,
    daysPerWeek: plan.days.length,
    split: plan.days.map((day) =>
      day.muscles.map((key) => templateMuscles.find(([id]) => id === key)?.[1] ?? key).join(" و ")
    ),
    intensity: "",
    volume: "",
    restTime: "",
    specialRules: [],
    musclePriorityOrder: []
  };
}

export function validateTemplatePlans(templates: ProgramTemplate[]): string | null {
  const integer = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max;
  for (const template of templates) {
    if (!template.name.trim()) return "نام قالب را وارد کنید.";
    const plan = template.executionPlan;
    if (!plan) continue;
    const d = plan.defaults;
    if (
      !integer(d.sets, 1, 30) ||
      !integer(d.minimum, 1, 300) ||
      !integer(d.maximum, d.minimum, 300) ||
      !integer(d.rest_seconds, 0, 900) ||
      !integer(d.rir, 0, 10)
    )
      return `پیش‌فرض‌های قالب «${template.name}» معتبر نیست.`;
    for (const [index, day] of plan.days.entries()) {
      if (!day.muscles.length || !day.blocks.length)
        return `در قالب «${template.name}»، عضلات و بلوک‌های جلسهٔ ${index + 1} را مشخص کنید.`;
      for (const block of day.blocks) {
        if (
          (block.sets !== null && !integer(block.sets, 1, 30)) ||
          (block.rest_seconds !== null && !integer(block.rest_seconds, 0, 900)) ||
          (block.between_seconds !== null && !integer(block.between_seconds, 0, 900))
        )
          return "ست یا استراحت بلوک معتبر نیست.";
        for (const slot of block.slots) {
          if (
            !day.muscles.includes(slot.muscle_key) ||
            (slot.reps_source === "custom" &&
              (!integer(slot.minimum, 1, slot.unit === "seconds" ? 3600 : 300) ||
                !integer(slot.maximum, slot.minimum, slot.unit === "seconds" ? 3600 : 300)))
          )
            return "عضله یا مقدار اجرای یکی از حرکت‌ها معتبر نیست.";
        }
      }
    }
  }
  return null;
}
