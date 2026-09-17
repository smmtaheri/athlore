import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { BodyCheckTodayItem } from "../services/dashboardMetrics";
import { BodyCheckTodaySection } from "./DashboardPage";

function item(overrides: Partial<BodyCheckTodayItem> = {}): BodyCheckTodayItem {
  return {
    actualWeightKg: null,
    completion: { hasNutrition: false, hasSleep: false, hasWeight: false },
    cycleId: "cycle-1",
    isLogged: false,
    localDate: "2026-09-17",
    nutritionAdherenceScore: null,
    sleepDurationMinutes: null,
    sleepQualityScore: null,
    sleepStartTime: null,
    status: "not_logged",
    studentId: "student-1",
    studentName: "شاگرد نمونه",
    targetWeightKg: 80,
    weightDeltaKg: null,
    wakeTime: null,
    ...overrides
  };
}

describe("Coach body-check dashboard", () => {
  it("prioritizes missing and partial logs and links to the student body-check tab", () => {
    const missing = item();
    const partial = item({
      completion: { hasNutrition: true, hasSleep: true, hasWeight: true },
      cycleId: "cycle-2",
      isLogged: true,
      sleepStartTime: "23:30:00",
      studentId: "student-2",
      studentName: "ثبت کامل",
      status: "logged",
      wakeTime: "07:00:00"
    });
    const incomplete = item({
      completion: { hasNutrition: false, hasSleep: true, hasWeight: true },
      cycleId: "cycle-3",
      isLogged: true,
      studentId: "student-3",
      studentName: "ثبت ناقص",
      status: "logged"
    });

    render(
      <MemoryRouter>
        <BodyCheckTodaySection asOf="2026-09-17" items={[partial, missing, incomplete]} />
      </MemoryRouter>
    );

    expect(screen.getByText("نیاز به پیگیری")).toBeInTheDocument();
    expect(screen.getByText("ثبت کامل امروز")).toBeInTheDocument();
    expect(screen.getByText("1 ثبت نشده")).toBeInTheDocument();
    expect(screen.getByText("1 ناقص")).toBeInTheDocument();
    expect(screen.getByText("1 کامل")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /شاگرد نمونه/ })).toHaveAttribute(
      "href",
      "/students/student-1/body-check"
    );
  });
});
