import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { coachRulesFixture } from "../../coach-rules/fixtures/coachRules";
import { studentFixtures } from "../../students/fixtures/students";
import { studentVisitFixtures } from "../../students/fixtures/studentVisits";
import type { GeneratedProgram } from "../types/generatedProgram";
import { ProgramGenerationPage } from "./ProgramGenerationPage";

describe("ProgramGenerationPage", () => {
  it("prefills selected student and creates draft program", async () => {
    const user = userEvent.setup();
    const create = vi.fn(async (program: GeneratedProgram) => program);
    const upsert = vi.fn(async () => ({
      createdAt: "",
      dateRange: "",
      generatedAt: "",
      id: "program",
      isCurrent: false,
      programType: "complete" as const,
      status: "draft" as const,
      studentId: "mohammad-taheri",
      title: "program",
      updatedAt: "",
      version: "v1"
    }));

    render(
      <MemoryRouter initialEntries={["/programs/new?studentId=mohammad-taheri"]}>
        <Routes>
          <Route
            element={
              <ProgramGenerationPage
                coachRulesRepo={{
                  get: async () => coachRulesFixture,
                  reset: async () => coachRulesFixture,
                  save: async () => coachRulesFixture
                }}
                programsRepo={{
                  create,
                  duplicate: async () => {
                    throw new Error("unused");
                  },
                  getById: async () => null,
                  list: async () => [],
                  listByStudent: async () => [],
                  reset: async () => [],
                  update: async (_id, program) => program
                }}
                studentProgramsRepo={{
                  activate: async () => {
                    throw new Error("unused");
                  },
                  duplicate: async () => {
                    throw new Error("unused");
                  },
                  getById: async () => null,
                  listByStudent: async () => [],
                  remove: async () => undefined,
                  reset: async () => [],
                  upsert
                }}
                studentsRepo={{
                  create: async () => studentFixtures[0],
                  getById: async () => studentFixtures[0],
                  list: async () => studentFixtures,
                  reset: async () => studentFixtures,
                  update: async () => studentFixtures[0]
                }}
                visitsRepo={{
                  create: async () => studentVisitFixtures[0],
                  finalize: async () => studentVisitFixtures[0],
                  getById: async () => studentVisitFixtures[0],
                  listAnswerRevisions: async () => [],
                  listByStudent: async () => studentVisitFixtures,
                  remove: async () => undefined,
                  reset: async () => studentVisitFixtures,
                  sendToStudent: async () => studentVisitFixtures[0],
                  startCoachReview: async () => studentVisitFixtures[0],
                  update: async () => studentVisitFixtures[0]
                }}
              />
            }
            path="/programs/new"
          />
          <Route element={<div>preview page</div>} path="/programs/:programId" />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByDisplayValue("برنامه کامل محمد طاهری")).toBeInTheDocument();
    expect(screen.getByText(/گردن درد خفیف/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تولید برنامه" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("preview page")).toBeInTheDocument();
  });

  it("validates required title", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/programs/new?studentId=mohammad-taheri"]}>
        <ProgramGenerationPage />
      </MemoryRouter>
    );

    const titleInput = await screen.findByDisplayValue("برنامه کامل محمد طاهری");
    await user.clear(titleInput);
    await user.click(screen.getByRole("button", { name: "تولید برنامه" }));

    expect(await screen.findAllByText("عنوان برنامه الزامی است.")).not.toHaveLength(0);
  });

  it("exposes structured chest target region controls", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/programs/new?studentId=mohammad-taheri"]}>
        <ProgramGenerationPage />
      </MemoryRouter>
    );

    const targetMuscle = await screen.findByLabelText("عضله هدف");
    await user.selectOptions(targetMuscle, "سینه");

    const targetRegion = await screen.findByLabelText("ناحیه هدف");
    await user.selectOptions(targetRegion, "inner_upper_chest");

    expect(targetRegion).toHaveValue("inner_upper_chest");
    expect(screen.getByLabelText("تعداد حرکت هدف")).toHaveValue(2);
    expect(screen.getByRole("option", { name: "داخل زیرسینه" })).toBeInTheDocument();
  });
});
