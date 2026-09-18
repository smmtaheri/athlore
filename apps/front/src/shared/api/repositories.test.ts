import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramGenerationInput } from "../../features/programs/types/generatedProgram";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn()
}));

vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args)
}));

import { createApiProgramsRepository } from "./repositories";

describe("API programs repository", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({
      generator_version: "rules_v1",
      generation_run_id: "run-1",
      program: {
        created_at: "2026-09-18T00:00:00Z",
        date_range_label: "4 هفته",
        id: "program-1",
        program_type: "workout",
        status: "draft",
        student_id: "student-1",
        title: "برنامه تست",
        updated_at: "2026-09-18T00:00:00Z",
        version: 1
      },
      warnings: []
    });
  });

  it("sends structured target region and exercise count to the generator", async () => {
    const input: ProgramGenerationInput = {
      applyExerciseBank: true,
      applyGeneralRules: true,
      applyInjuryRules: true,
      applyLevelRules: true,
      applyMusclePriorityRules: true,
      customInstructions: "",
      daysPerWeek: 4,
      durationWeeks: 4,
      goal: "حجم",
      level: "intermediate",
      musclePriorities: ["سینه"],
      programType: "workout",
      studentId: "student-1",
      targetExerciseCount: 2,
      targetMuscle: "سینه",
      targetRegion: "inner_upper_chest",
      templateId: "template-1",
      title: "برنامه تست"
    };

    await createApiProgramsRepository().generate(input);

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/programs/generate/",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          target_muscle: "سینه",
          target_region: "inner_upper_chest",
          exercise_count: 2
        })
      })
    );
  });
});
