import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { coachRulesFixture } from "../../coach-rules/fixtures/coachRules";
import type { TrainingSystem } from "../../coach-rules/types/coachRules";
import { studentFixtures } from "../../students/fixtures/students";
import { studentVisitFixtures } from "../../students/fixtures/studentVisits";
import type { GeneratedProgram, ProgramGenerationInput } from "../types/generatedProgram";
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

  it("does not offer or preselect an archived student for a new program", async () => {
    const archivedStudent = {
      ...studentFixtures[0],
      fullName: "شاگرد بایگانی‌شده QA",
      id: "archived-qa-student",
      status: "inactive" as const
    };

    render(
      <MemoryRouter initialEntries={["/programs/new?studentId=archived-qa-student"]}>
        <ProgramGenerationPage
          coachRulesRepo={{
            get: async () => coachRulesFixture,
            reset: async () => coachRulesFixture,
            save: async () => coachRulesFixture
          }}
          studentsRepo={{
            create: async () => archivedStudent,
            getById: async () => archivedStudent,
            list: async () => [archivedStudent, studentFixtures[0]],
            reset: async () => [archivedStudent, studentFixtures[0]],
            update: async () => archivedStudent
          }}
        />
      </MemoryRouter>
    );

    const studentSelect = await screen.findByLabelText(/شاگرد/);
    expect(studentSelect).toHaveValue("");
    expect(screen.queryByRole("option", { name: "شاگرد بایگانی‌شده QA" })).not.toBeInTheDocument();
    expect(await screen.findByText(/غیرفعال یا بایگانی شده است/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ساخت پیش‌نویس و بازبینی" })).toBeDisabled();
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
    const generate = vi.fn(async (input: ProgramGenerationInput) => {
      void input;
      return { program: draft, warnings: [] };
    });
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
    await user.click(screen.getByRole("button", { name: "بارگذاری PDF برای برنامه تمرینی" }));
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

  it("allows a complete program to send only the uploaded section", async () => {
    const user = userEvent.setup();
    const draft: GeneratedProgram = {
      createdAt: "2026-10-10T00:00:00.000Z",
      dateRange: "مهر ۱۴۰۵",
      draftId: "version-food-only",
      id: "program-food-only",
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
      title: "برنامه کامل محمد طاهری",
      updatedAt: "2026-10-10T00:00:00.000Z",
      version: 1
    };
    const uploadStagedPdf = vi.fn(async (_studentId: string, file: File, section?: string) => ({
      expiresAt: "2026-10-17T00:00:00.000Z",
      fileName: file.name,
      id: `staged-${section}`,
      section: section as "workout" | "nutrition" | "supplement",
      sizeBytes: file.size
    }));
    const createUploadedDraft = vi.fn(async () => draft);
    const attachStagedPdf = vi.fn(async () => draft);
    const update = vi.fn(async (_id: string, program: GeneratedProgram) => program);
    const upsert = vi.fn(async () => ({
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
                  attachStagedPdf,
                  create: async (program) => program,
                  createUploadedDraft,
                  deleteStagedPdf: async () => undefined,
                  duplicate: async () => draft,
                  getById: async () => null,
                  list: async () => [],
                  listByStudent: async () => [],
                  reset: async () => [],
                  update,
                  uploadStagedPdf
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
    await user.click(screen.getByRole("button", { name: "عدم ارسال بخش برنامه تمرینی" }));
    await user.click(screen.getByRole("button", { name: "بارگذاری PDF برای برنامه غذایی" }));
    const file = new File(["pdf bytes"], "nutrition.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("بارگذاری PDF برنامه غذایی"), file);
    await user.click(screen.getByRole("button", { name: "عدم ارسال بخش برنامه مکمل" }));
    await user.click(screen.getByRole("button", { name: "ادامه به بازبینی" }));

    await waitFor(() => expect(createUploadedDraft).toHaveBeenCalledTimes(1));
    expect(uploadStagedPdf).toHaveBeenCalledWith("mohammad-taheri", file, "nutrition");
    expect(attachStagedPdf).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        pdfSettings: expect.objectContaining({
          deliverySections: {
            workout: "omitted",
            nutrition: "uploaded",
            supplement: "omitted"
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

  it("sends the coach-selected partial-rep mode to program generation", async () => {
    const user = userEvent.setup();
    const draft: GeneratedProgram = {
      createdAt: "2026-10-22T00:00:00.000Z",
      dateRange: "مهر ۱۴۰۵",
      draftId: "version-partial-reps",
      id: "program-partial-reps",
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
      title: "برنامه کامل محمد طاهری",
      updatedAt: "2026-10-22T00:00:00.000Z",
      version: 1
    };
    const generate = vi.fn(async (input: ProgramGenerationInput) => {
      void input;
      return { program: draft, warnings: [] };
    });
    const system: TrainingSystem = {
      id: null,
      key: "partial_reps",
      name: "تکرار نیمه",
      description: "روش‌های تکرار نیمه",
      execution_method: "مقادیر پیشنهادی و نیازمند بازبینی مربی.",
      allowed_levels: [],
      max_per_session: 0,
      parameters: {},
      enabled: false,
      source: "platform",
      base_technique_key: "partial_reps",
      handler_key: "partial_reps",
      handler_status: "implemented",
      parameter_schema: {
        variants: { default: ["one_and_half", "after_failure", "partial_only"] },
        after_failure_reps: { default: 3 }
      }
    };

    render(
      <MemoryRouter initialEntries={["/programs/new?studentId=mohammad-taheri"]}>
        <ProgramGenerationPage
          coachRulesRepo={{
            get: async () => coachRulesFixture,
            reset: async () => coachRulesFixture,
            save: async () => coachRulesFixture
          }}
          programsRepo={{
            create: async (program) => program,
            duplicate: async () => draft,
            generate,
            getById: async () => null,
            list: async () => [],
            listByStudent: async () => [],
            reset: async () => [],
            update: async (_id, program) => program
          }}
          studentsRepo={{
            create: async () => studentFixtures[0],
            getById: async () => studentFixtures[0],
            list: async () => studentFixtures,
            reset: async () => studentFixtures,
            update: async () => studentFixtures[0]
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
            upsert: async (summary) => summary
          }}
          trainingSystemsRepo={{
            list: async () => [system],
            remove: async () => undefined,
            save: async () => system
          }}
          visitsRepo={{
            create: async () => studentVisitFixtures[0],
            finalize: async () => studentVisitFixtures[0],
            getById: async () => studentVisitFixtures[0],
            listAnswerRevisions: async () => [],
            listByStudent: async () => [],
            remove: async () => undefined,
            reset: async () => [],
            sendToStudent: async () => studentVisitFixtures[0],
            startCoachReview: async () => studentVisitFixtures[0],
            update: async () => studentVisitFixtures[0]
          }}
        />
      </MemoryRouter>
    );

    await user.click(await screen.findByLabelText("تکرار نیمه"));
    await user.click(screen.getByRole("checkbox", { name: "نیم‌تکرار پس از ناتوانی" }));
    await user.click(screen.getByRole("button", { name: "ساخت پیش‌نویس و بازبینی" }));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0][0].trainingSystems).toEqual([
      { key: "partial_reps", variants: ["one_and_half", "partial_only"] }
    ]);
  });
});
