import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/client";
import type { GeneratedProgram } from "../../programs/types/generatedProgram";
import { InteractiveWorkout } from "./InteractiveWorkout";

vi.mock("../../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const api = vi.mocked(apiRequest);

const program: GeneratedProgram = {
  id: "program-1",
  programVersionId: "version-1",
  durationWeeks: 2,
  title: "برنامهٔ آزمایشی",
  studentId: "student-1",
  programType: "workout",
  status: "active",
  version: 1,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  dateRange: "بازهٔ واقعی برنامه",
  pdfSettings: {
    contactInfo: "",
    fileTitle: "برنامهٔ آزمایشی",
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
    schedule: {
      version: 1,
      configured: true,
      start_date: "2026-10-01",
      end_date: "2026-10-10",
      weeks: [
        {
          week: 1,
          starts_on: "2026-10-01",
          ends_on: "2026-10-07",
          sessions: [{ day_id: "day-1", scheduled_on: "2026-10-01" }]
        },
        {
          week: 2,
          starts_on: "2026-10-08",
          ends_on: "2026-10-10",
          sessions: [{ day_id: "day-1", scheduled_on: "2026-10-08" }]
        }
      ]
    },
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
            name: "پرس سینه هالتر",
            sets: 3,
            reps: "10",
            rest: "90 ثانیه",
            rpe: "7",
            notes: "",
            order: 1,
            targetMuscle: "سینه",
            primary_muscle: "سینه"
          }
        ]
      }
    ]
  }
};

function uploadedDemo() {
  return {
    key: "coach-upload", title: "Coach video",
    reel_url: "/media/workout/uploads/test/video.mp4",
    preview_url: "/media/workout/uploads/test/preview.mp4",
    poster_url: "/media/workout/uploads/test/poster.jpg",
    education: {},
    attribution: { author: "Coach", source_url: "", license: "", license_url: "", changes: "" }
  };
}

