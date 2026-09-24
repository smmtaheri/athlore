import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { studentFixtures } from "../fixtures/students";
import { studentVisitFixtures } from "../fixtures/studentVisits";
import { STUDENT_VISITS_STORAGE_KEY } from "../services/studentVisitsRepository";
import { VISIT_FORM_TEMPLATES_STORAGE_KEY } from "../services/visitFormTemplatesRepository";
import type { StudentVisitsRepository } from "../services/studentVisitsRepository";
import { STUDENTS_STORAGE_KEY } from "../services/studentsRepository";
import type { StudentsRepository } from "../services/studentsRepository";
import type { StudentVisitInput } from "../types/monthlyVisit";
import { StudentProfilePage } from "./StudentProfilePage";
import { StudentVisitFormPage } from "./StudentVisitFormPage";

function renderVisitRoute(
  path: string,
  repos: {
    studentsRepo?: StudentsRepository;
    visitsRepo?: StudentVisitsRepository;
  } = {}
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <StudentVisitFormPage
              mode="create"
              studentsRepo={repos.studentsRepo}
              visitsRepo={repos.visitsRepo}
            />
          }
          path="/students/:studentId/visits/new"
        />
        <Route
          element={
            <StudentVisitFormPage
              mode="edit"
              studentsRepo={repos.studentsRepo}
              visitsRepo={repos.visitsRepo}
            />
          }
          path="/students/:studentId/visits/:visitId/edit"
        />
        <Route element={<StudentProfilePage tab="visits" />} path="/students/:studentId/visits" />
        <Route element={<p>لیست شاگردها</p>} path="/students" />
        <Route element={<p>تولید برنامه</p>} path="/programs/new" />
      </Routes>
    </MemoryRouter>
  );
}

