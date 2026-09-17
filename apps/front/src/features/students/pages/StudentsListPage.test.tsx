import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "../../../app/router/routes";
import { AuthProvider } from "../../auth";
import { AUTH_STORAGE_KEY } from "../../auth/services/authRepository";
import { STUDENTS_STORAGE_KEY } from "../services/studentsRepository";

function renderRoute(path = "/students") {
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      token: "mock-token-arman-vaezi",
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
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("StudentsListPage", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STUDENTS_STORAGE_KEY);
  });

  it("renders fixture students", async () => {
    renderRoute();

    expect(await screen.findAllByText("محمد طاهری")).not.toHaveLength(0);
    expect(screen.getAllByText("سارا رضایی")).not.toHaveLength(0);
  });

  it("searches students by name", async () => {
    const user = userEvent.setup();
    renderRoute();

    await screen.findAllByText("محمد طاهری", {}, { timeout: 15000 });
    await user.type(screen.getByLabelText("جستجو"), "سارا");

    await waitFor(() => {
      expect(screen.getAllByText("سارا رضایی")).not.toHaveLength(0);
      expect(screen.queryByText("محمد طاهری")).not.toBeInTheDocument();
    });
  }, 20000);

  it("shows no result state", async () => {
    const user = userEvent.setup();
    renderRoute();

    await screen.findAllByText("محمد طاهری");
    await user.type(screen.getByLabelText("جستجو"), "شاگرد ناموجود");

    expect(screen.getByText("نتیجه ای پیدا نشد")).toBeInTheDocument();
  });

  it("filters students by status", async () => {
    const user = userEvent.setup();
    renderRoute();

    await screen.findAllByText("محمد طاهری");
    await user.selectOptions(screen.getByLabelText("وضعیت"), "inactive");

    expect(screen.getAllByText("نیما کریمی")).not.toHaveLength(0);
    expect(screen.queryByText("محمد طاهری")).not.toBeInTheDocument();
  });

  it("navigates to the create route", async () => {
    const user = userEvent.setup();
    renderRoute();

    await user.click(await screen.findByRole("button", { name: /افزودن شاگرد/ }));

    expect(
      await screen.findByRole("heading", { name: "فرم اطلاعات پایه شاگرد" })
    ).toBeInTheDocument();
  });

  it("navigates to the edit route", async () => {
    const user = userEvent.setup();
    renderRoute();

    await screen.findAllByText("محمد طاهری");
    await user.click(screen.getAllByRole("button", { name: /ویرایش/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ویرایش اطلاعات شاگرد" })).toBeInTheDocument();
    });
  });
});