describe("InteractiveWorkout", () => {
  beforeEach(() => api.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("opens all three coach lesson sections without a video and keeps sections separate", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    const withGuide = structuredClone(program);
    withGuide.training!.days[0].exercises[0].execution_guide = {
      execution: "آماده‌سازی بدن\nحرکت کنترل‌شده",
      tips: "تنفس منظم", mistakes: "اجرای شتاب‌زده"
    };
    render(<InteractiveWorkout program={withGuide} />);
    await userEvent.click(await screen.findByRole("button", { name: "آموزش حرکت پرس سینه هالتر" }));
    expect(screen.getByText("آماده‌سازی بدن")).toBeInTheDocument();
    expect(screen.queryByText("تنفس منظم")).not.toBeInTheDocument();
    expect(screen.queryByText("اجرای شتاب‌زده")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "نکات مهم" }));
    expect(screen.getByText("تنفس منظم")).toBeInTheDocument();
    expect(screen.queryByText("آماده‌سازی بدن")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "اشتباهات" }));
    expect(screen.getByText("اجرای شتاب‌زده")).toBeInTheDocument();
    expect(screen.queryByLabelText("ویدئوی پرس سینه هالتر")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("uses the actual scheduled weeks and does not create progress on page load", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    render(<InteractiveWorkout program={program} />);

    expect(await screen.findByText("جلسهٔ برنامه‌ریزی‌شده")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "هفته‌های برنامه" })).toBeInTheDocument();
    expect(screen.getByText("هنوز چیزی ثبت نشده")).toBeInTheDocument();
    expect(screen.getByText("ویدئوی دقیق برای این حرکت ثبت نشده")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/me/programs/program-1/workout-progress/");
  });

  it.each(["https://example.test/guide/bench", "https://cdn.example.test/video.mp4", "/media/workout/bench-reel.mp4"])("never uses legacy tutorial URL %s and keeps the text guide available", async (source) => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    const withSourceLink = {
      ...program,
      training: {
        ...program.training!,
        days: program.training!.days.map((day) => ({
          ...day,
          exercises: day.exercises.map((exercise) => ({
            ...exercise,
            tutorial_source_url: source,
            tutorial_url: source
          }))
        }))
      }
    };
    render(<InteractiveWorkout program={withSourceLink} />);

    expect(await screen.findByText("ویدئوی دقیق برای این حرکت ثبت نشده")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ویدئو در منبع اصلی" })).not.toBeInTheDocument();
  });

  it("opens the timer panel from its floating mobile control", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    render(<InteractiveWorkout program={program} />);

    await userEvent.click(await screen.findByRole("button", { name: /بازکردن تایمر تمرین/ }));

    expect(await screen.findByRole("region", { name: "کنترل تایمر" })).toBeInTheDocument();
  });

  it("does not embed YouTube or request its thumbnails even when a legacy source exists", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    const withVideo = structuredClone(program);
    withVideo.training!.days[0].exercises[0].tutorial_source_url =
      "https://www.youtube.com/watch?v=8iPEnn-ltC8";
    const { container } = render(<InteractiveWorkout program={withVideo} />);
    expect(container.querySelector("iframe")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "آموزش حرکت پرس سینه هالتر" }));
    expect(screen.queryByTitle("ویدئوی پرس سینه هالتر")).not.toBeInTheDocument();
    expect(container.querySelector('img[src*="ytimg"]')).toBeNull();
    expect(screen.queryByRole("slider", { name: "موقعیت پخش ویدئو" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "بستن آموزش" }));
    expect(screen.queryByTitle("ویدئوی پرس سینه هالتر")).not.toBeInTheDocument();
  });

  it("formats fractional video time as whole minutes and seconds", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    const withVideo = structuredClone(program);
    withVideo.training!.days[0].exercises[0].media = uploadedDemo();
    render(<InteractiveWorkout program={withVideo} />);
    await userEvent.click(await screen.findByRole("button", { name: "آموزش حرکت پرس سینه هالتر" }));
    const video = screen.getByLabelText("ویدئوی پرس سینه هالتر");
    fireEvent.timeUpdate(video, { target: { currentTime: 61.774144 } });
    expect(screen.getByText("۱:۰۱")).toBeInTheDocument();
  });

  it("places the timer in the shell header instead of over exercise controls", async () => {
    const header = document.createElement("div");
    header.id = "student-workout-tools";
    document.body.appendChild(header);
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    const view = render(<InteractiveWorkout program={program} />);
    try {
      expect(header).toContainElement(
        await screen.findByRole("button", { name: /بازکردن تایمر تمرین/ })
      );
    } finally {
      view.unmount();
      header.remove();
    }
  });

  it("shows a save error and rolls back optimistic completion", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [{ week: 1, day_id: "day-1", completed_sets: { "exercise-1": [0] }, set_logs: {} }]
    });
    api.mockRejectedValueOnce(new Error("offline"));
    render(<InteractiveWorkout program={program} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "ثبت همهٔ ست‌های پرس سینه هالتر" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("ثبت عملکرد انجام نشد");
    expect(screen.getByText("۱ از ۳ ست · ناقص یا ثبت‌شده")).toBeInTheDocument();
  });

  it("does not allow writes when the server reports a different active version", async () => {
    api.mockResolvedValueOnce({ version_id: "version-2", sessions: [] });
    render(<InteractiveWorkout program={program} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("نسخهٔ برنامه تغییر کرده");
    expect(
      await screen.findByRole("button", { name: "ویرایش ست‌های پرس سینه هالتر" })
    ).toBeDisabled();
  });

  it("shows the prior week's per-set reps, weight, and rest history", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [
        {
          week: 1,
          day_id: "day-1",
          completed_sets: { "exercise-1": [0, 1] },
          set_logs: {
            "exercise-1": [
              { set_index: 0, completed: true, reps: 12, weight_kg: 30, rest_seconds: null },
              { set_index: 1, completed: true, reps: 10, weight_kg: 32.5, rest_seconds: 88 }
            ]
          }
        }
      ]
    });
    render(<InteractiveWorkout program={program} />);

    await userEvent.click(await screen.findByRole("tab", { name: "۲" }));

    expect(screen.getByText(/هفتهٔ قبل: ست ۱ ✓، ۱۲ تکرار، ۳۰ کیلو/)).toBeInTheDocument();
    expect(screen.getByText(/ست ۲ ✓، ۱۰ تکرار، ۳۲\.۵ کیلو، استراحت ۱:۲۸/)).toBeInTheDocument();
  });

  it("opens the same movement's tutorial without loading it on page entry", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    const withVideo = {
      ...program,
      training: {
        ...program.training!,
        days: program.training!.days.map((day) => ({
          ...day,
          exercises: day.exercises.map((exercise) => ({
            ...exercise,
            media: uploadedDemo()
          }))
        }))
      }
    };
    render(<InteractiveWorkout program={withVideo} />);

    const preview = await screen.findByRole("button", { name: "آموزش حرکت پرس سینه هالتر" });
    expect(preview.querySelector("video")).not.toHaveAttribute("src");
    await userEvent.click(preview);
    expect(await screen.findByLabelText("ویدئوی پرس سینه هالتر")).toHaveAttribute(
      "src",
      "/media/workout/uploads/test/video.mp4"
    );
    await userEvent.click(screen.getByRole("button", { name: "روشن‌کردن صدا" }));
    expect(screen.getByLabelText("ویدئوی پرس سینه هالتر")).toHaveProperty("muted", false);
    await userEvent.click(screen.getByRole("button", { name: "قطع صدا" }));
    expect(screen.getByLabelText("ویدئوی پرس سینه هالتر")).toHaveProperty("muted", true);
  });

  it("preserves explicit zero and incomplete sets when saving set details", async () => {
    api.mockResolvedValueOnce({
      version_id: "version-1",
      sessions: [
        {
          week: 1,
          day_id: "day-1",
          completed_sets: { "exercise-1": [] },
          set_logs: {
            "exercise-1": [
              { set_index: 0, completed: false, reps: 0, weight_kg: 0, rest_seconds: null },
              { set_index: 1, completed: false, reps: null, weight_kg: null, rest_seconds: null },
              { set_index: 2, completed: false, reps: null, weight_kg: null, rest_seconds: null }
            ]
          }
        }
      ]
    });
    api.mockResolvedValueOnce({
      week: 1,
      day_id: "day-1",
      completed_sets: { "exercise-1": [] },
      set_logs: {
        "exercise-1": [
          { set_index: 0, completed: false, reps: 0, weight_kg: 0, rest_seconds: null },
          { set_index: 1, completed: false, reps: null, weight_kg: null, rest_seconds: null },
          { set_index: 2, completed: false, reps: null, weight_kg: null, rest_seconds: null }
        ]
      }
    });
    render(<InteractiveWorkout program={program} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "ویرایش ست‌های پرس سینه هالتر" })
    );
    expect(
      await screen.findByRole("dialog", { name: "ثبت جزئیات پرس سینه هالتر" })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ذخیرهٔ ست‌ها" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith("/me/programs/program-1/workout-progress/", {
      method: "PUT",
      body: {
        week: 1,
        version_id: "version-1",
        day_id: "day-1",
        exercise_id: "exercise-1",
        completed_sets: [],
        set_logs: [
          { set_index: 0, completed: false, reps: 0, weight_kg: 0, rest_seconds: null },
          { set_index: 1, completed: false, reps: null, weight_kg: null, rest_seconds: null },
          { set_index: 2, completed: false, reps: null, weight_kg: null, rest_seconds: null }
        ]
      }
    });
  });

  it("records elapsed rest on the next completed set", async () => {
    let now = new Date("2026-10-01T10:00:00Z").getTime();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    api.mockResolvedValueOnce({
      week: 1,
      day_id: "day-1",
      completed_sets: { "exercise-1": [0] },
      set_logs: {
        "exercise-1": [
          { set_index: 0, completed: true, reps: null, weight_kg: null, rest_seconds: null },
          { set_index: 1, completed: false, reps: null, weight_kg: null, rest_seconds: null },
          { set_index: 2, completed: false, reps: null, weight_kg: null, rest_seconds: null }
        ]
      }
    });
    api.mockResolvedValueOnce({
      week: 1,
      day_id: "day-1",
      completed_sets: { "exercise-1": [0, 1] },
      set_logs: {
        "exercise-1": [
          { set_index: 0, completed: true, reps: null, weight_kg: null, rest_seconds: null },
          { set_index: 1, completed: true, reps: null, weight_kg: null, rest_seconds: 75 },
          { set_index: 2, completed: false, reps: null, weight_kg: null, rest_seconds: null }
        ]
      }
    });
    render(<InteractiveWorkout program={program} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "ویرایش ست‌های پرس سینه هالتر" })
    );
    await userEvent.click(screen.getByLabelText("ست ۱"));
    await userEvent.click(screen.getByRole("button", { name: "ذخیرهٔ ست‌ها" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));

    now += 75_000;
    await userEvent.click(
      await screen.findByRole("button", { name: "ویرایش ست‌های پرس سینه هالتر" })
    );
    await userEvent.click(screen.getByLabelText("ست ۲"));
    await userEvent.click(screen.getByRole("button", { name: "ذخیرهٔ ست‌ها" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(api).toHaveBeenLastCalledWith("/me/programs/program-1/workout-progress/", {
      method: "PUT",
      body: {
        week: 1,
        version_id: "version-1",
        day_id: "day-1",
        exercise_id: "exercise-1",
        completed_sets: [0, 1],
        set_logs: [
          { set_index: 0, completed: true, reps: null, weight_kg: null, rest_seconds: null },
          { set_index: 1, completed: true, reps: null, weight_kg: null, rest_seconds: 75 },
          { set_index: 2, completed: false, reps: null, weight_kg: null, rest_seconds: null }
        ]
      }
    });
  });

  it("sends an explicit finish-session action and reflects server completion", async () => {
    api.mockResolvedValueOnce({ version_id: "version-1", sessions: [] });
    api.mockResolvedValueOnce({
      week: 1,
      day_id: "day-1",
      completed_sets: { "exercise-1": [0, 1, 2] },
      set_logs: {},
      status: "completed",
      finished_at: "2026-10-01T10:00:00Z"
    });
    render(<InteractiveWorkout program={program} />);

    await userEvent.click(await screen.findByRole("button", { name: "پایان جلسه" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith("/me/programs/program-1/workout-progress/", {
      method: "PUT",
      body: {
        action: "finish_session",
        week: 1,
        day_id: "day-1",
        version_id: "version-1"
      }
    });
    expect(await screen.findByText("این جلسه کامل ثبت شده است.")).toBeInTheDocument();
  });
});
