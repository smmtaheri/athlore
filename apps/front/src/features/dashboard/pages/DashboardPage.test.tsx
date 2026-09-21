import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { BodyCheckTodayItem, MonthlyVisitSummary } from "../services/dashboardMetrics";
import { BodyCheckTodaySection, MonthlyVisitSummarySection } from "./DashboardPage";

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
    expect(
      screen.getByText(
        "از 3 شاگرد دارای دوره فعال، 2 نفر امروز بادی‌چک را ثبت کرده‌اند و 1 نفر هنوز ثبت نکرده‌اند."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("3 کل")).toBeInTheDocument();
    expect(screen.getByText("2 ثبت‌شده")).toBeInTheDocument();
    expect(screen.getByText("1 ثبت نشده")).toBeInTheDocument();
    expect(screen.getByText("1 ناقص")).toBeInTheDocument();
    expect(screen.getByText("1 کامل")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /شاگرد نمونه/ })).toHaveAttribute(
      "href",
      "/students/student-1/body-check"
    );
  });
});

describe("Coach monthly visit dashboard", () => {
  it("shows active-student send status and links each student to monthly visits", () => {
    const summary: MonthlyVisitSummary = {
      activeStudents: 3,
      asOf: "2026-09-21",
      coachReview: 0,
      dueSoon: 1,
      finalized: 0,
      items: [
        {
          daysUntilDue: 0,
          dueDate: "2026-09-21",
          dueState: "due_soon",
          lastVisitDate: null,
          status: "not_sent",
          studentId: "student-missing",
          studentName: "شاگرد ارسال‌نشده",
          visitDate: null,
          visitId: null
        },
        {
          daysUntilDue: null,
          dueDate: null,
          dueState: "not_due",
          lastVisitDate: "2026-09-20",
          status: "waiting_for_student",
          studentId: "student-sent",
          studentName: "شاگرد ارسال‌شده",
          visitDate: "2026-09-20",
          visitId: "visit-sent"
        },
        {
          daysUntilDue: null,
          dueDate: null,
          dueState: "not_due",
          lastVisitDate: "2026-09-19",
          status: "student_submitted",
          studentId: "student-answered",
          studentName: "شاگرد پاسخ‌داده",
          visitDate: "2026-09-19",
          visitId: "visit-answered"
        }
      ],
      month: "2026-09",
      notSent: 1,
      overdue: 0,
      sent: 2,
      studentSubmitted: 1
    };

    render(
      <MemoryRouter>
        <MonthlyVisitSummarySection summary={summary} />
      </MemoryRouter>
    );

    expect(screen.getByText("پیگیری ویزیت ماهانه")).toBeInTheDocument();
    expect(screen.getByText("1 نزدیک موعد")).toBeInTheDocument();
    expect(screen.getByText("2 ارسال‌شده")).toBeInTheDocument();
    expect(screen.getByText("1 پاسخ‌داده")).toBeInTheDocument();
    expect(screen.getByText("شاگرد ارسال‌نشده")).toBeInTheDocument();
    expect(screen.getByText("شاگرد ارسال‌شده")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /شاگرد ارسال‌نشده/ })).toHaveAttribute(
      "href",
      "/students/student-missing/visits"
    );
  });

  it("shows a bounded preview when many students need a monthly visit", () => {
    const summary: MonthlyVisitSummary = {
      activeStudents: 10,
      asOf: "2026-09-21",
      coachReview: 0,
      dueSoon: 10,
      finalized: 0,
      items: Array.from({ length: 10 }, (_, index) => ({
        daysUntilDue: 0,
        dueDate: "2026-09-21",
        dueState: "due_soon" as const,
        lastVisitDate: null,
        status: "not_sent" as const,
        studentId: `student-${index + 1}`,
        studentName: `شاگرد ${index + 1}`,
        visitDate: null,
        visitId: null
      })),
      month: "2026-09",
      notSent: 10,
      overdue: 0,
      sent: 0,
      studentSubmitted: 0
    };

    render(
      <MemoryRouter>
        <MonthlyVisitSummarySection summary={summary} />
      </MemoryRouter>
    );

    expect(screen.getByText("نمایش 6 مورد از 10 مورد")).toBeInTheDocument();
    expect(screen.getByText("شاگرد 6")).toBeInTheDocument();
    expect(screen.queryByText("شاگرد 7")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مشاهده لیست کامل شاگردها" })).toHaveAttribute(
      "href",
      "/students"
    );
  });
});
