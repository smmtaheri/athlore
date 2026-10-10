import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { studentFixtures } from "../../students/fixtures/students";
import type { GeneratedProgram } from "../types/generatedProgram";
import { ProgramPreviewPage } from "./ProgramPreviewPage";

const program: GeneratedProgram = {
  createdAt: "2026-07-31T00:00:00.000Z",
  dateRange: "۴ هفته",
  id: "program-test",
  nutrition: {
    dailyWater: "۲ لیتر",
    meals: [
      {
        foods: [{ amount: "۱ وعده", alternatives: "نان", id: "food-1", name: "برنج" }],
        id: "meal-1",
        notes: "",
        order: 1,
        title: "ناهار"
      }
    ],
    notes: "نمونه"
  },
  pdfSettings: {
    contactInfo: "تماس",
    fileTitle: "برنامه تست",
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
  supplements: {
    items: [
      {
        amount: "۱ وعده",
        id: "supplement-1",
        name: "کراتین",
        notes: "",
        order: 1,
        timing: "بعد تمرین"
      }
    ],
    medicalNote: "هشدار نمونه",
    summary: "نمونه"
  },
  title: "برنامه تست",
  training: {
    days: [
      {
        exercises: [
          {
            id: "exercise-1",
            name: "پرس سینه هالتر",
            notes: "",
            order: 1,
            reps: "۱۰",
            rest: "۹۰ ثانیه",
            rpe: "متوسط",
            sets: 3,
            targetMuscle: "سینه"
          }
        ],
        id: "day-1",
        notes: "",
        order: 1,
        targetMuscles: ["سینه"],
        title: "روز اول"
      }
    ],
    summary: "نمونه"
  },
  updatedAt: "2026-07-31T00:00:00.000Z",
  version: 1
};

function renderPreview(
  initialEntry = "/programs/program-test",
  programOverride?: Partial<GeneratedProgram>
) {
  const currentProgram = { ...program, ...programOverride };
  const update = vi.fn(async (_id: string, nextProgram: GeneratedProgram) => nextProgram);
  const finalize = vi.fn(async () => ({ ...currentProgram, status: "ready" as const }));
  const createPdf = vi.fn(async () => ({
    contentType: "complete" as const,
    fileName: "test.pdf",
    generatedAt: "",
    id: "pdf",
    programId: "program-test",
    programTitle: "برنامه تست",
    size: "1 MB",
    status: "ready" as const,
    studentId: "mohammad-taheri",
    version: "v1"
  }));
  const createForProgram = vi.fn(
    async (
      programId: string,
      options?: {
        deliveryOutputs?: "pair" | "section" | "single";
        fileName?: string;
        programVersionId?: string;
        programType?: "complete" | "workout" | "nutrition" | "supplement";
        section?: "workout" | "nutrition" | "supplement";
        pdfSettingsOverride?: Record<string, unknown>;
      }
    ) => {
      const file = await createPdf();
      return { ...file, programId, section: options?.section ?? null };
    }
  );
  const activate = vi.fn(async () => ({
    createdAt: "",
    dateRange: "",
    generatedAt: "",
    id: "program-test",
    isCurrent: true,
    programType: "complete" as const,
    status: "active" as const,
    studentId: "mohammad-taheri",
    title: "برنامه تست",
    updatedAt: "",
    version: "v1"
  }));

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={
            <ProgramPreviewPage
              pdfFilesRepo={{
                create: createPdf,
                createForProgram,
                listByProgram: async () => [],
                listByStudent: async () => [],
                regenerate: async () => {
                  throw new Error("unused");
                },
                remove: async () => undefined,
                rename: async () => {
                  throw new Error("unused");
                },
                reset: async () => []
              }}
              programsRepo={{
                create: async (nextProgram) => nextProgram,
                duplicate: async () => {
                  throw new Error("unused");
                },
                finalize,
                getById: async (id) => (id === "missing" ? null : currentProgram),
                list: async () => [currentProgram],
                listByStudent: async () => [currentProgram],
                reset: async () => [],
                update
              }}
              studentProgramsRepo={{
                activate,
                duplicate: async () => {
                  throw new Error("unused");
                },
                getById: async () => null,
                listByStudent: async () => [],
                remove: async () => undefined,
                reset: async () => [],
                upsert: async () => ({
                  createdAt: "",
                  dateRange: "",
                  generatedAt: "",
                  id: "program-test",
                  isCurrent: false,
                  programType: "complete",
                  status: "draft",
                  studentId: "mohammad-taheri",
                  title: "برنامه تست",
                  updatedAt: "",
                  version: "v1"
                })
              }}
              studentsRepo={{
                create: async () => studentFixtures[0],
                getById: async () => studentFixtures[0],
                list: async () => studentFixtures,
                reset: async () => studentFixtures,
                update: async () => studentFixtures[0]
              }}
            />
          }
          path="/programs/:programId"
        />
        <Route element={<div>pdf files tab</div>} path="/students/:studentId/pdf-files" />
        <Route element={<div>programs list</div>} path="/students/:studentId/programs" />
      </Routes>
    </MemoryRouter>
  );

  return { activate, createForProgram, createPdf, finalize, update };
}

