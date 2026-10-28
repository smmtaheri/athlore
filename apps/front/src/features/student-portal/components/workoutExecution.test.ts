import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../../programs/types/generatedProgram";
import { executionRestSeconds } from "./workoutExecution";

describe("group execution rest", () => {
  const exercise = {
    rest: "90 ثانیه",
    executionPlan: {
      version: 1,
      pairedRounds: 2,
      soloSets: 1,
      sets: [
        { setIndex: 0, phase: "paired", restSeconds: 0 },
        { setIndex: 1, phase: "paired", restSeconds: 0 },
        { setIndex: 2, phase: "solo", restSeconds: 90 }
      ]
    }
  } as TrainingExercise;
  it("uses no rest between paired exercises but preserves solo remainder rest", () => {
    expect(executionRestSeconds(exercise, 0)).toBe(0);
    expect(executionRestSeconds(exercise, 2)).toBe(90);
  });
  it("uses the stored after-round rest on the final member", () => {
    const last = {
      ...exercise,
      executionPlan: {
        ...exercise.executionPlan!,
        sets: [{ setIndex: 0, phase: "paired" as const, restSeconds: 60 }]
      }
    };
    expect(executionRestSeconds(last, 0)).toBe(60);
  });
  it("keeps minutes and clock formats readable for published legacy prescriptions", () => {
    expect(executionRestSeconds({ rest: "۲ دقیقه" } as TrainingExercise, 0)).toBe(120);
    expect(executionRestSeconds({ rest: "01:30" } as TrainingExercise, 0)).toBe(90);
  });
});
