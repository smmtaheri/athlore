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
    await user.click(screen.getByRole("button", { name: "ساخت پیش‌نویس و بازبینی" }));

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
    await user.click(screen.getByRole("button", { name: "ساخت پیش‌نویس و بازبینی" }));

    expect(await screen.findAllByText("عنوان برنامه الزامی است.")).not.toHaveLength(0);
  });

  it("keeps uploaded and generated sections in the same program draft", async () => {
    const user = userEvent.setup();
    const draft: GeneratedProgram = {
      createdAt: "2026-10-10T00:00:00.000Z",
      dateRange: "مهر ۱۴۰۵",
      draftId: "version-1",
      id: "program-mixed",
      nutrition: { dailyWater: "", meals: [], notes: "" },
      pdfSettings: {
        contactInfo: "",
        fileTitle: "برنامه کامل محمد طاهری",
        includeCoachName: true,
        includeCoachNotes: true,
        includeNutrition: true,
        includeStudentName: true,
        includeSupplements: true,
        includeTraining: true,
        pageSize: "A4",
        style: "modern"
      },
      programType: "complete",
      status: "draft",
      studentId: "mohammad-taheri",
      supplements: { items: [], medicalNote: "", summary: "" },
      title: "برنامه کامل محمد طاهری",
      training: { days: [], summary: "" },
      updatedAt: "2026-10-10T00:00:00.000Z",
      version: 1
    };
    const generate = vi.fn(async () => ({ program: draft, warnings: [] }));
    const uploadStagedPdf = vi.fn(async (_studentId: string, file: File, section?: string) => ({
      expiresAt: "2026-10-17T00:00:00.000Z",
      fileName: file.name,
      id: `staged-${section}`,
      section: section as "workout" | "nutrition" | "supplement",
      sizeBytes: file.size
    }));
    const attachStagedPdf = vi.fn(async () => draft);
    const update = vi.fn(async (_id: string, program: GeneratedProgram) => program);
    const summary = {
      createdAt: "",
      dateRange: "مهر ۱۴۰۵",
      generatedAt: "",
      id: draft.id,
      isCurrent: false,
      programType: "complete" as const,
      status: "draft" as const,
      studentId: draft.studentId,
      title: draft.title,
      updatedAt: "",
      version: "v1"
    };

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
                  attachStagedPdf,
                  create: async (program) => program,
                  deleteStagedPdf: async () => undefined,
                  duplicate: async () => draft,
                  generate,
                  getById: async () => null,
                  list: async () => [],
                  listByStudent: async () => [],
                  reset: async () => [],
                  update,
                  uploadStagedPdf
                }}
                studentProgramsRepo={{
                  activate: async () => summary,
                  duplicate: async () => summary,
                  getById: async () => null,
                  listByStudent: async () => [],
                  remove: async () => undefined,
                  reset: async () => [],
                  upsert: async () => summary
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
                  reset: async () => [],
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

    await screen.findByDisplayValue("برنامه کامل محمد طاهری");
    await user.click(screen.getAllByRole("button", { name: "بارگذاری PDF" })[0]);
    const file = new File(["pdf bytes"], "workout.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("بارگذاری PDF برنامه تمرینی"), file);
    await user.click(screen.getByRole("button", { name: "ساخت پیش‌نویس و بازبینی" }));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(uploadStagedPdf).toHaveBeenCalledWith("mohammad-taheri", file, "workout");
    expect(attachStagedPdf).toHaveBeenCalledWith(
      draft.id,
      "version-1",
      "staged-workout",
      "workout"
    );
    expect(update).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        pdfSettings: expect.objectContaining({
          deliverySections: {
            workout: "uploaded",
            nutrition: "generated",
            supplement: "generated"
          }
        })
      })
    );
    expect(await screen.findByText("preview page")).toBeInTheDocument();
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
