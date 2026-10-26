import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/client";
import { ExerciseNamePicker } from "./ExerciseNamePicker";

vi.mock("../../../shared/api/client", () => ({ apiRequest: vi.fn() }));

describe("ExerciseNamePicker", () => {
  it("selects catalog exercises and supports removing a selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(apiRequest).mockResolvedValueOnce({
      count: 1,
      results: [{ id: "exercise-1", is_active: true, is_archived: false, name: "پرس سینه هالتر" }]
    });

    const { unmount } = render(
      <ExerciseNamePicker label="حرکات ممنوع" onChange={onChange} value={[]} />
    );
    await user.click(screen.getByRole("button", { name: "انتخاب از کاتالوگ (0)" }));
    const option = await screen.findByRole("checkbox", { name: "پرس سینه هالتر" });
    await user.click(option);
    expect(onChange).toHaveBeenLastCalledWith(["پرس سینه هالتر"]);
    unmount();

    render(
      <ExerciseNamePicker label="حرکات ممنوع" onChange={onChange} value={["پرس سینه هالتر"]} />
    );
    await user.click(screen.getByRole("button", { name: "حذف پرس سینه هالتر" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("surfaces catalog load failures and provides a retry action", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ count: 0, results: [] });

    render(<ExerciseNamePicker label="حرکات ممنوع" onChange={vi.fn()} value={[]} />);
    await user.click(screen.getByRole("button", { name: "انتخاب از کاتالوگ (0)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("دریافت کاتالوگ حرکات انجام نشد");
    await user.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByText("حرکتی با این جست‌وجو پیدا نشد")).toBeInTheDocument();
  });
});
