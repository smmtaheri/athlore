import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/client";
import type { GeneratedProgram } from "../../programs/types/generatedProgram";
import { InteractiveWorkout } from "./InteractiveWorkout";

vi.mock("../../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const api = vi.mocked(apiRequest);
const program: GeneratedProgram = {
  id: "program-1",
  programVersionId: "version-1",
  durationWeeks: 4,
  title: "Workout",
  studentId: "student-1",
  programType: "workout",
  status: "active",
  version: 1,
  createdAt: "2026-10-23",
  updatedAt: "2026-10-23",
  dateRange: "4 weeks",
  pdfSettings: {
    contactInfo: "",
    fileTitle: "Workout",
    includeCoachName: false,
    includeCoachNotes: false,
    includeNutrition: false,
    includeStudentName: true,
    includeSupplements: false,
    includeTraining: true,
    pageSize: "A4",
    style: "modern"
  },
  training: {
    summary: "",
    days: [
      {
        id: "day-1",
        title: "جلسهٔ اول",
        notes: "",
        order: 1,
        targetMuscles: ["سینه"],
        exercises: [
          {
            id: "exercise-1",
            name: "پرس سینه",
            sets: 3,
            reps: "10",
            rest: "90 ثانیه",
            rpe: "7",
            notes: "کنترل حرکت",
            order: 1,
            targetMuscle: "سینه"
          }
        ]
      }
    ]
  }
};

describe("InteractiveWorkout", () => {
  beforeEach(() => api.mockReset());
  it("loads persisted sets, sends the active version, and rolls back failed changes", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [{ week: 1, day_id: "day-1", completed_sets: { "exercise-1": [0] } }]
    });
    api.mockRejectedValueOnce(new Error("offline"));
    render(<InteractiveWorkout program={program} />);
    const set = await screen.findByRole("checkbox", { name: "ست 1" });
    await waitFor(() => expect(set).toBeEnabled());
    expect(set).toBeChecked();
    await userEvent.click(set);
    await screen.findByRole("alert");
    expect(set).toBeChecked();
    expect(api).toHaveBeenLastCalledWith("/me/programs/program-1/workout-progress/", {
      method: "PUT",
      body: {
        version_id: "version-1",
        week: 1,
        day_id: "day-1",
        exercise_id: "exercise-1",
        completed_sets: []
      }
    });
  });
  it("keeps weeks independent and displays course progress", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [{ week: 1, day_id: "day-1", completed_sets: { "exercise-1": [0] } }]
    });
    render(<InteractiveWorkout program={program} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "ست 1" })).toBeChecked());
    await userEvent.selectOptions(screen.getByLabelText("هفتهٔ دوره"), "2");
    expect(screen.getByRole("checkbox", { name: "ست 1" })).not.toBeChecked();
    expect(screen.getByRole("progressbar", { name: "پیشرفت دوره" })).toHaveAttribute("value", "1");
    expect(screen.getByRole("progressbar", { name: "پیشرفت دوره" })).toHaveAttribute("max", "12");
  });
  it("refuses edits against a different active version", async () => {
    api.mockResolvedValueOnce({ version_id: "version-2", sessions: [] });
    render(<InteractiveWorkout program={program} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("نسخهٔ برنامه تغییر کرده");
    expect(screen.getByRole("checkbox", { name: "ست 1" })).toBeDisabled();
  });
});
