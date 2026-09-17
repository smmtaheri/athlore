import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppShell } from "./AppShell";

function renderShell(initialPath = "/students") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<p>محتوای صفحه</p>} path="/students" />
          <Route element={<p>داشبورد</p>} index />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  it("renders the shell and nested route", () => {
    renderShell();

    expect(screen.getByText("محتوای صفحه")).toBeInTheDocument();
    expect(screen.getAllByText("Athlore").length).toBeGreaterThan(0);
  });

  it("marks the active navigation item from the route", () => {
    renderShell();

    expect(screen.getByRole("link", { name: /شاگردها/i })).toHaveAttribute("aria-current", "page");
  });

  it("opens and closes the mobile drawer", async () => {
    const user = userEvent.setup();
    renderShell("/");

    const menuButton = screen.getByLabelText("باز کردن منوی ناوبری");

    fireEvent.click(menuButton);

    expect(screen.getByRole("dialog", { name: "منوی موبایل" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "بستن منوی ناوبری" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "منوی موبایل" })).not.toBeInTheDocument();
    });
    expect(menuButton).toHaveFocus();
  });

  it("closes the mobile drawer with Escape", async () => {
    renderShell("/");

    fireEvent.click(screen.getByLabelText("باز کردن منوی ناوبری"));
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "منوی موبایل" })).not.toBeInTheDocument();
    });
  });
});
