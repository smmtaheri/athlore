import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { createAuthRepository } from "../services/authRepository";
import { LoginPage } from "./AuthPages";

describe("LoginPage", () => {
  it("logs in and navigates to dashboard", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(
      <AuthProvider repository={createAuthRepository(window.localStorage)}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route element={<LoginPage />} path="/login" />
            <Route element={<div>dashboard page</div>} path="/dashboard" />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await user.type(await screen.findByLabelText(/ایمیل/), "arman@example.com");
    await user.type(screen.getByLabelText(/رمز عبور/), "SecurePass123!");
    await user.click(await screen.findByRole("button", { name: "ورود به داشبورد" }));

    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
  });

  it("shows validation errors", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider repository={createAuthRepository(window.localStorage)}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await user.click(screen.getByRole("button", { name: "ورود به داشبورد" }));

    expect(await screen.findByText("ایمیل معتبر وارد کنید.")).toBeInTheDocument();
  });
});
