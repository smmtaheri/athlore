import type { TrainingExercise } from "../../programs/types/generatedProgram";

export function executionRestSeconds(exercise: TrainingExercise, setIndex: number): number {
  const step = exercise.executionPlan?.sets.find((row) => row.setIndex === setIndex);
  if (step) return step.restSeconds;
  // Existing published programs retain their original prescription.
  if (exercise.supersetGroupId || exercise.trainingGroupId) {
    if (!exercise.supersetWithPrevious) return exercise.supersetRestBetweenSeconds ?? 0;
    if (exercise.supersetRestAfterSeconds != null) return exercise.supersetRestAfterSeconds;
  }
  const digits = String(exercise.rest).replace(/[۰-۹]/g, (digit) =>
    String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
  );
  const clock = digits.match(/^(\d{1,2}):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const amount = Number(digits.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
  return /دقیقه|min(?:ute)?s?/i.test(digits) ? Math.round(amount * 60) : Math.round(amount);
}
