import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../features/auth";
import {
  createAuthRepository,
  type AuthRepository,
  type AuthSession
} from "../../features/auth/services/authRepository";
import type { AppSurface } from "../config/appOrigin";
import { AppRoutes } from "./routes";

async function renderRoute(path: string, repository: AuthRepository, surface: AppSurface) {
  return render(
    <AuthProvider repository={repository}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes surface={surface} />
      </MemoryRouter>
    </AuthProvider>
  );
}

function anonymousRepo(): AuthRepository {
  window.localStorage.clear();
  return createAuthRepository(window.localStorage);
}

function studentSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    mustChangePassword: false,
    role: "student",
    student: {
      coachId: "coach-1",
      fullName: "شاگرد آزمایشی",
      id: "student-1",
      phoneNumber: "+989121111111"
    },
    token: "mock-student-token",
    user: {
      createdAt: "2026-08-09T00:00:00.000Z",
      email: "",
      fullName: "شاگرد آزمایشی",
      id: "student-1"
    },
    username: "ali_student",
    ...overrides
  };
}

function studentRepo(session: AuthSession): AuthRepository {
  window.localStorage.clear();
  const base = createAuthRepository(window.localStorage);
  return {
    ...base,
    async getSession() {
      return session;
    },
    async login() {
      return session;
    },
    async completeStudentSetup() {
      return {
        mustLoginAgain: true,
        setupComplete: true,
        username: session.username || "ali_student"
      };
    }
  };
}

describe("AppRoutes", () => {
  it("renders the public Home only on the public surface", async () => {
    await renderRoute("/", anonymousRepo(), "public");

    expect(await screen.findByRole("heading", { name: /همراه حرفه‌ای مربی/ })).toBeInTheDocument();
    expect(screen.queryByText("صفحه پیدا نشد")).not.toBeInTheDocument();
  });

  it("renders coach login without the student login link", async () => {
    await renderRoute("/login", anonymousRepo(), "coach");

    expect(await screen.findByText("ورود مربی")).toBeInTheDocument();
    expect(screen.queryByText("ورود شاگرد")).not.toBeInTheDocument();
  });

  it("renders 404 for a panel route on the public surface", async () => {
    await renderRoute("/dashboard", anonymousRepo(), "public");

    expect(await screen.findByText("صفحه پیدا نشد")).toBeInTheDocument();
    expect(await screen.findByText("404")).toBeInTheDocument();
  });

  it("renders 404 for a student route on the coach surface", async () => {
    await renderRoute("/student/login", anonymousRepo(), "coach");
    expect(await screen.findByText("صفحه پیدا نشد")).toBeInTheDocument();
  });

  it("renders student login on the student surface", async () => {
    await renderRoute("/login", anonymousRepo(), "student");
    expect(await screen.findByText("ورود شاگرد")).toBeInTheDocument();
    expect(screen.getByLabelText(/نام کاربری/)).toBeInTheDocument();
  });

  it("does not recognize the removed student URL on the student surface", async () => {
    await renderRoute("/student/login", anonymousRepo(), "student");
    expect(await screen.findByText("صفحه پیدا نشد")).toBeInTheDocument();
  });

  it("keeps mustChangePassword students on the student login surface", async () => {
    const repository = studentRepo(
      studentSession({ mustChangePassword: true, username: "ali_student" })
    );
    await renderRoute("/login", repository, "student");

    expect(await screen.findByText("برای ادامه، رمز عبور خود را تغییر دهید.")).toBeInTheDocument();
    expect(screen.queryByText("صفحه پیدا نشد")).not.toBeInTheDocument();
    expect(document.getElementById("setup-password")).toBeTruthy();
  });

  it("renders an activated student dashboard", async () => {
    await renderRoute("/dashboard", studentRepo(studentSession()), "student");

    expect(await screen.findByText(/سلام/)).toBeInTheDocument();
    expect(screen.queryByText("صفحه پیدا نشد")).not.toBeInTheDocument();
  });

  it("renders the student visits list on its final path", async () => {
    await renderRoute("/visits", studentRepo(studentSession()), "student");

    expect(await screen.findByRole("heading", { name: "ویزیت‌های من" })).toBeInTheDocument();
    expect(screen.queryByText("صفحه پیدا نشد")).not.toBeInTheDocument();
  });
});
