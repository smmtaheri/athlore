import type { TrainingExercise } from "../../programs/types/generatedProgram";

function lines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function exerciseEducation(exercise: TrainingExercise) {
  const guide = exercise.execution_guide ?? {};
  const defaults = exercise.media?.education;
  const owns = (key: string) => Object.prototype.hasOwnProperty.call(guide, key);
  const cues = owns("execution") ? [] : (defaults?.steps ?? []);
  return {
    steps: owns("execution")
      ? lines(guide.execution).map((text, index) => ({
          title: `مرحلهٔ ${index + 1}`,
          text,
          at_seconds: 0
        }))
      : cues,
    cues,
    description: owns("execution") ? "" : (defaults?.description ?? ""),
    tips: owns("tips") ? lines(guide.tips) : (defaults?.tips ?? []),
    mistakes: owns("mistakes")
      ? lines(guide.mistakes).map((text, index) => ({ title: `اشتباه ${index + 1}`, text }))
      : (defaults?.mistakes ?? [])
  };
}
