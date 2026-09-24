import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  emptyMonthlyVisitSummary,
  type BodyCheckCycleSummary,
  type BodyCheckTodayItem,
  type DashboardMetrics,
  type MonthlyVisitSummary
} from "../services/dashboardMetrics";
import {
  BodyCheckCycleSummarySection,
  BodyCheckTodaySection,
  DashboardContent,
  MonthlyVisitSummarySection
} from "./DashboardPage";

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

  it("continues the same body-check list instead of linking to all students", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 8 }, (_, index) =>
      item({
        cycleId: `cycle-${index + 1}`,
        studentId: `student-${index + 1}`,
        studentName: `شاگرد ${index + 1}`
      })
    );

    render(
      <MemoryRouter>
        <BodyCheckTodaySection asOf="2026-09-17" items={items} />
      </MemoryRouter>
    );

    expect(screen.getByText("شاگرد 6")).toBeInTheDocument();
    expect(screen.queryByText("شاگرد 7")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "مشاهده لیست کامل شاگردها" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "نمایش ادامه نیاز به پیگیری" }));

    expect(screen.getByText("شاگرد 7")).toBeInTheDocument();
    expect(screen.getByText("شاگرد 8")).toBeInTheDocument();
  });

  it("continues the same cycle-status list", async () => {
    const user = userEvent.setup();
    const summary: BodyCheckCycleSummary = {
      active: 8,
      expiringSoon: 0,
      expired: 0,
      items: Array.from({ length: 8 }, (_, index) => ({
        cycleId: `cycle-${index + 1}`,
        daysRemaining: 10,
        endDate: "2026-09-27",
        startDate: "2026-08-28",
        status: "active" as const,
        studentId: `student-${index + 1}`,
        studentName: `دوره شاگرد ${index + 1}`
      })),
      withoutActiveCycle: 0
    };

    render(
      <MemoryRouter>
        <BodyCheckCycleSummarySection summary={summary} />
      </MemoryRouter>
    );

    expect(screen.getByText("دوره شاگرد 6")).toBeInTheDocument();
    expect(screen.queryByText("دوره شاگرد 7")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "نمایش ادامه وضعیت دوره‌های بادی‌چک" }));
    expect(screen.getByText("دوره شاگرد 8")).toBeInTheDocument();
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

  it("continues the same monthly-visit list when more students need follow-up", async () => {
    const user = userEvent.setup();
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
    expect(
      screen.queryByRole("link", { name: "مشاهده لیست کامل شاگردها" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "نمایش ادامه ارسال نشده‌ها" }));
    expect(screen.getByText("شاگرد 10")).toBeInTheDocument();
    expect(screen.queryByText("نمایش 6 مورد از 10 مورد")).not.toBeInTheDocument();
  });
});

describe("Coach dashboard layout", () => {
  it("places metrics and quick actions before the follow-up panels", () => {
    const metrics: DashboardMetrics = {
      activeStudents: 7,
      asOf: "2026-09-17",
      bodyCheckCycles: {
        active: 0,
        expiringSoon: 0,
        expired: 0,
        items: [],
        withoutActiveCycle: 7
      },
      bodyCheckToday: [],
      draftPrograms: 0,
      finalPrograms: 4,
      followUpStudents: [],
      latestPrograms: [],
      latestVisits: [],
      monthlyVisits: emptyMonthlyVisitSummary("2026-09-17"),
      overdueVisits: [],
      readyPdfFiles: 7,
      thisMonthVisits: 3,
      todayTasks: [],
      totalStudents: 7
    };

    render(
      <MemoryRouter>
        <DashboardContent metrics={metrics} primaryStudentId="student-1" />
      </MemoryRouter>
    );

    const metricsCard = screen.getByText("کل شاگردها");
    const quickAction = screen.getByRole("button", { name: "افزودن شاگرد" });
    const followUps = screen.getByText("کارهای امروز");
    const monthlyVisits = screen.getByText("پیگیری ویزیت ماهانه");
    const bodyCheckToday = screen.getByText("پیگیری بادی‌چک امروز");
    const cycleStatus = screen.getByText("وضعیت دوره‌های بادی‌چک");

    expect(
      metricsCard.compareDocumentPosition(quickAction) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      quickAction.compareDocumentPosition(followUps) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      followUps.compareDocumentPosition(monthlyVisits) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      monthlyVisits.compareDocumentPosition(bodyCheckToday) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      bodyCheckToday.compareDocumentPosition(cycleStatus) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
