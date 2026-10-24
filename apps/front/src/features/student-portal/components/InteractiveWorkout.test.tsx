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
  it("loads saved set values and rolls back failed changes", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [
        {
          week: 1,
          day_id: "day-1",
          completed_sets: { "exercise-1": [0] },
          set_logs: {
            "exercise-1": [
              {
                set_index: 0,
                completed: true,
                reps: 11,
                weight_kg: 32.5,
                rest_seconds: null
              }
            ]
          }
        }
      ]
    });
    api.mockRejectedValueOnce(new Error("offline"));
    render(<InteractiveWorkout program={program} />);
    const reps = await screen.findByLabelText("تکرار واقعی ست ۱");
    expect(reps).toHaveValue(11);
    expect(screen.getByLabelText("وزنهٔ واقعی (کیلوگرم) ست ۱")).toHaveValue(32.5);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "علامت‌گذاری به‌عنوان ناقص" })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: "علامت‌گذاری به‌عنوان ناقص" }));
    await screen.findByRole("alert");
    expect(screen.getByText("انجام‌شده")).toBeInTheDocument();
    expect(api).toHaveBeenLastCalledWith("/me/programs/program-1/workout-progress/", {
      method: "PUT",
      body: {
        version_id: "version-1",
        week: 1,
        day_id: "day-1",
        exercise_id: "exercise-1",
        completed_sets: [],
        set_logs: [
          {
            set_index: 0,
            completed: false,
            reps: 11,
            weight_kg: 32.5,
            rest_seconds: null
          }
        ]
      }
    });
  });
  it("keeps weeks independent and displays course progress", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [{ week: 1, day_id: "day-1", completed_sets: { "exercise-1": [0] }, set_logs: {} }]
    });
    render(<InteractiveWorkout program={program} />);
    await waitFor(() => expect(screen.getByText("۱ از ۳ ست انجام شده")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("هفتهٔ برنامه"), "2");
    expect(screen.getByText("۰ از ۳ ست انجام شده")).toBeInTheDocument();
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
    expect(screen.getAllByRole("button", { name: "ثبت ست" })[0]).toBeDisabled();
  });
  it("saves actual reps and weight, then starts the movement's rest timer", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    api.mockResolvedValueOnce({
      week: 1,
      day_id: "day-1",
      completed_sets: { "exercise-1": [0] },
      set_logs: {
        "exercise-1": [
          {
            set_index: 0,
            completed: true,
            reps: 10,
            weight_kg: 25,
            rest_seconds: null
          }
        ]
      }
    });
    render(<InteractiveWorkout program={program} />);
    const reps = await screen.findByLabelText("تکرار واقعی ست ۱");
    await waitFor(() => expect(reps).toBeEnabled());
    await userEvent.type(reps, "10");
    await userEvent.type(screen.getByLabelText("وزنهٔ واقعی (کیلوگرم) ست ۱"), "25");
    await userEvent.click(screen.getAllByRole("button", { name: "ثبت ست" })[0]);

    expect(
      await screen.findByRole("group", { name: "تایمر استراحت پرس سینه" })
    ).toBeInTheDocument();
    expect(await screen.findByText("۱:۳۰")).toBeInTheDocument();
    expect(api).toHaveBeenLastCalledWith("/me/programs/program-1/workout-progress/", {
      method: "PUT",
      body: {
        week: 1,
        version_id: "version-1",
        day_id: "day-1",
        exercise_id: "exercise-1",
        completed_sets: [0],
        set_logs: [
          {
            set_index: 0,
            completed: true,
            reps: 10,
            weight_kg: 25,
            rest_seconds: null
          }
        ]
      }
    });
  });
  it("shows the prior week's set-by-set reps, weight and rest history", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [
        {
          week: 1,
          day_id: "day-1",
          completed_sets: { "exercise-1": [0, 1] },
          set_logs: {
            "exercise-1": [
              {
                set_index: 0,
                completed: true,
                reps: 12,
                weight_kg: 30,
                rest_seconds: null
              },
              {
                set_index: 1,
                completed: true,
                reps: 10,
                weight_kg: 32.5,
                rest_seconds: 88
              }
            ]
          }
        }
      ]
    });
    render(<InteractiveWorkout program={program} />);
    await userEvent.selectOptions(await screen.findByLabelText("هفتهٔ برنامه"), "2");
    expect(screen.getByText("۲ ست از ۳ ست انجام شده بود.")).toBeInTheDocument();
    expect(screen.getByText(/12 تکرار · 30 کیلوگرم/)).toBeInTheDocument();
    expect(
      screen.getByText(/10 تکرار · 32.5 کیلوگرم · استراحت پیش از ست ۱:۲۸/)
    ).toBeInTheDocument();
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
    const preview = await screen.findByRole("button", { name: "پخش ویدئوی پرس سینه" });
    const previewVideo = preview.querySelector("video");
    expect(previewVideo).toHaveAttribute("src", "https://cdn.example.test/demo.mp4");
    expect(previewVideo).toHaveAttribute("autoplay");
    expect(previewVideo).toHaveAttribute("loop");
    expect(previewVideo).toHaveProperty("muted", true);
    expect(previewVideo).not.toHaveAttribute("controls");
    await userEvent.click(preview);
    expect(await screen.findByLabelText("ویدئوی پرس سینه")).toHaveAttribute(
      "src",
      "https://cdn.example.test/demo.mp4"
    );
    expect(screen.getByLabelText("ویدئوی پرس سینه")).toHaveAttribute("controls");
  });
});
