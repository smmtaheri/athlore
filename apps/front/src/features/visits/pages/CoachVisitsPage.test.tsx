import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { studentVisitFixtures } from "../../students/fixtures/studentVisits";
import { studentVisitsRepository } from "../../students/services/studentVisitsRepository";
import { coachVisitsRepository } from "../services/coachVisitsRepository";
import { CoachVisitsPage } from "./CoachVisitsPage";

vi.mock("../services/coachVisitsRepository", () => ({
  COACH_VISITS_PAGE_SIZE: 20,
  coachVisitsRepository: { listPage: vi.fn() }
}));
vi.mock("../../students/services/studentVisitsRepository", () => ({
  studentVisitsRepository: { getById: vi.fn() }
}));

describe("Coach visit history failures", () => {
  beforeEach(() => vi.resetAllMocks());

  it("retains consecutive filter changes and resets pagination", async () => {
    vi.mocked(coachVisitsRepository.listPage).mockResolvedValue({ count: 0, items: [] });
    render(
      <MemoryRouter initialEntries={["/visits?status=draft&page=2"]}>
        <CoachVisitsPage />
      </MemoryRouter>
    );
    await screen.findByText("ویزیتی پیدا نشد");
    act(() => {
      fireEvent.change(screen.getByLabelText("وضعیت ویزیت"), { target: { value: "all" } });
      fireEvent.change(screen.getByLabelText("مرتب‌سازی"), { target: { value: "-created_at" } });
    });
    await waitFor(() =>
      expect(coachVisitsRepository.listPage).toHaveBeenLastCalledWith(
        { search: "", status: "all", ordering: "-created_at" },
        1
      )
    );
  });

  it("shows list errors and loads the same filters when retried", async () => {
    const user = userEvent.setup();
    const list = vi.mocked(coachVisitsRepository.listPage);
    list.mockRejectedValueOnce(new Error("Network unavailable"));
    list.mockResolvedValueOnce({
      count: 1,
      items: [{ ...studentVisitFixtures[0], studentName: "شاگرد بازیابی‌شده" }]
    });
    render(
      <MemoryRouter initialEntries={["/visits?status=finalized&page=2"]}>
        <CoachVisitsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText("دریافت ویزیت‌ها انجام نشد")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect((await screen.findAllByText("شاگرد بازیابی‌شده")).length).toBeGreaterThan(0);
    expect(list).toHaveBeenLastCalledWith(
      { search: "", status: "finalized", ordering: "-visit_date" },
      2
    );
  });

  it("shows a failed exact-visit lookup and can close it without leaving the history", async () => {
    const user = userEvent.setup();
    vi.mocked(coachVisitsRepository.listPage).mockResolvedValue({ count: 0, items: [] });
    vi.mocked(studentVisitsRepository.getById).mockRejectedValue(new Error("Not found"));
    render(
      <MemoryRouter initialEntries={["/visits?student=student-1&visit=visit-2"]}>
        <CoachVisitsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText("جزئیات ویزیت دریافت نشد")).toBeInTheDocument();
    expect(studentVisitsRepository.getById).toHaveBeenCalledWith("student-1", "visit-2");
    await user.click(screen.getByRole("button", { name: "بستن" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "همه ویزیت‌ها" })).toBeInTheDocument();
    expect(coachVisitsRepository.listPage).toHaveBeenCalledTimes(1);
  });
});
