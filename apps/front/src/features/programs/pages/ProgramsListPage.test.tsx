import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ProgramsListPage } from "./ProgramsListPage";

describe("ProgramsListPage", () => {
  it("filters programs by search", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(
      <MemoryRouter>
        <ProgramsListPage />
      </MemoryRouter>
    );

    expect(await screen.findAllByText("چهارروزه حجم متوسط")).not.toHaveLength(0);
    await user.type(screen.getByLabelText("جست‌وجو"), "مکمل عمومی");

    await waitFor(() => {
      expect(screen.getAllByText("برنامه مکمل عمومی")).not.toHaveLength(0);
    });
  });

  it("filters programs by program type", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(
      <MemoryRouter>
        <ProgramsListPage />
      </MemoryRouter>
    );

    expect(await screen.findAllByText("چهارروزه حجم متوسط")).not.toHaveLength(0);
    await user.selectOptions(screen.getByLabelText("نوع"), "supplement");

    await waitFor(() => {
      expect(screen.getAllByText("برنامه مکمل عمومی")).not.toHaveLength(0);
      expect(screen.queryByText("برنامه تغذیه ای هفته تا ۴")).not.toBeInTheDocument();
    });
  });

  it("deletes a program with confirmation", async () => {
    window.localStorage.clear();
    render(
      <MemoryRouter>
        <ProgramsListPage />
      </MemoryRouter>
    );

    expect(await screen.findAllByText("چهارروزه حجم متوسط")).not.toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "حذف" })[0]);
    expect(await screen.findByRole("heading", { name: "حذف برنامه" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حذف برنامه" }));
    expect(await screen.findByText("برنامه حذف شد.")).toBeInTheDocument();
  }, 20_000);
});
