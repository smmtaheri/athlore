import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { STUDENT_PDF_FILES_STORAGE_KEY } from "../services/studentPdfFilesRepository";
import type { StudentPdfFilesRepository } from "../services/studentPdfFilesRepository";
import { STUDENT_PROGRAMS_STORAGE_KEY } from "../services/studentProgramsRepository";
import type { StudentProgramsRepository } from "../services/studentProgramsRepository";
import { STUDENT_VISITS_STORAGE_KEY } from "../services/studentVisitsRepository";
import type { StudentVisitsRepository } from "../services/studentVisitsRepository";
import { STUDENTS_STORAGE_KEY } from "../services/studentsRepository";
import { studentFixtures } from "../fixtures/students";
import { studentVisitFixtures } from "../fixtures/studentVisits";
import type { StudentsRepository } from "../services/studentsRepository";
import type { Student } from "../types/student";
import { StudentProfilePage } from "./StudentProfilePage";

const mohammad: Student = (() => {
  const student = studentFixtures.find((item) => item.id === "mohammad-taheri");

  if (!student) {
    throw new Error("Mohammad Taheri fixture is required for profile tests.");
  }

  return student;
})();

function createRepository(getById: StudentsRepository["getById"]): StudentsRepository {
  return {
    create: async () => mohammad,
    getById,
    list: async () => studentFixtures,
    reset: async () => studentFixtures,
    update: async () => mohammad
  };
}

function renderProfile(
  path = "/students/mohammad-taheri",
  repository = createRepository(async (id) => studentFixtures.find((student) => student.id === id)),
  featureRepositories: {
    pdfFilesRepository?: StudentPdfFilesRepository;
    programsRepository?: StudentProgramsRepository;
    visitsRepository?: StudentVisitsRepository;
  } = {}
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <StudentProfilePage {...featureRepositories} repository={repository} tab="overview" />
          }
          path="/students/:studentId"
        />
        <Route
          element={
            <StudentProfilePage {...featureRepositories} repository={repository} tab="visits" />
          }
          path="/students/:studentId/visits"
        />
        <Route
          element={
            <StudentProfilePage {...featureRepositories} repository={repository} tab="programs" />
          }
          path="/students/:studentId/programs"
        />
        <Route
          element={
            <StudentProfilePage {...featureRepositories} repository={repository} tab="pdf-files" />
          }
          path="/students/:studentId/pdf-files"
        />
        <Route element={<p>ویرایش اطلاعات شاگرد</p>} path="/students/:studentId/edit" />
        <Route element={<p>لیست شاگردها</p>} path="/students" />
        <Route element={<p>تولید برنامه</p>} path="/programs/new" />
        <Route element={<p>فرم ویزیت ماهانه</p>} path="/students/:studentId/visits/new" />
        <Route
          element={<p>ویرایش ویزیت ماهانه</p>}
          path="/students/:studentId/visits/:visitId/edit"
        />
        <Route element={<p>پیش نمایش برنامه</p>} path="/programs/:programId/preview" />
      </Routes>
    </MemoryRouter>
  );
}

