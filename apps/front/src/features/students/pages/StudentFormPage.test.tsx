import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "../../../app/router/routes";
import { AuthProvider } from "../../auth";
import { AUTH_STORAGE_KEY } from "../../auth/services/authRepository";
import { STUDENTS_STORAGE_KEY } from "../services/studentsRepository";

function renderRoute(path: string) {
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      token: "mock-token-arman-vaezi",
      role: "coach",
      user: {
        createdAt: "2026-07-31T00:00:00.000Z",
        email: "arman@example.com",
        fullName: "آرمان واعظی",
        id: "arman-vaezi"
      }
    })
  );

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes surface="coach" />
      </MemoryRouter>
    </AuthProvider>
  );
}

function changeField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillRequiredCreateFields() {
  changeField(/^نام شاگرد\s*\*?$/, "شاگرد تستی");
  changeField(/^شماره موبایل\s*\*?$/, "09121234567");
  changeField(/^سن\s*\*?$/, "28");
  changeField(/^قد \(سانتی متر\)\s*\*?$/, "180");
  changeField(/^وزن \(کیلوگرم\)\s*\*?$/, "80");
  changeField(/^هدف اصلی\s*\*?$/, "hypertrophy");
  changeField(/^سطح فعلی\s*\*?$/, "intermediate");
  changeField(/^روزهای تمرین در هفته\s*\*?$/, "4");
  changeField(/^مدت هر جلسه\s*\*?$/, "70");
}

describe("StudentFormPage", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STUDENTS_STORAGE_KEY);
  });

  it("renders all main form sections", async () => {
    renderRoute("/students/new");

    expect(await screen.findByRole("heading", { name: "اطلاعات پایه" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "هدف اصلی شاگرد" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "سطح تمرینی" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "شرایط تمرین" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "آسیب ها و محدودیت ها" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "تجهیزات در دسترس" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "سبک زندگی" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ترجیحات شخصی شاگرد" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "یادداشت مربی" })).toBeInTheDocument();
  });

  it("fills Mohammad Taheri data in edit mode", async () => {
    renderRoute("/students/mohammad-taheri/edit");

    expect(await screen.findByDisplayValue("محمد طاهری")).toBeInTheDocument();
    expect(screen.getByDisplayValue("27")).toBeInTheDocument();
    expect(screen.getByDisplayValue("182")).toBeInTheDocument();
  });

  it("shows required validation errors", async () => {
    const user = userEvent.setup();
    renderRoute("/students/new");
    await screen.findByRole("heading", { name: "فرم اطلاعات پایه شاگرد" });

    await user.click(screen.getByRole("button", { name: "ذخیره شاگرد" }));

    expect(await screen.findByText("نام شاگرد الزامی است.")).toBeInTheDocument();
    expect(screen.getByText("هدف اصلی الزامی است.")).toBeInTheDocument();
    expect(screen.getByText("سطح تمرینی الزامی است.")).toBeInTheDocument();
  });

  it("shows numeric validation errors", async () => {
    renderRoute("/students/new");
    await screen.findByRole("heading", { name: "فرم اطلاعات پایه شاگرد" });

    changeField(/^نام شاگرد\s*\*?$/, "شاگرد عددی");
    changeField(/^سن\s*\*?$/, "5");
    changeField(/^قد \(سانتی متر\)\s*\*?$/, "20");
    changeField(/^وزن \(کیلوگرم\)\s*\*?$/, "500");
    changeField(/^روزهای تمرین در هفته\s*\*?$/, "8");
    changeField(/^مدت هر جلسه\s*\*?$/, "0");
    fireEvent.click(screen.getByRole("button", { name: "ذخیره شاگرد" }));

    expect(await screen.findByText("سن باید یک عدد معتبر بین ۱۲ تا ۹۰ باشد.")).toBeInTheDocument();
    expect(screen.getByText(/قد باید یک عدد معتبر/)).toBeInTheDocument();
    expect(screen.getByText(/وزن باید یک عدد معتبر/)).toBeInTheDocument();
    expect(screen.getByText(/تعداد روز تمرین باید بین/)).toBeInTheDocument();
    expect(screen.getByText(/مدت جلسه باید یک عدد مثبت/)).toBeInTheDocument();
  }, 20_000);

  it("handles conditional injury fields", async () => {
    const user = userEvent.setup();
    renderRoute("/students/new");
    await screen.findByRole("heading", { name: "فرم اطلاعات پایه شاگرد" });

    expect(screen.queryByLabelText(/نوع آسیب/)).not.toBeInTheDocument();

    const injuryGroup = screen.getByRole("group", {
      name: "آسیب دیدگی دارد؟"
    });
    await user.click(within(injuryGroup).getByLabelText("بله"));

    expect(screen.getByLabelText(/نوع آسیب/)).toBeInTheDocument();

    await user.click(within(injuryGroup).getByLabelText("خیر"));

    expect(screen.queryByLabelText(/نوع آسیب/)).not.toBeInTheDocument();
  });

  it("submits a new student successfully", async () => {
    renderRoute("/students/new");
    await screen.findByRole("heading", { name: "فرم اطلاعات پایه شاگرد" });

    fillRequiredCreateFields();
    const submitButton = screen.getByRole("button", { name: "ذخیره شاگرد" });

    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    await act(async () => {});
    expect(await screen.findByText("شاگرد جدید ذخیره شد.")).toBeInTheDocument();
    expect(screen.getAllByText("شاگرد تستی")).not.toHaveLength(0);
  });

  it("submits edited student data successfully", async () => {
    const user = userEvent.setup();
    renderRoute("/students/mohammad-taheri/edit");

    const weightInput = await screen.findByLabelText(/^وزن \(کیلوگرم\)\s*\*?$/);
    fireEvent.change(weightInput, { target: { value: "88" } });
    const submitButton = screen.getByRole("button", { name: "ذخیره تغییرات" });
    await user.click(submitButton);
    await act(async () => {});
    expect(await screen.findByText("تغییرات شاگرد ذخیره شد.")).toBeInTheDocument();
    expect(screen.getAllByText("محمد طاهری")).not.toHaveLength(0);
  });
});