describe("StudentVisitFormPage", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STUDENTS_STORAGE_KEY);
    window.localStorage.removeItem(STUDENT_VISITS_STORAGE_KEY);
    window.localStorage.removeItem(VISIT_FORM_TEMPLATES_STORAGE_KEY);
  });

  it("shows required and numeric validation errors", async () => {
    const user = userEvent.setup();
    renderVisitRoute("/students/mohammad-taheri/visits/new");

    await screen.findByRole("heading", { name: "ویزیت جدید" });
    await user.clear(screen.getByLabelText(/^تاریخ ویزیت/));
    await user.clear(screen.getByLabelText(/^وزن جدید/));
    await user.click(screen.getByRole("button", { name: "ثبت پیش‌نویس" }));

    expect(await screen.findByText("تاریخ ویزیت الزامی است.")).toBeInTheDocument();
    expect(screen.getByText(/وزن فعلی باید یک عدد معتبر/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^وزن جدید/), {
      target: { value: "500" }
    });
    await user.click(screen.getByRole("button", { name: "ثبت پیش‌نویس" }));

    expect(screen.getByText(/وزن فعلی باید یک عدد معتبر/)).toBeInTheDocument();
  }, 20_000);

  it("creates a visit and returns to the visits tab", async () => {
    renderVisitRoute("/students/mohammad-taheri/visits/new");

    fireEvent.change(await screen.findByLabelText(/^تاریخ ویزیت/), {
      target: { value: "۱۴۰۵/۰۳/۰۵" }
    });
    fireEvent.change(screen.getByLabelText(/^وزن جدید/), {
      target: { value: "88.2" }
    });
    fireEvent.change(screen.getByLabelText("بازخورد شاگرد"), {
      target: { value: "انرژی بهتر شده است." }
    });
    fireEvent.click(screen.getByRole("button", { name: "ثبت پیش‌نویس" }));

    expect(await screen.findByText("ویزیت جدید ثبت شد.")).toBeInTheDocument();
    expect(screen.getAllByText("۱۴۰۵/۰۳/۰۵")).not.toHaveLength(0);
    const savedVisits = JSON.parse(
      window.localStorage.getItem(STUDENT_VISITS_STORAGE_KEY) || "[]"
    ) as Array<{ visitDate: string }>;
    expect(savedVisits[0]?.visitDate).toBe("2026-05-26");
  });

  it("rejects invalid Jalali visit dates before calling the API", async () => {
    const user = userEvent.setup();
    renderVisitRoute("/students/mohammad-taheri/visits/new");

    await screen.findByRole("heading", { name: "ویزیت جدید" });
    fireEvent.change(screen.getByLabelText(/^تاریخ ویزیت/), {
      target: { value: "۱۴۰۵/۱۳/۰۵" }
    });
    await user.click(screen.getByRole("button", { name: "ثبت پیش‌نویس" }));

    expect(await screen.findByText(/تاریخ ویزیت را به شکل شمسی سال\/ماه\/روز/)).toBeInTheDocument();
  });

  it("defaults new visits to today's editable Jalali date", async () => {
    renderVisitRoute("/students/mohammad-taheri/visits/new");

    const dateInput = await screen.findByLabelText(/^تاریخ ویزیت/);
    expect((dateInput as HTMLInputElement).value).toMatch(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
    expect(dateInput).toBeEnabled();
  });

  it("sends a draft visit to the student after save", async () => {
    const user = userEvent.setup();
    const sendToStudent = vi.fn(async (_studentId: string, visitId: string) => ({
      adherence: {
        nutritionPercent: 80,
        overallPercent: 80,
        supplementsPercent: 80,
        trainingPercent: 80
      },
      answers: {},
      bodyFeeling: "",
      coachAssessment: "",
      coachNotes: "",
      coachPrivateNotes: "",
      createdAt: "2026-08-09T10:00:00.000Z",
      currentWeightKg: 88,
      dailyEnergyLevel: "medium" as const,
      expiresAt: "2026-09-08T10:00:00.000Z",
      formTemplateId: null,
      formTemplateKey: "",
      formTemplateName: "",
      formTemplateSnapshot: {},
      formTemplateVersion: 1,
      hasNewInjury: false,
      id: visitId,
      measurements: {},
      newInjuryNotes: "",
      nextCycleGoal: "",
      previousWeightKg: 88,
      sleepQuality: "medium" as const,
      status: "waiting_for_student" as const,
      stressLevel: "medium" as const,
      studentFeedback: "",
      studentId: "mohammad-taheri",
      trainingConditionChanges: "",
      updatedAt: "2026-08-09T10:00:00.000Z",
      visitDate: "2026-08-09"
    }));

    const update = vi.fn(async (_studentId: string, visitId: string, input: StudentVisitInput) => ({
      ...input,
      answers: input.answers ?? {},
      coachPrivateNotes: input.coachPrivateNotes ?? "",
      createdAt: "2026-08-09T09:00:00.000Z",
      formTemplateId: input.formTemplateId ?? null,
      formTemplateKey: "",
      formTemplateName: "",
      formTemplateSnapshot: {},
      formTemplateVersion: 1,
      id: visitId,
      status: input.status ?? "draft",
      studentId: "mohammad-taheri",
      updatedAt: "2026-08-09T09:30:00.000Z"
    }));

    window.localStorage.setItem(
      STUDENT_VISITS_STORAGE_KEY,
      JSON.stringify([
        {
          ...studentVisitFixtures[0],
          id: "draft-visit-1",
          status: "draft",
          studentId: "mohammad-taheri",
          visitDate: "2026-08-09"
        }
      ])
    );

    const visitsRepo: StudentVisitsRepository = {
      create: async () => {
        throw new Error("create should not run");
      },
      finalize: async () => {
        throw new Error("finalize should not run");
      },
      startCoachReview: async () => {
        throw new Error("startCoachReview should not run");
      },
      getById: async (_studentId, visitId) => {
        if (visitId !== "draft-visit-1") {
          return null;
        }
        if (sendToStudent.mock.calls.length > 0) {
          return sendToStudent.mock.results[0]?.value
            ? await sendToStudent.mock.results[0].value
            : {
                ...studentVisitFixtures[0],
                expiresAt: "2026-09-08T10:00:00.000Z",
                id: "draft-visit-1",
                status: "waiting_for_student",
                studentId: "mohammad-taheri",
                visitDate: "2026-08-09"
              };
        }
        return {
          ...studentVisitFixtures[0],
          id: "draft-visit-1",
          status: "draft",
          studentId: "mohammad-taheri",
          visitDate: "2026-08-09"
        };
      },
      list: async () => [],
      listAnswerRevisions: async () => [],
      listByStudent: async () => [
        {
          ...studentVisitFixtures[0],
          id: "draft-visit-1",
          status: "draft",
          studentId: "mohammad-taheri",
          visitDate: "2026-08-09"
        }
      ],
      remove: async () => undefined,
      reset: async () => [],
      sendToStudent,
      update
    };

    renderVisitRoute("/students/mohammad-taheri/visits/draft-visit-1/edit", { visitsRepo });

    await screen.findByRole("heading", { name: "ویرایش ویزیت" });
    await user.click(screen.getByRole("button", { name: /ارسال برای شاگرد/ }));

    expect(update).toHaveBeenCalled();
    expect(sendToStudent).toHaveBeenCalledWith("mohammad-taheri", "draft-visit-1");
    expect(await screen.findByText(/فرم برای شاگرد ارسال شد/)).toBeInTheDocument();
  });

  it("edits an existing visit with the shared form", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STUDENT_VISITS_STORAGE_KEY,
      JSON.stringify(
        studentVisitFixtures.map((visit) =>
          visit.id === "visit-mohammad-1404-02-08"
            ? { ...visit, status: "draft", visitDate: "2026-04-28" }
            : visit
        )
      )
    );

    renderVisitRoute("/students/mohammad-taheri/visits/visit-mohammad-1404-02-08/edit");

    const assessment = await screen.findByLabelText("ارزیابی مربی");
    await user.clear(assessment);
    await user.type(assessment, "فرم حرکات بهتر شده است.");
    await user.click(screen.getByRole("button", { name: "ذخیره ویزیت" }));

    expect(await screen.findByText("تغییرات ویزیت ذخیره شد.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "عملیات" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "مشاهده جزئیات" }));
    expect(screen.getByText("فرم حرکات بهتر شده است.")).toBeInTheDocument();
  });

  it("exposes send and finalize actions for draft visits", async () => {
    renderVisitRoute("/students/mohammad-taheri/visits/new");

    await screen.findByRole("heading", { name: "ویزیت جدید" });
    expect(screen.getByRole("button", { name: "ارسال برای شاگرد" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ذخیره و نهایی‌سازی" })).toBeInTheDocument();
    expect(screen.getByText("پیش‌نویس")).toBeInTheDocument();
  });

  it("handles conditional new injury fields", async () => {
    const user = userEvent.setup();
    renderVisitRoute("/students/mohammad-taheri/visits/new");

    const injuryGroup = await screen.findByRole("group", {
      name: "آسیب یا محدودیت جدید وجود دارد؟"
    });

    expect(screen.queryByLabelText(/شرح آسیب/)).not.toBeInTheDocument();

    await user.click(within(injuryGroup).getByLabelText("بله"));
    expect(screen.getByLabelText(/شرح آسیب/)).toBeInTheDocument();

    await user.click(within(injuryGroup).getByLabelText("خیر"));
    expect(screen.queryByLabelText(/شرح آسیب/)).not.toBeInTheDocument();
  });

  it("shows repository error and not found states", async () => {
    const studentsRepo: StudentsRepository = {
      create: async () => studentFixtures[0],
      getById: async () => {
        throw new Error("Students failed");
      },
      list: async () => studentFixtures,
      reset: async () => studentFixtures,
      update: async () => studentFixtures[0]
    };
    const emptyVisitsRepo: StudentVisitsRepository = {
      create: async (_studentId: string, input: StudentVisitInput) => ({
        ...input,
        answers: input.answers ?? {},
        coachPrivateNotes: input.coachPrivateNotes ?? "",
        createdAt: "",
        formTemplateId: input.formTemplateId ?? null,
        formTemplateKey: "",
        formTemplateName: "",
        formTemplateSnapshot: {},
        formTemplateVersion: 1,
        id: "visit-test",
        status: input.status ?? "draft",
        studentId: "mohammad-taheri",
        updatedAt: ""
      }),
      finalize: async (_studentId, visitId) => ({
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
        currentWeightKg: 0,
        dailyEnergyLevel: "medium",
        formTemplateId: null,
        formTemplateKey: "",
        formTemplateName: "",
        formTemplateSnapshot: {},
        formTemplateVersion: 1,
        hasNewInjury: false,
        id: visitId,
        measurements: {},
        newInjuryNotes: "",
        nextCycleGoal: "",
        previousWeightKg: 0,
        sleepQuality: "medium",
        status: "finalized",
        stressLevel: "medium",
        studentFeedback: "",
        studentId: "mohammad-taheri",
        trainingConditionChanges: "",
        updatedAt: "",
        visitDate: ""
      }),
      startCoachReview: async (_studentId, visitId) => ({
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
        currentWeightKg: 0,
        dailyEnergyLevel: "medium",
        formTemplateId: null,
        formTemplateKey: "",
        formTemplateName: "",
        formTemplateSnapshot: {},
        formTemplateVersion: 1,
        hasNewInjury: false,
        id: visitId,
        measurements: {},
        newInjuryNotes: "",
        nextCycleGoal: "",
        previousWeightKg: 0,
        sleepQuality: "medium",
        status: "coach_review",
        stressLevel: "medium",
        studentFeedback: "",
        studentId: "mohammad-taheri",
        trainingConditionChanges: "",
        updatedAt: "",
        visitDate: ""
      }),
      getById: async () => null,
      listAnswerRevisions: async () => [],
      listByStudent: async () => [],
      remove: async () => undefined,
      reset: async () => [],
      sendToStudent: async (_studentId, visitId) => ({
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
        currentWeightKg: 0,
        dailyEnergyLevel: "medium",
        formTemplateId: null,
        formTemplateKey: "",
        formTemplateName: "",
        formTemplateSnapshot: {},
        formTemplateVersion: 1,
        hasNewInjury: false,
        id: visitId,
        measurements: {},
        newInjuryNotes: "",
        nextCycleGoal: "",
        previousWeightKg: 0,
        sleepQuality: "medium",
        status: "waiting_for_student",
        stressLevel: "medium",
        studentFeedback: "",
        studentId: "mohammad-taheri",
        trainingConditionChanges: "",
        updatedAt: "",
        visitDate: ""
      }),
      update: async (_studentId: string, visitId: string, input: StudentVisitInput) => ({
        ...input,
        answers: input.answers ?? {},
        coachPrivateNotes: input.coachPrivateNotes ?? "",
        createdAt: "",
        formTemplateId: input.formTemplateId ?? null,
        formTemplateKey: "",
        formTemplateName: "",
        formTemplateSnapshot: {},
        formTemplateVersion: 1,
        id: visitId,
        status: input.status ?? "draft",
        studentId: "mohammad-taheri",
        updatedAt: ""
      })
    };

    renderVisitRoute("/students/mohammad-taheri/visits/new", {
      studentsRepo,
      visitsRepo: emptyVisitsRepo
    });
    expect(await screen.findByText("خطای موقت")).toBeInTheDocument();

    renderVisitRoute("/students/mohammad-taheri/visits/missing/edit", {
      visitsRepo: emptyVisitsRepo
    });
    expect(await screen.findByText("اطلاعات ویزیت پیدا نشد")).toBeInTheDocument();
  });
});