describe("ProgramPreviewPage", () => {
  it("edits exercises and saves program", async () => {
    const user = userEvent.setup();
    const { update } = renderPreview();

    const exerciseInput = await screen.findByDisplayValue("پرس سینه هالتر");
    await user.clear(exerciseInput);
    await user.type(exerciseInput, "پرس بالا سینه دمبل");
    await user.click(screen.getAllByRole("button", { name: "ذخیره پیش‌نویس" })[0]);

    await waitFor(() => expect(update).toHaveBeenCalled());
  });

  it("edits nutrition and supplements tabs", async () => {
    const user = userEvent.setup();
    renderPreview("/programs/program-test?tab=nutrition");

    expect(await screen.findByDisplayValue("ناهار")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "مکمل ها" }));
    expect(await screen.findByDisplayValue("کراتین")).toBeInTheDocument();
  });

  it("creates separately categorized PDFs for each generated section in one program", async () => {
    const user = userEvent.setup();
    const deliverySections = {
      workout: "generated" as const,
      nutrition: "generated" as const,
      supplement: "generated" as const
    };
    const { activate, createForProgram, finalize } = renderPreview(
      "/programs/program-test?tab=pdf",
      { draftId: "version-1", pdfSettings: { ...program.pdfSettings, deliverySections } }
    );

    expect(await screen.findByDisplayValue("برنامه تست")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "نهایی‌سازی و ارسال به شاگرد" })[0]);
    await waitFor(() => expect(finalize).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createForProgram).toHaveBeenCalledTimes(3));
    expect(createForProgram.mock.calls.map(([id, options]) => [id, options?.section])).toEqual([
      ["program-test", "workout"],
      ["program-test", "nutrition"],
      ["program-test", "supplement"]
    ]);
    expect(createForProgram).toHaveBeenCalledWith(
      "program-test",
      expect.objectContaining({
        deliveryOutputs: "section",
        programVersionId: "version-1",
        section: "workout"
      })
    );
    expect(activate).toHaveBeenCalledWith("program-test");
    expect(await screen.findByText("programs list")).toBeInTheDocument();
  });

  it("retries delivery against the latest finalized version without finalizing again", async () => {
    const user = userEvent.setup();
    const { createForProgram, finalize } = renderPreview("/programs/program-test?tab=pdf", {
      finalizedVersionId: "final-version-2",
      pdfSettings: {
        ...program.pdfSettings,
        deliverySections: {
          workout: "generated",
          nutrition: "generated",
          supplement: "generated"
        }
      },
      status: "ready"
    });

    expect(await screen.findByDisplayValue("برنامه تست")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "نهایی‌سازی و ارسال به شاگرد" })[0]);
    await waitFor(() => expect(createForProgram).toHaveBeenCalledTimes(3));
    expect(finalize).not.toHaveBeenCalled();
    expect(createForProgram).toHaveBeenCalledWith(
      "program-test",
      expect.objectContaining({ programVersionId: "final-version-2" })
    );
  });

  it("preserves legacy pair delivery for programs without section settings", async () => {
    const user = userEvent.setup();
    const { createForProgram, finalize } = renderPreview("/programs/program-test?tab=pdf");

    expect(await screen.findByDisplayValue("برنامه تست")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "نهایی‌سازی و ارسال به شاگرد" })[0]);
    await waitFor(() => expect(createForProgram).toHaveBeenCalledTimes(1));
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(createForProgram).toHaveBeenCalledWith(
      "program-test",
      expect.objectContaining({ deliveryOutputs: "pair" })
    );
  });

  it("renders program not found state", async () => {
    renderPreview("/programs/missing");
    expect(await screen.findAllByText("برنامه پیدا نشد")).not.toHaveLength(0);
  });
});
