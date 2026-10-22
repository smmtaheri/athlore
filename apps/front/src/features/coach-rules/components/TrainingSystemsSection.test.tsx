import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TrainingSystem } from "../types/coachRules";
import type { TrainingSystemsRepository } from "../services/trainingSystemsRepository";
import { TrainingSystemsSection } from "./TrainingSystemsSection";

describe("TrainingSystemsSection", () => {
  it("creates, edits, and deletes a coach-owned training system", async () => {
    const user = userEvent.setup();
    let systems: TrainingSystem[] = [];
    const repository: TrainingSystemsRepository = {
      list: vi.fn(async () => systems),
      save: vi.fn(async (input, id?: string | null) => {
        const saved: TrainingSystem = {
          ...input,
          id: id ?? "coach-system-1",
          source: "coach_private",
          base_technique_key: null,
          handler_status: "implemented"
        };
        systems = [saved];
        return saved;
      }),
      remove: vi.fn(async (id: string) => {
        systems = systems.filter((system) => system.id !== id);
      })
    };

    render(<TrainingSystemsSection repository={repository} />);
    await screen.findByText("فهرست خالی است");
    await user.click(screen.getByRole("button", { name: "سیستم جدید" }));
    await user.type(screen.getByLabelText(/نام سیستم/), "استراحت-مکث");
    await user.type(screen.getByLabelText("توضیح کوتاه"), "مکث کوتاه میان بخش‌های ست");
    await user.type(screen.getByLabelText("روش اجرا / نکته برای شاگرد"), "۱۵ ثانیه مکث و ادامه");
    await user.click(screen.getByRole("button", { name: "افزودن مرحله" }));
    await user.type(screen.getByLabelText("عنوان دستور"), "مینی‌ست");
    await user.type(screen.getByLabelText("توضیح برای شاگرد"), "با فرم صحیح ادامه بده");
    await user.click(screen.getByRole("button", { name: "ذخیره سیستم" }));

    expect(await screen.findByText("استراحت-مکث")).toBeInTheDocument();
    expect(screen.getByText("قابل استفاده در تولید")).toBeInTheDocument();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "استراحت-مکث",
        execution_method: "۱۵ ثانیه مکث و ادامه",
        recipe: expect.objectContaining({
          version: 1,
          steps: [expect.objectContaining({ op: "instruction", title: "مینی‌ست" })]
        })
      }),
      null
    );

    await user.click(screen.getByRole("button", { name: "ویرایش" }));
    const method = screen.getByLabelText("روش اجرا / نکته برای شاگرد");
    await user.clear(method);
    await user.type(method, "۲۰ ثانیه مکث و ادامه");
    await user.click(screen.getByRole("button", { name: "ذخیره سیستم" }));
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2));
    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ execution_method: "۲۰ ثانیه مکث و ادامه" }),
      "coach-system-1"
    );

    await user.click(screen.getByRole("button", { name: "حذف" }));
    await user.click(screen.getByRole("button", { name: "تأیید حذف" }));
    await screen.findByText("فهرست خالی است");
    expect(repository.remove).toHaveBeenCalledWith("coach-system-1");
  });
});
