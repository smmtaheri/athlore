import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedProgram, GenerationEvidence } from "../types/generatedProgram";
import { GenerationEvidencePanel } from "./GenerationEvidencePanel";

const baseProgram: GeneratedProgram = {
  createdAt: "2026-07-31T00:00:00.000Z",
  dateRange: "۴ هفته",
  id: "program-evidence-test",
  pdfSettings: {
    contactInfo: "",
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
  studentId: "student-1",
  title: "برنامه تست",
  updatedAt: "2026-07-31T00:00:00.000Z",
  version: 1
};

const sampleEvidence: GenerationEvidence = {
  daysPerWeek: 4,
  equipment: ["hasBarbell", "hasDumbbell"],
  exerciseSelection: {
    excludedMovements: ["Burpee"],
    historical: ["پرس سینه هالتر"],
    preferred: ["اسکوات"],
    replacements: [{ from: "پرس سرشانه هالتر", reason: "گردن درد", to: "پرس سرشانه دمبل نشسته" }]
  },
  generationRunId: "run-123",
  generatorVersion: "rules_v1",
  injuryRules: ["نوع آسیب: گردن درد خفیف"],
  muscleFocus: { priorityMuscles: ["سرشانه"], weakMuscles: ["سینه بالا"] },
  nutritionSupplement: {
    nutritionSelectionReasons: ["تطابق با کالری هدف"],
    supplementSelectionReasons: ["تطابق با هدف حجم"]
  },
  ruleSetId: "digest-abc",
  studentGoal: "hypertrophy",
  studentId: "student-1",
  studentLevel: "intermediate",
  templateId: "template-1",
  templateName: "فول بادی ۴ روزه",
  warnings: ["حجم پیشنهادی بالاتر از حد معمول است"]
};

describe("GenerationEvidencePanel", () => {
  it("renders nothing when the program is not a draft", () => {
    render(
      <GenerationEvidencePanel
        fetchEvidence={vi.fn()}
        program={{ ...baseProgram, evidence: sampleEvidence, status: "ready" }}
      />
    );

    expect(screen.queryByTestId("generation-evidence-panel")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no evidence and no generationRunId", () => {
    render(<GenerationEvidencePanel fetchEvidence={vi.fn()} program={baseProgram} />);

    expect(screen.queryByTestId("generation-evidence-panel")).not.toBeInTheDocument();
  });

  it("renders structured evidence fields already present on the program", async () => {
    render(
      <GenerationEvidencePanel
        fetchEvidence={vi.fn()}
        program={{ ...baseProgram, evidence: sampleEvidence }}
      />
    );

    expect(await screen.findByText("چرا این برنامه ساخته شد؟")).toBeInTheDocument();
    expect(screen.getByText("rules_v1")).toBeInTheDocument();
    expect(screen.getByText("فول بادی ۴ روزه")).toBeInTheDocument();
    expect(screen.getByText("سینه بالا")).toBeInTheDocument();
    expect(screen.getByText("سرشانه")).toBeInTheDocument();
    expect(screen.getByText("Burpee")).toBeInTheDocument();
    expect(screen.getByText("digest-abc")).toBeInTheDocument();
    expect(screen.getByText("run-123")).toBeInTheDocument();
    expect(screen.getByText("student-1")).toBeInTheDocument();
  });

  it("lazily fetches full evidence when only generationRunId is available", async () => {
    const fetchEvidence = vi.fn(async () => sampleEvidence);

    render(
      <GenerationEvidencePanel
        fetchEvidence={fetchEvidence}
        program={{ ...baseProgram, generationRunId: "run-123" }}
      />
    );

    await waitFor(() => expect(fetchEvidence).toHaveBeenCalledWith("run-123"));
    expect(await screen.findByText("run-123")).toBeInTheDocument();
    expect(await screen.findByText("فول بادی ۴ روزه")).toBeInTheDocument();
  });

  it("keeps partial evidence visible when the full fetch fails", async () => {
    const fetchEvidence = vi.fn(async () => {
      throw new Error("network down");
    });

    render(
      <GenerationEvidencePanel
        fetchEvidence={fetchEvidence}
        program={{
          ...baseProgram,
          evidence: {
            ...sampleEvidence,
            exerciseSelection: {
              excludedMovements: [],
              historical: [],
              preferred: [],
              replacements: []
            },
            injuryRules: [],
            muscleFocus: { priorityMuscles: [], weakMuscles: [] },
            nutritionSupplement: { nutritionSelectionReasons: [], supplementSelectionReasons: [] },
            templateName: undefined,
            warnings: []
          },
          generationRunId: "run-123"
        }}
      />
    );

    expect(await screen.findByText("run-123")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/دریافت جزئیات کامل از GenerationRun انجام نشد/)).toBeInTheDocument()
    );
  });
});
