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
    const set = await screen.findByRole("button", { name: "ست 1 انجام شده" });
    await waitFor(() => expect(set).toBeEnabled());
    expect(set).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(set);
    await screen.findByRole("alert");
    expect(set).toHaveAttribute("aria-pressed", "true");
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "ست 1 انجام شده" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    await userEvent.selectOptions(screen.getByLabelText("هفتهٔ برنامه"), "2");
    expect(screen.getByRole("button", { name: "ست 1 انجام نشده" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("progressbar", { name: "پیشرفت کل دوره" })).toHaveAttribute(
      "value",
      "8"
    );
    expect(screen.getByRole("progressbar", { name: "پیشرفت کل دوره" })).toHaveAttribute(
      "max",
      "100"
    );
  });
  it("refuses edits against a different active version", async () => {
    api.mockResolvedValueOnce({ version_id: "version-2", sessions: [] });
    render(<InteractiveWorkout program={program} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("نسخهٔ برنامه تغییر کرده");
    expect(screen.getByRole("button", { name: "ست 1 انجام نشده" })).toBeDisabled();
  });
  it("marks an exercise complete and reveals its own rest timer", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    api.mockResolvedValueOnce({
      week: 1,
      day_id: "day-1",
      completed_sets: { "exercise-1": [0, 1, 2] }
    });
    render(<InteractiveWorkout program={program} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "علامت‌گذاری حرکت به‌عنوان کامل" })
    );

    expect(await screen.findByText("این جلسه کامل شد. آفرین!")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "تایمر استراحت پرس سینه" })).toBeInTheDocument();
    expect(screen.getByText("۱:۳۰")).toBeInTheDocument();
    expect(api).toHaveBeenLastCalledWith("/me/programs/program-1/workout-progress/", {
      method: "PUT",
      body: {
        week: 1,
        version_id: "version-1",
        day_id: "day-1",
        exercise_id: "exercise-1",
        completed_sets: [0, 1, 2]
      }
    });
  });
  it("shows a clear video placeholder when the movement has no demo URL", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    render(<InteractiveWorkout program={program} />);
    expect(
      await screen.findByRole("img", { name: "ویدئوی پرس سینه موجود نیست" })
    ).toBeInTheDocument();
    expect(screen.getByText("ویدئوی آموزشی ثبت نشده")).toBeInTheDocument();
  });
  it("renders the movement tutorial video when the catalog provides a URL", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    const withVideo = {
      ...program,
      training: {
        ...program.training!,
        days: program.training!.days.map((day) => ({
          ...day,
          exercises: day.exercises.map((exercise) => ({
            ...exercise,
            tutorial_url: "https://cdn.example.test/demo.mp4"
          }))
        }))
      }
    };
    render(<InteractiveWorkout program={withVideo} />);
    expect(await screen.findByLabelText("ویدئوی آموزشی پرس سینه")).toHaveAttribute(
      "src",
      "https://cdn.example.test/demo.mp4"
    );
  });
});
