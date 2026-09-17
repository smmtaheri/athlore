import { beforeEach, describe, expect, it } from "vitest";
import { studentProgramFixtures } from "../../students/fixtures/studentPrograms";
import { createStudentProgramsRepository } from "../../students/services/studentProgramsRepository";
import { createGeneratedProgramFromSummary, createProgramsRepository } from "./programsRepository";

describe("program repositories", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("duplicates a program as a draft copy", async () => {
    const studentProgramsRepository = createStudentProgramsRepository(window.localStorage);
    const programsRepository = createProgramsRepository(window.localStorage);
    const [source] = await studentProgramsRepository.listByStudent("mohammad-taheri");

    const duplicatedSummary = await studentProgramsRepository.duplicate(source.id);
    const duplicatedProgram = await programsRepository.duplicate(source.id);

    expect(duplicatedSummary.id).toContain(`${source.id}-copy-`);
    expect(duplicatedSummary.status).toBe("draft");
    expect(duplicatedSummary.title).toContain("کپی");
    expect(duplicatedProgram.id).toContain(`${source.id}-copy-`);
    expect(duplicatedProgram.status).toBe("draft");
  });

  it("removes a program summary safely", async () => {
    const studentProgramsRepository = createStudentProgramsRepository(window.localStorage);
    const [source] = await studentProgramsRepository.listByStudent("mohammad-taheri");

    await studentProgramsRepository.remove(source.id);
    const removed = await studentProgramsRepository.getById(source.id);

    expect(removed).toBeNull();
  });

  it("persists edits for a fixture-backed preview program", async () => {
    const repository = createProgramsRepository(window.localStorage);
    const program = await repository.getById("program-mohammad-complete-v12");

    expect(program).not.toBeNull();

    const savedProgram = await repository.update(program!.id, {
      ...program!,
      title: "برنامه ذخیره شده"
    });
    const reloadedProgram = await repository.getById(program!.id);

    expect(savedProgram.title).toBe("برنامه ذخیره شده");
    expect(reloadedProgram?.title).toBe("برنامه ذخیره شده");
  });

  it("keeps localized fixture versions when creating preview fallback data", () => {
    const program = createGeneratedProgramFromSummary(studentProgramFixtures[0]);

    expect(program.version).toBe(1.2);
  });
});
