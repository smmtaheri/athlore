import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { createAuthRepository } from "../services/authRepository";
import { ProtectedRoute, PublicOnlyRoute } from "./AuthRoutes";

describe("AuthRoutes", () => {
  it("redirects anonymous users from protected routes", async () => {
    window.localStorage.clear();
    render(
      <AuthProvider repository={createAuthRepository(window.localStorage)}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              element={
                <ProtectedRoute role="coach">
                  <div>protected</div>
                </ProtectedRoute>
              }
              path="/dashboard"
            />
            <Route element={<div>login page</div>} path="/login" />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("redirects authenticated users away from public auth routes", async () => {
    window.localStorage.clear();
    const repository = createAuthRepository(window.localStorage);
    await repository.login({ email: "arman@example.com", password: "123456" });

    render(
      <AuthProvider repository={repository}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              element={
                <PublicOnlyRoute role="coach">
                  <div>login page</div>
                </PublicOnlyRoute>
              }
              path="/login"
            />
            <Route element={<div>dashboard page</div>} path="/dashboard" />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
  });
});
