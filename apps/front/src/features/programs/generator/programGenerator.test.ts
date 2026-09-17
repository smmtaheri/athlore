import { describe, expect, it } from "vitest";
import { coachRulesFixture } from "../../coach-rules/fixtures/coachRules";
import { studentFixtures } from "../../students/fixtures/students";
import { generateProgram } from "./programGenerator";

const student = studentFixtures.find((item) => item.id === "mohammad-taheri")!;

const input = {
  applyExerciseBank: true,
  applyGeneralRules: true,
  applyInjuryRules: true,
  applyLevelRules: true,
  applyMusclePriorityRules: true,
  customInstructions: "",
  daysPerWeek: 4,
  durationWeeks: 4,
  goal: "افزایش حجم",
  level: "intermediate",
  musclePriorities: ["سینه"],
  programType: "complete" as const,
  studentId: student.id,
  templateId: "hypertrophy-medium-4",
  title: "برنامه کامل محمد طاهری"
};

describe("programGenerator", () => {
  it("creates deterministic draft programs for identical inputs", () => {
    const first = generateProgram({ input, rules: coachRulesFixture, student });
    const second = generateProgram({ input, rules: coachRulesFixture, student });

    expect(first.id).toBe(second.id);
    expect(first.training?.days).toHaveLength(4);
    expect(first.status).toBe("draft");
  });

  it("removes injury-forbidden exercises and adds volume for priority muscles", () => {
    const program = generateProgram({ input, rules: coachRulesFixture, student });
    const exercises = program.training?.days.flatMap((day) => day.exercises) ?? [];

    expect(exercises.map((exercise) => exercise.name)).not.toContain("پرس سرشانه سنگین");
    expect(
      exercises.some((exercise) => exercise.targetMuscle.includes("سینه") && exercise.sets > 3)
    ).toBe(true);
  });
});
