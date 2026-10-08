import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplementCatalogSection } from "./SupplementCatalogSection";
import { SupplementSelectionFields } from "./SupplementSelectionFields";
import {
  emptySupplementSelection,
  supplementCatalogRepository as repository,
  type SupplementEntry
} from "../services/supplementCatalogRepository";
import { useState } from "react";

vi.mock("../services/supplementCatalogRepository", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/supplementCatalogRepository")>();
  return {
    ...original,
    supplementCatalogRepository: {
      list: vi.fn(),
      options: vi.fn(),
      save: vi.fn(),
      archive: vi.fn(),
      saveGoal: vi.fn(),
      removeGoal: vi.fn(),
      propose: vi.fn()
    }
  };
});
const options = {
  goals: [{ id: "goal-1", name: "هدف تست" }],
  units: [{ key: "scoop", name: "اسکوپ" }],
  timings: [{ key: "after_workout", name: "بعد تمرین" }],
  days: [{ key: "all", name: "همه روزها" }]
};
const entry: SupplementEntry = {
  id: "entry-1",
  name: "QA Supplement",
  name_en: "",
  aliases: [],
  category: "QA",
  goal_ids: ["goal-1"],
  reason: "Reason",
  instructions: "",
  warnings: "",
  replacement_group: "",
  priority: 1,
  is_active: true,
  is_archived: false,
  reviewed: true,
  auto_eligible: true,
  doses: [{ amount: "1", unit: "scoop", timing: "after_workout", custom_time: "", days: "all" }]
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.options).mockResolvedValue(options);
  vi.mocked(repository.list).mockResolvedValue([entry]);
  vi.mocked(repository.save).mockImplementation(async (value) => ({
    ...value,
    id: value.id || "new"
  }));
  vi.mocked(repository.archive).mockResolvedValue(undefined);
  vi.mocked(repository.propose).mockResolvedValue({
    items: [entry],
    reason: "پیشنهاد تست",
    excluded: []
  });
});

describe("Supplement catalog", () => {
  it("creates a supplement with multiple consumption slots in a drawer", async () => {
    const user = userEvent.setup();
    render(<SupplementCatalogSection />);
    await screen.findByText("QA Supplement");
    await user.click(screen.getByRole("button", { name: "افزودن مکمل" }));
    const dialog = screen.getByRole("dialog", { name: "افزودن مکمل" });
    await user.type(within(dialog).getByLabelText("نام مکمل"), "New Supplement");
    await user.type(within(dialog).getByLabelText("نوع مکمل"), "Protein");
    await user.type(within(dialog).getByLabelText("مقدار نوبت 1"), "1");
    await user.click(within(dialog).getByRole("button", { name: "افزودن نوبت مصرف" }));
    await user.type(within(dialog).getByLabelText("مقدار نوبت 2"), "2");
    await user.click(within(dialog).getByRole("button", { name: "ذخیره مکمل" }));
    await waitFor(() =>
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Supplement",
          doses: [
            expect.objectContaining({ amount: "1" }),
            expect.objectContaining({ amount: "2" })
          ]
        })
      )
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits, deactivates and archives with confirmation", async () => {
    const user = userEvent.setup();
    render(<SupplementCatalogSection />);
    await user.click(await screen.findByRole("button", { name: "ویرایش QA Supplement" }));
    await user.clear(screen.getByLabelText("نام مکمل"));
    await user.type(screen.getByLabelText("نام مکمل"), "Updated");
    await user.click(screen.getByRole("button", { name: "ذخیره مکمل" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: entry.id, name: "Updated" })
    );
    await user.click(screen.getByRole("button", { name: "غیرفعال‌کردن" }));
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
    await user.click(screen.getByRole("button", { name: "آرشیو QA Supplement" }));
    expect(repository.archive).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "تأیید آرشیو" }));
    await waitFor(() => expect(repository.archive).toHaveBeenCalledWith(entry.id));
  });

  it("filters by search, goal and active status", async () => {
    const user = userEvent.setup();
    render(<SupplementCatalogSection />);
    await screen.findByText("QA Supplement");
    await user.selectOptions(screen.getByLabelText("فیلتر هدف مصرف"), "goal-1");
    expect(screen.getByText("QA Supplement")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("فیلتر وضعیت مکمل"), "false");
    expect(screen.queryByText("QA Supplement")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("فیلتر وضعیت مکمل"), "");
    await user.type(screen.getByLabelText("جست‌وجوی مکمل"), "unknown");
    expect(screen.queryByText("QA Supplement")).not.toBeInTheDocument();
  });
});

function SelectionHarness() {
  const [selection, setSelection] = useState(emptySupplementSelection);
  return (
    <SupplementSelectionFields
      studentId="student-1"
      selection={selection}
      onChange={setSelection}
    />
  );
}
describe("Supplement selection", () => {
  it("proposes by goal and resets approval after a dose edit", async () => {
    const user = userEvent.setup();
    render(<SelectionHarness />);
    await user.click(await screen.findByLabelText("هدف تست"));
    await user.click(screen.getByRole("button", { name: "پیشنهاد براساس هدف و اولویت" }));
    await screen.findByRole("heading", { name: "QA Supplement" });
    expect(repository.propose).toHaveBeenCalledWith("student-1", ["goal-1"], 2);
    const approval = screen.getByLabelText(
      "انتخاب‌ها، مقدارها و زمان مصرف این شاگرد را تأیید می‌کنم"
    );
    await user.click(approval);
    expect(approval).toBeChecked();
    await user.clear(screen.getByLabelText("مقدار نوبت 1"));
    await user.type(screen.getByLabelText("مقدار نوبت 1"), "3");
    expect(approval).not.toBeChecked();
    expect(entry.doses[0].amount).toBe("1");
  });

  it("adds manually and supports a second consumption slot", async () => {
    const user = userEvent.setup();
    render(<SelectionHarness />);
    await screen.findByLabelText("انتخاب دستی مکمل");
    await user.selectOptions(screen.getByLabelText("انتخاب دستی مکمل"), entry.id);
    await user.click(screen.getByRole("button", { name: "افزودن از بانک مکمل" }));
    await user.click(screen.getByRole("button", { name: "افزودن نوبت مصرف" }));
    expect(screen.getByLabelText("مقدار نوبت 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "حذف مکمل از انتخاب" }));
    expect(screen.queryByRole("heading", { name: "QA Supplement" })).not.toBeInTheDocument();
  });
});