describe("StudentProfilePage", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STUDENTS_STORAGE_KEY);
    window.localStorage.removeItem(STUDENT_VISITS_STORAGE_KEY);
    window.localStorage.removeItem(STUDENT_PROGRAMS_STORAGE_KEY);
    window.localStorage.removeItem(STUDENT_PDF_FILES_STORAGE_KEY);
  });

  it("renders Mohammad Taheri basic information", async () => {
    renderProfile();

    expect(await screen.findAllByText("محمد طاهری")).not.toHaveLength(0);
    expect(screen.getByText("عضله سازی")).toBeInTheDocument();
    expect(screen.getByText("تقویت upper body و بهتر شدن فرم بدن")).toBeInTheDocument();
    expect(screen.getAllByText("گردن درد خفیف")).not.toHaveLength(0);
    expect(screen.getByText("برنامه نویس")).toBeInTheDocument();
    expect(
      screen.getByText(
        "شاگرد انگیزه خوبی دارد ولی گردنش زود خسته می شود. روی فرم حرکات سینه باید دقت شود. برای upper body تمرکز بیشتری می خواهم."
      )
    ).toBeInTheDocument();
  });

  it("navigates to the edit route", async () => {
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole("button", { name: "ویرایش اطلاعات" }));

    expect(screen.getByText("ویرایش اطلاعات شاگرد")).toBeInTheDocument();
  });

  it("keeps the active tab in the URL", async () => {
    const user = userEvent.setup();
    renderProfile("/students/mohammad-taheri/visits");

    expect(await screen.findByRole("tab", { name: "ویزیت ها" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await user.click(screen.getByRole("tab", { name: "برنامه ها" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "برنامه ها" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    });
    expect(screen.getByText("برنامه های شاگرد")).toBeInTheDocument();
    expect(screen.getAllByText("محمد طاهری")).not.toHaveLength(0);
  });

  it("shows the student not found state", async () => {
    renderProfile(
      "/students/missing-student",
      createRepository(async () => undefined)
    );

    expect(await screen.findByText("شاگرد پیدا نشد")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بازگشت به لیست شاگردها" })).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    renderProfile(
      "/students/mohammad-taheri",
      createRepository(() => new Promise(() => undefined))
    );

    expect(screen.getByLabelText("در حال بارگذاری پروفایل شاگرد")).toBeInTheDocument();
  });

  it("shows the repository error state", async () => {
    renderProfile(
      "/students/mohammad-taheri",
      createRepository(async () => {
        throw new Error("Repository failed");
      })
    );

    expect(await screen.findByText("خطای موقت")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تلاش دوباره" })).toBeInTheDocument();
  });

  it("renders with a mobile viewport without crashing", async () => {
    window.innerWidth = 390;
    window.dispatchEvent(new Event("resize"));

    renderProfile();

    expect(await screen.findByRole("tab", { name: "اطلاعات پایه" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("تجهیزات در دسترس")).toBeInTheDocument();
  });

  it("renders Mohammad Taheri visits and navigates to the visit form", async () => {
    const user = userEvent.setup();
    renderProfile("/students/mohammad-taheri/visits");

    expect(await screen.findAllByText("ویزیت های ماهانه")).not.toHaveLength(0);
    expect(screen.getAllByText("۱۴۰۴/۰۲/۰۸")).not.toHaveLength(0);

    await user.click(screen.getAllByRole("button", { name: "ویزیت جدید" })[0]);

    expect(screen.getByText("فرم ویزیت ماهانه")).toBeInTheDocument();
  });

  it("opens visit details on demand instead of expanding them under the history list", async () => {
    const user = userEvent.setup();
    renderProfile("/students/mohammad-taheri/visits");

    await screen.findByRole("heading", { name: "تاریخچه ویزیت ها" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "جزئیات ویزیت" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "عملیات" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "مشاهده جزئیات" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("پاسخ‌ها و یادداشت‌های ویزیت")).toBeInTheDocument();
    expect(screen.queryByText("ارزیابی عمومی")).not.toBeInTheDocument();
  });

  it("shows ISO visit dates in Jalali format in coach history", async () => {
    window.localStorage.setItem(
      STUDENT_VISITS_STORAGE_KEY,
      JSON.stringify([
        {
          ...studentVisitFixtures[0],
          id: "iso-date-visit",
          visitDate: "2026-09-21"
        }
      ])
    );
    renderProfile("/students/mohammad-taheri/visits");

    expect(await screen.findAllByText("۱۴۰۵/۰۶/۳۰")).not.toHaveLength(0);
    expect(screen.queryByText("2026-09-21")).not.toBeInTheDocument();
  });

  it("shows visits empty, loading and error states", async () => {
    renderProfile("/students/sara-rezaei/visits");

    expect(await screen.findByText("هنوز ویزیتی ثبت نشده")).toBeInTheDocument();

    const loadingVisitsRepository: StudentVisitsRepository = {
      create: async () => {
        throw new Error("Not used");
      },
      finalize: async () => {
        throw new Error("Not used");
      },
      startCoachReview: async () => {
        throw new Error("Not used");
      },
      getById: async () => null,
      listAnswerRevisions: async () => [],
      listByStudent: () => new Promise(() => undefined),
      remove: async () => undefined,
      reset: async () => [],
      sendToStudent: async () => {
        throw new Error("Not used");
      },
      update: async () => {
        throw new Error("Not used");
      }
    };

    renderProfile("/students/mohammad-taheri/visits", undefined, {
      visitsRepository: loadingVisitsRepository
    });

    expect(await screen.findByLabelText("در حال بارگذاری ویزیت ها")).toBeInTheDocument();

    const errorVisitsRepository: StudentVisitsRepository = {
      ...loadingVisitsRepository,
      listByStudent: async () => {
        throw new Error("Visits failed");
      }
    };

    renderProfile("/students/mohammad-taheri/visits", undefined, {
      visitsRepository: errorVisitsRepository
    });

    expect(await screen.findByText("خطای دریافت ویزیت ها")).toBeInTheDocument();
  });

  it("renders student programs and navigates program actions", async () => {
    const user = userEvent.setup();
    renderProfile("/students/mohammad-taheri/programs");

    expect(await screen.findByText("برنامه های شاگرد")).toBeInTheDocument();
    expect(screen.getAllByText("چهارروزه حجم متوسط")).not.toHaveLength(0);
    expect(screen.getAllByText("پیش نویس")).not.toHaveLength(0);

    await user.click(screen.getAllByRole("button", { name: "عملیات" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "مشاهده" }));

    expect(screen.getByText("پیش نمایش برنامه")).toBeInTheDocument();
  });

  it("shows programs empty state and mobile card render", async () => {
    const emptyProgramsRepository: StudentProgramsRepository = {
      activate: async () => {
        throw new Error("Not used");
      },
      duplicate: async () => {
        throw new Error("Not used");
      },
      getById: async () => null,
      listByStudent: async () => [],
      remove: async () => undefined,
      reset: async () => []
    };

    renderProfile("/students/mohammad-taheri/programs", undefined, {
      programsRepository: emptyProgramsRepository
    });

    expect(await screen.findByText("هنوز برنامه ای وجود ندارد")).toBeInTheDocument();

    window.innerWidth = 390;
    window.dispatchEvent(new Event("resize"));
    renderProfile("/students/mohammad-taheri/programs");

    expect(await screen.findAllByText("چهارروزه حجم متوسط")).not.toHaveLength(0);
  });

  it("renders PDF files with compact icon actions", async () => {
    renderProfile("/students/mohammad-taheri/pdf-files");

    expect(await screen.findAllByText("فایل های PDF")).not.toHaveLength(0);
    expect(await screen.findAllByText("برنامه_کامل_v1.2_محمد_طاهری.pdf")).not.toHaveLength(0);
    expect(await screen.findAllByText("در حال ساخت")).not.toHaveLength(0);
    expect(await screen.findAllByText("خطا")).not.toHaveLength(0);

    expect(screen.queryByRole("button", { name: "عملیات" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "مشاهده PDF" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "دانلود PDF" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "حذف PDF" }).length).toBeGreaterThan(0);
  });

  it("supports PDF delete from icon action", async () => {
    const user = userEvent.setup();
    renderProfile("/students/mohammad-taheri/pdf-files");

    expect(await screen.findAllByText("برنامه_کامل_v1.2_محمد_طاهری.pdf")).not.toHaveLength(0);

    await user.click(screen.getAllByRole("button", { name: "حذف PDF" })[1]);
    await user.click(screen.getByRole("button", { name: "حذف" }));
    expect(await screen.findByText("فایل PDF حذف شد.")).toBeInTheDocument();
  });

  it("disables view and download for non-ready PDF files", async () => {
    renderProfile("/students/mohammad-taheri/pdf-files");

    await screen.findAllByText("برنامه_کامل_v1.3_محمد_طاهری.pdf");

    const viewButtons = screen.getAllByRole("button", { name: "مشاهده PDF" });
    const downloadButtons = screen.getAllByRole("button", { name: "دانلود PDF" });

    expect(viewButtons.some((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(downloadButtons.some((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByRole("button", { name: "عملیات" })).not.toBeInTheDocument();
  });
});
