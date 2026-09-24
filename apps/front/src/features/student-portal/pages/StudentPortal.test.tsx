import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../auth/context/AuthContext";
import { createAuthRepository } from "../../auth/services/authRepository";
import { PublicOnlyRoute, StudentProtectedRoute } from "../../auth/components/AuthRoutes";
import { PublicHomePage } from "../../../pages/home/PublicHomePage";
import { StudentLoginPage } from "./StudentLoginPage";
import { StudentDashboardPage } from "./StudentDashboardPage";
import { StudentVisitsPage } from "./StudentVisitsPage";
import { StudentVisitDetailPage } from "./StudentVisitDetailPage";
import type { MyVisitsRepository } from "../services/myVisitsRepository";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import type { VisitFormAnswers, VisitFormTemplateSnapshot } from "../../students/types/visitForm";

function baseVisit(overrides: Partial<StudentVisit> = {}): StudentVisit {
  return {
    adherence: {
      nutritionPercent: 0,
      overallPercent: 0,
      supplementsPercent: 0,
      trainingPercent: 0
    },
    answers: {},
    bodyFeeling: "",
    coachAssessment: "",
    coachNotes: "",
    coachPrivateNotes: "",
    createdAt: "",
    currentWeightKg: 70,
    dailyEnergyLevel: "medium",
    formTemplateId: null,
    formTemplateKey: "",
    formTemplateName: "فرم پیگیری",
    formTemplateSnapshot: {},
    formTemplateVersion: 1,
    hasNewInjury: false,
    id: "v1",
    measurements: {},
    newInjuryNotes: "",
    nextCycleGoal: "",
    previousWeightKg: 70,
    sleepQuality: "medium",
    status: "waiting_for_student",
    stressLevel: "medium",
    studentFeedback: "",
    studentId: "s1",
    trainingConditionChanges: "",
    updatedAt: "",
    visitDate: "۱۴۰۴/۰۱/۰۱",
    ...overrides
  };
}

const openSnapshot: VisitFormTemplateSnapshot = {
  name: "فرم پیگیری",
  sections: [
    {
      fields: [
        {
          enabled: true,
          helpText: "",
          key: "goal",
          label: "هدف",
          options: [],
          order: 1,
          prefillFrom: "",
          required: false,
          semanticKey: "",
          studentEditable: true,
          studentVisible: true,
          type: "text"
        },
        {
          enabled: true,
          helpText: "",
          key: "coach_only_visible",
          label: "فقط مشاهده",
          options: [],
          order: 2,
          prefillFrom: "",
          required: false,
          semanticKey: "",
          studentEditable: false,
          studentVisible: true,
          type: "text"
        }
      ],
      key: "main",
      label: "وضعیت",
      order: 1
    }
  ]
};

