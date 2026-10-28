import type { TrainingRecipeStep } from "../types/coachRules";

function digits(value: unknown): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function repBounds(value: unknown): [number, number] | null {
  const match = digits(value)
    .trim()
    .match(/^(\d+)(?:\s*(?:-|–|تا)\s*(\d+))?$/);
  return match ? [Number(match[1]), Number(match[2] ?? match[1])] : null;
}

export function tempoParts(value: unknown): string[] | null {
  const parts = digits(value)
    .trim()
    .split(/\s*[-:–]\s*/);
  if (
    ![3, 4].includes(parts.length) ||
    parts.some(
      (part, index) => !/^\d{1,2}$/.test(part) && !(index === 2 && part.toUpperCase() === "X")
    )
  )
    return null;
  return parts.length === 3 ? [...parts, "0"] : parts;
}

export function operationStep(op: string): TrainingRecipeStep {
  switch (op) {
    case "prescribe":
      return { op, sets: 3, reps: "8-12", rest_seconds: 90, rpe: "RIR 2" };
    case "rest":
      return { op, seconds: 20 };
    case "load_change":
      return { op, direction: "down", percent: 20 };
    case "partial_range":
      return { op, mode: "after_failure", count: 3 };
    case "tempo":
      return { op, pattern: "3-1-2-0" };
    case "repeat":
      return { op, count: 2, steps: [{ op: "instruction", title: "", text: "" }] };
    default:
      return { op: "instruction", title: "", text: "" };
  }
}
