import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { StudentDashboardPage } from "../../student-portal/pages/StudentDashboardPage";
import { StudentBodyCheckPage } from "./StudentBodyCheckPage";
import { BodyCheckReportView } from "./StudentBodyCheckTab";
import type { StudentBodyCheckRepository } from "../services/bodyCheckRepository";
import type { MyVisitsRepository } from "../../student-portal/services/myVisitsRepository";
import type { BodyCheckCycle, BodyCheckDashboardSnapshot, BodyCheckDay } from "../types/bodyCheck";

function day(overrides: Partial<BodyCheckDay> = {}): BodyCheckDay {
  return {
    actualWeightKg: null,
    completion: {
      hasMeals: false,
      hasNutrition: false,
      hasSleep: false,
      hasWeight: false,
      isLogged: false
    },
    createdAt: null,
    dayNumber: 1,
    id: null,
    isLogged: false,
    localDate: "2026-08-20",
    meals: null,
    nutritionAdherenceScore: null,
    sleepDurationMinutes: null,
    sleepQualityScore: null,
    sleepStartTime: null,
    status: "not_logged",
    targetWeightKg: 85,
    updatedAt: null,
    wakeTime: null,
    weekNumber: 1,
    weightDeltaKg: null,
    ...overrides
  };
}

function cycle(overrides: Partial<BodyCheckCycle> = {}): BodyCheckCycle {
  const start = new Date("2026-08-20T12:00:00Z");
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const localDate = d.toISOString().slice(0, 10);
    return day({
      dayNumber: i + 1,
      localDate,
      weekNumber: i < 7 ? 1 : i < 14 ? 2 : i < 21 ? 3 : 4,
      targetWeightKg: Number((85 - i * 0.1).toFixed(1))
    });
  });
  days[0] = {
    ...days[0],
    actualWeightKg: 84.5,
    completion: {
      hasMeals: false,
      hasNutrition: true,
      hasSleep: false,
      hasWeight: true,
      isLogged: true
    },
    id: "e1",
    isLogged: true,
    nutritionAdherenceScore: 8,
    status: "logged",
    weightDeltaKg: -0.5
  };
  return {
    coachId: "c1",
    createdAt: "",
    cycleLengthDays: 30,
    dailyTargetsKg: days.map((d) => d.targetWeightKg || 80),
    days,
    endDate: days[29].localDate,
    goalWeightKg: 82,
    id: "cycle-1",
    localToday: "2026-08-21",
    mealDetailEnabled: false,
    photos: [],
    report: {
      avgNutritionAdherenceScore: 8,
      avgSleepDurationMinutes: null,
      avgSleepQualityScore: null,
      cycleLengthDays: 30,
      deltaToGoalKg: 2.5,
      goalWeightKg: 82,
      lastActualWeightDate: "2026-08-20",
      lastActualWeightKg: 84.5,
      loggedDays: 1,
      missingDays: 29,
      nutritionScoreDays: 1,
      sleepDurationDays: 0,
      sleepQualityDays: 0,
      startingWeightKg: 85
    },
    startDate: "2026-08-20",
    startingWeightKg: 85,
    status: "active",
    studentId: "s1",
    updatedAt: "",
    ...overrides
  };
}