describe("Student portal routes", () => {
  it("shows the public Home entry point for student login", async () => {
    render(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "ورود شاگرد" })).toBeInTheDocument();
  });

  it("guards student dashboard and redirects anonymous users to login", async () => {
    window.localStorage.clear();
    render(
      <AuthProvider repository={createAuthRepository(window.localStorage)}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              element={
                <StudentProtectedRoute>
                  <div>student dashboard</div>
                </StudentProtectedRoute>
              }
              path="/dashboard"
            />
            <Route element={<div>student login</div>} path="/login" />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(await screen.findByText("student login")).toBeInTheDocument();
  });

  it("logs in a student via username and reaches dashboard", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    const repo = createAuthRepository(window.localStorage);

    render(
      <AuthProvider repository={repo}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              element={
                <PublicOnlyRoute role="student">
                  <StudentLoginPage />
                </PublicOnlyRoute>
              }
              path="/login"
            />
            <Route element={<div>student dashboard page</div>} path="/dashboard" />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/نام کاربری/), "ali_student");
    await user.type(screen.getByLabelText(/رمز عبور/), "Secret123!");
    await user.click(screen.getByRole("button", { name: "ورود" }));
    expect(await screen.findByText("student dashboard page")).toBeInTheDocument();
  });

  it("enters forced password change on same route when must_change_password", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    const repo = createAuthRepository(window.localStorage);

    render(
      <AuthProvider repository={repo}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              element={
                <PublicOnlyRoute role="student">
                  <StudentLoginPage />
                </PublicOnlyRoute>
              }
              path="/login"
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/نام کاربری/), "ali_student");
    await user.type(screen.getByLabelText(/^رمز عبور/), "must-change");
    await user.click(screen.getByRole("button", { name: "ورود" }));

    expect(await screen.findByText("برای ادامه، رمز عبور خود را تغییر دهید.")).toBeInTheDocument();
    expect(document.getElementById("setup-password")).toBeTruthy();
    expect(screen.queryByLabelText(/نام کاربری شاگرد/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت رمز جدید" })).toBeInTheDocument();
  });

  it("renders dashboard summary and action CTA linking to visit detail", async () => {
    const user = userEvent.setup();
    const visits: StudentVisit[] = [
      baseVisit({
        expiresAt: "2026-08-28T12:00:00.000Z",
        formTemplateName: "ویزیت باز",
        id: "open-1",
        status: "waiting_for_student"
      }),
      baseVisit({
        formTemplateName: "ویزیت ارسال‌شده",
        id: "submitted-1",
        status: "student_submitted",
        visitDate: "2026-09-21"
      }),
      baseVisit({
        formTemplateName: "ویزیت نهایی",
        id: "final-1",
        status: "finalized",
        visitDate: "۱۴۰۴/۰۲/۰۱"
      })
    ];
    const repository: MyVisitsRepository = {
      getById: async () => visits[0],
      list: async () => visits,
      submit: async () => visits[0],
      updateAnswers: async () => visits[0]
    };
    const bodyCheckRepository = {
      downloadPhoto: async () => new Blob(),
      getActive: async () => ({ cycle: null, dashboard: null }),
      getDashboard: async () => null,
      saveEntry: async () => {
        throw new Error("unused");
      },
      uploadPhoto: async () => {
        throw new Error("unused");
      }
    };

    render(
      <MemoryRouter>
        <Routes>
          <Route
            element={
              <StudentDashboardPage
                bodyCheckRepository={bodyCheckRepository}
                repository={repository}
              />
            }
            path="/"
          />
          <Route element={<div>visit detail open-1</div>} path="/visits/:visitId" />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("فضای شخصی شما")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "بادی چک امروز" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "آخرین ویزیت ارسال‌شده" })).toBeInTheDocument();
    expect(screen.getByText("ویزیت ارسال‌شده")).toBeInTheDocument();
    expect(screen.getByText("۱۴۰۵/۰۶/۳۰")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تکمیل ویزیت" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تکمیل ویزیت" }));
    expect(await screen.findByText("visit detail open-1")).toBeInTheDocument();
  });

  it("shows student visits newest first with Jalali dates", async () => {
    const repository: MyVisitsRepository = {
      getById: async () => null,
      list: async () => [
        baseVisit({
          formTemplateName: "ویزیت قدیمی‌تر",
          id: "older",
          visitDate: "2026-08-01"
        }),
        baseVisit({
          formTemplateName: "ویزیت جدیدتر",
          id: "newer",
          visitDate: "2026-09-21"
        })
      ],
      submit: async () => baseVisit(),
      updateAnswers: async () => baseVisit()
    };
    render(
      <MemoryRouter>
        <StudentVisitsPage repository={repository} />
      </MemoryRouter>
    );

    const visitTitles = await screen.findAllByRole("heading", { level: 3 });
    expect(visitTitles.map((heading) => heading.textContent)).toEqual([
      "ویزیت جدیدتر",
      "ویزیت قدیمی‌تر"
    ]);
    expect(screen.getByText("۱۴۰۵/۰۶/۳۰")).toBeInTheDocument();
    expect(screen.getByText("۱۴۰۵/۰۵/۱۰")).toBeInTheDocument();
  });

  it("filters my visits list and shows status-appropriate actions", async () => {
    const user = userEvent.setup();
    const visits = [
      baseVisit({ id: "open-1", status: "waiting_for_student" }),
      baseVisit({
        formTemplateName: "ارسال شده",
        id: "sub-1",
        status: "student_submitted"
      }),
      baseVisit({
        formTemplateName: "نهایی",
        id: "fin-1",
        status: "finalized"
      }),
      baseVisit({
        formTemplateName: "منقضی",
        id: "exp-1",
        isExpired: true,
        status: "waiting_for_student"
      })
    ];
    const repository: MyVisitsRepository = {
      getById: async () => null,
      list: async () => visits,
      submit: async () => visits[0],
      updateAnswers: async () => visits[0]
    };

    render(
      <MemoryRouter>
        <StudentVisitsPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "ویزیت‌های من" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تکمیل ویزیت" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "در انتظار بررسی مربی" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مشاهدهٔ جزئیات" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مشاهده" })).toBeInTheDocument();
    expect(screen.getByText(/مهلت ارسال این ویزیت تمام شده/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "نهایی‌شده" }));
    expect(screen.getByText("نهایی")).toBeInTheDocument();
    expect(screen.queryByText("ارسال شده")).not.toBeInTheDocument();
  });

  it("keeps open visit editable and hides private coach notes", async () => {
    const visit = baseVisit({
      answers: { coach_only_visible: "visible-value", goal: "hypertrophy" },
      coachPrivateNotes: "secret-private-note",
      formTemplateSnapshot: openSnapshot,
      id: "open-1",
      status: "waiting_for_student"
    });
    const repository: MyVisitsRepository = {
      getById: async () => visit,
      list: async () => [visit],
      submit: async () => visit,
      updateAnswers: async (_id, answers: VisitFormAnswers) => ({
        ...visit,
        answers: { ...visit.answers, ...answers }
      })
    };

    render(
      <MemoryRouter initialEntries={["/visits/open-1"]}>
        <Routes>
          <Route
            element={<StudentVisitDetailPage repository={repository} />}
            path="/visits/:visitId"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByLabelText("هدف")).toBeEnabled();
    expect(screen.getByLabelText("فقط مشاهده")).toBeDisabled();
    expect(screen.getByRole("button", { name: "ارسال برای مربی" })).toBeInTheDocument();
    expect(screen.getByText(/بعد از ارسال، تا شروع بررسی مربی/)).toBeInTheDocument();
    expect(screen.queryByText("secret-private-note")).not.toBeInTheDocument();
    expect(screen.queryByText("یادداشت خصوصی مربی")).not.toBeInTheDocument();
  });

  it("renders submitted and finalized visits as read-only without submit", async () => {
    const submitted = baseVisit({
      answers: { goal: "fat_loss" },
      formTemplateSnapshot: openSnapshot,
      id: "sub-1",
      status: "student_submitted"
    });
    const repository: MyVisitsRepository = {
      getById: async () => submitted,
      list: async () => [submitted],
      submit: async () => submitted,
      updateAnswers: async () => submitted
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={["/visits/sub-1"]}>
        <Routes>
          <Route
            element={<StudentVisitDetailPage repository={repository} />}
            path="/visits/:visitId"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/فرم شما ارسال شده/)).toBeInTheDocument();
    expect(screen.getByLabelText("هدف")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ارسال برای مربی" })).not.toBeInTheDocument();

    const finalized = baseVisit({
      answers: { goal: "fat_loss" },
      formTemplateSnapshot: openSnapshot,
      id: "fin-1",
      status: "finalized"
    });
    const finalizedRepo: MyVisitsRepository = {
      ...repository,
      getById: async () => finalized
    };

    rerender(
      <MemoryRouter initialEntries={["/visits/fin-1"]}>
        <Routes>
          <Route
            element={<StudentVisitDetailPage repository={finalizedRepo} />}
            path="/visits/:visitId"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/این ویزیت نهایی شده است/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ارسال برای مربی" })).not.toBeInTheDocument();
  });

  it("blocks edit and submit for expired open visits", async () => {
    const expired = baseVisit({
      answers: { goal: "x" },
      formTemplateSnapshot: openSnapshot,
      id: "exp-1",
      isExpired: true,
      status: "waiting_for_student"
    });
    const repository: MyVisitsRepository = {
      getById: async () => expired,
      list: async () => [expired],
      submit: async () => expired,
      updateAnswers: async () => expired
    };

    render(
      <MemoryRouter initialEntries={["/visits/exp-1"]}>
        <Routes>
          <Route
            element={<StudentVisitDetailPage repository={repository} />}
            path="/visits/:visitId"
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/مهلت پاسخ به این ویزیت تمام شده/)).toBeInTheDocument();
    expect(screen.getByLabelText("هدف")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ارسال برای مربی" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ذخیره" })).not.toBeInTheDocument();
  });
});
