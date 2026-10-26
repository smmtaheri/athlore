import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/errors";
import { StudentLoginPage } from "../../student-portal/pages/StudentLoginPage";
import { AuthProvider } from "../context/AuthContext";
import { createAuthRepository, type LoginCodeRequestResult } from "../services/authRepository";
import { LoginPage } from "./AuthPages";

const flags = vi.hoisted(() => ({ otpEnabled: true }));
vi.mock("../../../app/config/appConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../app/config/appConfig")>();
  return {
    ...actual,
    appConfig: {
      ...actual.appConfig,
      get loginOtpEnabled() {
        return flags.otpEnabled;
      }
    }
  };
});

const sent: LoginCodeRequestResult = {
  deliveryMode: "test",
  message: "کد آزمایشی ارسال شد."
};

describe.each(["coach", "student"] as const)("%s code login", (role) => {
  beforeEach(() => {
    flags.otpEnabled = true;
    window.localStorage.clear();
  });

  function showLogin() {
    const repo = createAuthRepository(window.localStorage);
    const send = vi.spyOn(repo, "requestLoginCode").mockResolvedValue(sent);
    const login = vi.spyOn(repo, "login").mockResolvedValue({
      role,
      token: "test-session-token",
      user: {
        createdAt: "2026-01-01T00:00:00.000Z",
        email: "",
        fullName: "Test user",
        id: "test-user"
      }
    });
    render(
      <AuthProvider repository={repo}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              path="/login"
              element={role === "coach" ? <LoginPage /> : <StudentLoginPage />}
            />
            <Route path="/dashboard" element={<div>dashboard reached</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    return { repo, send, login, user: userEvent.setup() };
  }

  it("requests delivery before showing the code field and then logs in", async () => {
    const { repo, send, login, user } = showLogin();
    await user.type(await screen.findByLabelText(/شماره موبایل/), "9121112222");
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    expect(screen.queryByLabelText("کد یک‌بارمصرف")).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    const input = await screen.findByLabelText(/کد یک‌بارمصرف/);
    expect(input).toHaveFocus();
    expect(send).toHaveBeenCalledExactlyOnceWith({ phoneNumber: "+989121112222", role });
    expect(screen.getByRole("status")).toHaveTextContent(sent.message);
    expect(await repo.getSession()).toBeNull();
    expect(login).not.toHaveBeenCalled();
    await user.type(input, "123456");
    await user.click(screen.getByRole("button", { name: "ورود با کد" }));
    expect(await screen.findByText("dashboard reached")).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: "+989121112222", role, method: "code", code: "123456" })
    );
  });

  it("shows a phone-only hint and a non-personal masked example", async () => {
    showLogin();
    const phone = await screen.findByLabelText(/شماره موبایل/);
    expect(phone).toHaveAttribute("placeholder", "مثلاً 9123456789");
    expect(phone).toHaveAccessibleDescription(/فقط شماره/);
    expect(phone).toHaveAccessibleDescription(/نام کاربری/);
  });

  it("accepts a six-digit SMS code and prevents immediate resends for both roles", async () => {
    const { send, login, user } = showLogin();
    send.mockResolvedValueOnce({
      deliveryMode: "sms",
      message: "کد ورود پیامک می‌شود.",
      expiresInSeconds: 300,
      retryAfterSeconds: 60
    });
    await user.type(await screen.findByLabelText(/شماره موبایل/), "9121112222");
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    const input = await screen.findByLabelText(/کد یک‌بارمصرف/);
    expect(input).toHaveAttribute("placeholder", "کد ۶ رقمی پیامک‌شده");
    expect(input).toHaveAttribute("maxlength", "6");
    expect(screen.getByRole("button", { name: /ارسال دوباره کد \(/ })).toBeDisabled();
    login.mockRejectedValueOnce(
      new ApiError({ code: "authentication_required", message: "Invalid code", status: 401 })
    );
    await user.type(input, "334567");
    await user.click(screen.getByRole("button", { name: "ورود با کد" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("منقضی شده");
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ code: "334567", method: "code", role })
    );
    await user.clear(screen.getByLabelText(/شماره موبایل/));
    expect(screen.queryByLabelText(/کد یک‌بارمصرف/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ارسال کد" })).toBeEnabled();
  });

  it("clearly explains the server resend cooldown and disables requesting another code", async () => {
    const { send, user } = showLogin();
    send.mockRejectedValueOnce(
      new ApiError({
        code: "throttled",
        message: "برای ارسال دوباره کد، یک دقیقه صبر کنید.",
        status: 429,
        details: { wait: ["42"] }
      })
    );
    await user.type(await screen.findByLabelText(/شماره موبایل/), "9121112222");
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "برای دریافت کد جدید، لطفاً ۴۲ ثانیه صبر کنید"
    );
    expect(screen.getByRole("button", { name: /ارسال کد \(/ })).toBeDisabled();
  });

  it("clears invalidated codes after delivery failure but keeps password login usable", async () => {
    const { send, user } = showLogin();
    send.mockRejectedValueOnce(
      new ApiError({
        code: "sms_delivery_unavailable",
        message: "ارسال پیامک انجام نشد.",
        status: 503
      })
    );
    await user.type(await screen.findByLabelText(/شماره موبایل/), "9121112222");
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ارسال پیامک انجام نشد");
    expect(screen.queryByLabelText(/کد یک‌بارمصرف/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ارسال کد \(/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "رمز عبور" }));
    expect(screen.getByLabelText(/رمز عبور/)).toBeEnabled();
    expect(
      screen.getByRole("button", { name: role === "coach" ? "ورود به داشبورد" : "ورود" })
    ).toBeEnabled();
  });

  it("keeps the code hidden while sending and allows retry after delivery fails", async () => {
    const { send, login, user } = showLogin();
    let rejectDelivery!: (reason: unknown) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectDelivery = reject;
        })
    );
    await user.type(await screen.findByLabelText(/شماره موبایل/), "9121112222");
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    expect(screen.queryByLabelText(/کد یک‌بارمصرف/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/شماره موبایل/)).toBeDisabled();
    await act(async () =>
      rejectDelivery(
        new ApiError({ code: "otp_unavailable", message: "ارسال کد انجام نشد.", status: 503 })
      )
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("ارسال کد انجام نشد");
    expect(screen.queryByLabelText(/کد یک‌بارمصرف/)).not.toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    expect(await screen.findByLabelText(/کد یک‌بارمصرف/)).toBeInTheDocument();
  });

  it("validates the phone before sending and resets delivery after changing the number or method", async () => {
    const { send, user } = showLogin();
    const phone = await screen.findByLabelText(/شماره موبایل/);
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    expect(await screen.findByText("شماره موبایل الزامی است.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    await user.type(phone, "9121112222");
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    await user.type(await screen.findByLabelText(/کد یک‌بارمصرف/), "123456");
    await user.clear(phone);
    await user.type(phone, "9122223333");
    expect(screen.queryByLabelText(/کد یک‌بارمصرف/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    expect(await screen.findByLabelText(/کد یک‌بارمصرف/)).toHaveValue("");
    expect(send).toHaveBeenLastCalledWith({ phoneNumber: "+989122223333", role });
    await user.click(screen.getByRole("button", { name: "رمز عبور" }));
    expect(screen.getByLabelText(/رمز عبور/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    expect(screen.queryByLabelText(/کد یک‌بارمصرف/)).not.toBeInTheDocument();
  });

  it("can resend, clears the old code, and explains an invalid verification code", async () => {
    const { send, login, user } = showLogin();
    await user.type(await screen.findByLabelText(/شماره موبایل/), "9121112222");
    await user.click(screen.getByRole("button", { name: "ورود با کد یک‌بارمصرف" }));
    await user.click(screen.getByRole("button", { name: "ارسال کد" }));
    await user.type(await screen.findByLabelText(/کد یک‌بارمصرف/), "2222");
    login.mockRejectedValueOnce(
      new ApiError({ code: "authentication_required", message: "Invalid credentials", status: 401 })
    );
    await user.click(screen.getByRole("button", { name: "ورود با کد" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("کد ورود نادرست است");
    await user.click(screen.getByRole("button", { name: "ارسال دوباره کد" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText(/کد یک‌بارمصرف/)).toHaveValue("");
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("preserves password-only login when code login is disabled", async () => {
    flags.otpEnabled = false;
    const { send, login, user } = showLogin();
    await user.type(await screen.findByLabelText(/شماره موبایل/), "9121112222");
    expect(screen.queryByRole("button", { name: "ورود با کد یک‌بارمصرف" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/رمز عبور/), "SecurePass123!");
    await user.click(
      screen.getByRole("button", {
        name: role === "coach" ? "ورود به داشبورد" : "ورود"
      })
    );
    expect(await screen.findByText("dashboard reached")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ method: "password", password: "SecurePass123!" })
    );
  });
});
