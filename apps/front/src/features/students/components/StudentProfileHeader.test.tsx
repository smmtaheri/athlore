import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { studentFixtures } from "../fixtures/students";
import { StudentProfileHeader } from "./StudentProfileHeader";

const repository = vi.hoisted(() => ({
  getById: vi.fn(),
  setPortalInitialPassword: vi.fn()
}));
vi.mock("../services/studentsRepository", () => ({ studentsRepository: repository }));

describe("phone-based portal activation", () => {
  const student = {
    ...studentFixtures[0],
    phoneNumber: "+989121111111",
    portalAccess: {
      status: "not_started" as const,
      portalEnabled: false,
      accountActivated: false,
      mustChangePassword: false,
      username: null,
      hasPendingInitialPassword: false
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository.getById.mockResolvedValue(student);
    repository.setPortalInitialPassword.mockResolvedValue({
      studentId: student.id,
      initialPassword: "InitialPass123!",
      username: "internal-identity-do-not-display"
    });
  });

  it("activates with only the initial password and shows the profile phone", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StudentProfileHeader student={student} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: "فعال‌سازی پنل شاگرد" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText(/نام کاربری/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/شماره ورود شاگرد:/)).toHaveTextContent("09121111111");
    await user.type(within(dialog).getByLabelText(/رمز اولیه/), "InitialPass123!");
    await user.click(within(dialog).getByRole("button", { name: "ثبت رمز اولیه" }));
    expect(repository.setPortalInitialPassword).toHaveBeenCalledExactlyOnceWith(
      student.id,
      "InitialPass123!"
    );
    expect(await screen.findByText(/شماره ورود:/, { selector: "p" })).toHaveTextContent(
      "09121111111"
    );
    expect(screen.queryByText("internal-identity-do-not-display")).not.toBeInTheDocument();
  });

  it("never exposes an old username or its edit action", () => {
    render(
      <MemoryRouter>
        <StudentProfileHeader
          student={{
            ...student,
            portalAccess: {
              ...student.portalAccess,
              status: "active",
              username: "old-athlete-username",
              portalEnabled: true
            }
          }}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText(/old-athlete-username/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ویرایش نام کاربری" })).not.toBeInTheDocument();
    expect(screen.getByText(/شماره ورود:/)).toHaveTextContent("09121111111");
  });

  it("offers optional password setup for an OTP-ready account without a password", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StudentProfileHeader
          student={{
            ...student,
            portalAccess: {
              ...student.portalAccess,
              accountActivated: false,
              portalEnabled: true,
              status: "active",
              username: null
            }
          }}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "تنظیم رمز اختیاری" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "ورود با کد یک‌بارمصرف همین حالا فعال است"
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("در اولین ورودِ رمزی");
  });
});