describe("Body Check student UI", () => {
  it("shows dashboard CTA and today completion state", async () => {
    const bc: BodyCheckDashboardSnapshot = {
      cycle: cycle(),
      lastActualWeightDate: "2026-08-20",
      lastActualWeightKg: 84.5,
      lastTargetWeightKg: 85,
      lastWeightDeltaKg: -0.5,
      today: day({
        completion: {
          hasMeals: false,
          hasNutrition: false,
          hasSleep: false,
          hasWeight: false,
          isLogged: false
        },
        dayNumber: 2,
        localDate: "2026-08-21",
        status: "not_logged",
        weekNumber: 1
      }),
      todayInCycle: true
    };
    const bodyCheckRepository: StudentBodyCheckRepository = {
      downloadPhoto: async () => new Blob(),
      getActive: async () => ({ cycle: bc.cycle, dashboard: bc }),
      getDashboard: async () => bc,
      saveEntry: async () => bc.today!,
      uploadPhoto: async () => ({
        contentType: "image/png",
        downloadPath: "",
        id: "p1",
        originalFilename: "a.png",
        sizeBytes: 1,
        uploadedAt: "",
        weekNumber: 1
      })
    };
    const visitsRepository: MyVisitsRepository = {
      getById: async () => null,
      list: async () => [],
      submit: async () => {
        throw new Error("unused");
      },
      updateAnswers: async () => {
        throw new Error("unused");
      }
    };

    render(
      <MemoryRouter>
        <StudentDashboardPage
          bodyCheckRepository={bodyCheckRepository}
          repository={visitsRepository}
        />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "بادی چک امروز" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت بادی چک امروز" })).toBeInTheDocument();
    expect(screen.getByText(/ثبت‌نشده/)).toBeInTheDocument();
    expect(screen.getByText(/مانده: وزن، خواب، رژیم/)).toBeInTheDocument();
  });

  it("locks meal section and blocks future dates", async () => {
    const user = userEvent.setup();
    const active = cycle({ mealDetailEnabled: false, localToday: "2026-08-21" });
    let saved: unknown = null;
    const repository: StudentBodyCheckRepository = {
      downloadPhoto: async () => new Blob(),
      getActive: async () => ({ cycle: active, dashboard: null }),
      getDashboard: async () => null,
      saveEntry: async (input) => {
        saved = input;
        return day({
          ...active.days![1],
          actualWeightKg: input.actualWeightKg ?? null,
          isLogged: true,
          status: "logged"
        });
      },
      uploadPhoto: async () => {
        throw new Error("unused");
      }
    };

    render(
      <MemoryRouter>
        <StudentBodyCheckPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findByText(/مربی هنوز ثبت ریز وعده‌ها را/)).toBeInTheDocument();
    const futureChip = screen.getByRole("button", { name: "30" });
    expect(futureChip).toBeDisabled();

    await user.clear(screen.getByLabelText(/وزن واقعی/));
    await user.type(screen.getByLabelText(/وزن واقعی/), "84.2");
    await user.click(screen.getByRole("button", { name: "ذخیره این روز" }));
    expect(saved).toMatchObject({ actualWeightKg: 84.2 });
  });

  it("renders coach report with missing-day denominator", async () => {
    render(<BodyCheckReportView cycle={cycle()} studentName="شاگرد نمونه" />);
    expect(screen.getByText(/1 از 30|۱ از ۳۰/)).toBeInTheDocument();
    expect(screen.getByText(/ثبت‌نشده: 29|ثبت‌نشده: ۲۹/)).toBeInTheDocument();
    expect(screen.getAllByText("ثبت‌نشده").length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: "چاپ گزارش" })).not.toBeInTheDocument();
  });

  it("renders weekly progress photos as images in coach report", async () => {
    const createObjectURL = vi.fn(() => "blob:body-check-photo");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });

    const withPhotos = cycle({
      photos: [
        {
          contentType: "image/png",
          downloadPath: "/body-check/photos/p1/download/",
          id: "p1",
          originalFilename: "week1-front.png",
          sizeBytes: 1200,
          uploadedAt: "2026-08-20T10:00:00Z",
          weekNumber: 1
        },
        {
          contentType: "image/png",
          downloadPath: "/body-check/photos/p2/download/",
          id: "p2",
          originalFilename: "week2-side.png",
          sizeBytes: 1400,
          uploadedAt: "2026-08-27T10:00:00Z",
          weekNumber: 2
        }
      ]
    });

    render(
      <BodyCheckReportView
        cycle={withPhotos}
        downloadPhoto={async () => new Blob(["fake-image"], { type: "image/png" })}
        studentName="شاگرد نمونه"
      />
    );

    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(2);
    expect(screen.getByAltText("week1-front.png")).toBeInTheDocument();
    expect(screen.getByAltText("week2-side.png")).toBeInTheDocument();
    expect(screen.queryByText("week1-front.png")).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
