import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { StudentProgramDetailPage } from "./StudentProgramDetailPage";
import { StudentProgramsPage } from "./StudentProgramsPage";
import type { GeneratedProgram } from "../../programs/types/generatedProgram";
import type { StudentPdfFile } from "../../students/types/pdfFile";
import type { StudentProgramSummary } from "../../students/types/studentProgram";
import type { StudentProgramsRepository } from "../services/studentProgramsRepository";

const summary: StudentProgramSummary = {
  createdAt: "2026-09-20T10:00:00Z",
  dateRange: "شهریور ۱۴۰۵",
  generatedAt: "2026-09-20T10:00:00Z",
  id: "program-1",
  isCurrent: true,
  programType: "workout",
  status: "active",
  studentId: "student-1",
  title: "برنامه ماهانه شهریور",
  updatedAt: "2026-09-20T10:00:00Z",
  version: "v1"
};

const program: GeneratedProgram = {
  createdAt: summary.createdAt,
  dateRange: summary.dateRange,
  id: summary.id,
  pdfSettings: {
    contactInfo: "",
    fileTitle: summary.title,
    includeCoachName: false,
    includeCoachNotes: false,
    includeNutrition: false,
    includeStudentName: true,
    includeSupplements: false,
    includeTraining: true,
    pageSize: "A4",
    style: "modern"
  },
  programType: "workout",
  status: "active",
  studentId: summary.studentId,
  title: summary.title,
  training: {
    days: [
      {
        exercises: [
          {
            id: "exercise-1",
            name: "پرس سینه هالتر",
            notes: "کنترل حرکت",
            order: 1,
            reps: "8-10",
            rest: "90 ثانیه",
            rpe: "",
            sets: 4,
            targetMuscle: "سینه"
          }
        ],
        id: "day-1",
        notes: "",
        order: 1,
        targetMuscles: ["سینه"],
        title: "روز سینه"
      }
    ],
    summary: ""
  },
  updatedAt: summary.updatedAt,
  version: 1
};

function repository(overrides: Partial<StudentProgramsRepository> = {}): StudentProgramsRepository {
  return {
    createPdfFiles: async () => [],
    downloadPdf: async () => undefined,
    getById: async () => null,
    list: async () => [],
    listPdfFiles: async () => [],
    ...overrides
  };
}

describe("student program portal", () => {
  it("lists finalized programs with a clear link to the read-only detail", async () => {
    render(
      <MemoryRouter>
        <StudentProgramsPage repository={repository({ list: async () => [summary] })} />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: summary.title })).toBeInTheDocument();
    expect(screen.getByText("برنامه فعلی")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /برنامه ماهانه شهریور/ })).toHaveAttribute(
      "href",
      "/programs/program-1"
    );
  });

  it("renders the program content and asks for PDF preparation when no file exists", async () => {
    const pdf: StudentPdfFile = {
      contentType: "workout",
      fileName: "program.pdf",
      generatedAt: "",
      id: "pdf-1",
      programId: program.id,
      programTitle: program.title,
      size: "1 KB",
      status: "ready",
      studentId: program.studentId,
      version: "v1"
    };
    render(
      <MemoryRouter initialEntries={["/programs/program-1"]}>
        <Routes>
          <Route
            element={
              <StudentProgramDetailPage
                repository={repository({
                  createPdfFiles: async () => [pdf],
                  getById: async () => program,
                  listPdfFiles: async () => []
                })}
              />
            }
            path="/programs/:programId"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/پرس سینه هالتر/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "آماده‌سازی فایل PDF" })).toBeInTheDocument();
  });
});
