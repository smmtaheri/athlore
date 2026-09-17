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
  const createForProgram = vi.fn(async () => createPdf());

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={
            <ProgramPreviewPage
              pdfFilesRepo={{
                create: createPdf,
                createForProgram,
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
      </Routes>
    </MemoryRouter>
  );

  return { createForProgram, createPdf, finalize, update };
}

describe("ProgramPreviewPage", () => {
  it("edits exercises and saves program", async () => {
    const user = userEvent.setup();
    const { update } = renderPreview();

    const exerciseInput = await screen.findByDisplayValue("پرس سینه هالتر");
    await user.clear(exerciseInput);
    await user.type(exerciseInput, "پرس بالا سینه دمبل");
    await user.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
  });

  it("edits nutrition and supplements tabs", async () => {
    const user = userEvent.setup();
    renderPreview("/programs/program-test?tab=nutrition");

    expect(await screen.findByDisplayValue("ناهار")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "مکمل ها" }));
    expect(await screen.findByDisplayValue("کراتین")).toBeInTheDocument();
  });

  it("requires finalization before creating PDF from draft", async () => {
    const user = userEvent.setup();
    const { createForProgram, createPdf, finalize } = renderPreview(
      "/programs/program-test?tab=pdf"
    );

    expect(await screen.findByDisplayValue("برنامه تست")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ساخت PDF" }));
    expect(createPdf).not.toHaveBeenCalled();
    expect(createForProgram).not.toHaveBeenCalled();
    expect(await screen.findByText(/نهایی‌سازی برای PDF/)).toBeInTheDocument();

    await user.click(screen.getByTestId("confirm-finalize-for-pdf"));
    await waitFor(() => expect(finalize).toHaveBeenCalled());
    await waitFor(() => expect(createForProgram).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("pdf files tab")).toBeInTheDocument();
  });

  it("creates real PDF from finalized program without silent finalize", async () => {
    const user = userEvent.setup();
    const { createForProgram, finalize } = renderPreview("/programs/program-test?tab=pdf", {
      status: "ready"
    });

    expect(await screen.findByDisplayValue("برنامه تست")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ساخت PDF" }));
    await waitFor(() => expect(createForProgram).toHaveBeenCalledTimes(1));
    expect(finalize).not.toHaveBeenCalled();
    expect(await screen.findByText("pdf files tab")).toBeInTheDocument();
  });

  it("renders program not found state", async () => {
    renderPreview("/programs/missing");
    expect(await screen.findAllByText("برنامه پیدا نشد")).not.toHaveLength(0);
  });
});
