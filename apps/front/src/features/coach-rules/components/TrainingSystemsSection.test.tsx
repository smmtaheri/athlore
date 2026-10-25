import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TrainingSystem } from "../types/coachRules";
import type { TrainingSystemsRepository } from "../services/trainingSystemsRepository";
import { TrainingSystemsSection } from "./TrainingSystemsSection";

describe("TrainingSystemsSection", () => {
  it("keeps shared editing in the dedicated systems tab", async () => {
    const user = userEvent.setup();
    const system: TrainingSystem = {
      id: null,
      key: "superset",
      name: "سوپرست",
      description: "گروه تمرینی",
      execution_method: "پشت سر هم",
      allowed_levels: [],
      max_per_session: 0,
      parameters: {},
      enabled: true,
      source: "platform",
      base_technique_key: "superset",
      handler_key: "superset",
      handler_status: "implemented",
      recipe: { version: 1, target: "all", steps: [{ op: "rest", seconds: 90 }] }
    };
    const repository: TrainingSystemsRepository = {
      list: vi.fn(),
      listPage: vi.fn(async () => ({ results: [system], count: 1, next: null })),
      savePlatform: vi.fn(async () => system),
      save: vi.fn(),
      remove: vi.fn()
    };
    render(<TrainingSystemsSection repository={repository} />);
    await user.click(await screen.findByRole("button", { name: "ویرایش برای همه" }));
    expect(screen.getByText(/این تغییر برای همهٔ مربی‌ها/)).toBeInTheDocument();
    expect(screen.queryByLabelText("حداکثر اعمال در هر جلسه")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/نام سیستم/));
    await user.type(screen.getByLabelText(/نام سیستم/), "سوپرست مشترک");
    await user.click(screen.getByRole("button", { name: "ذخیره سیستم" }));
    await waitFor(() =>
      expect(repository.savePlatform).toHaveBeenCalledWith(
        "superset",
        expect.objectContaining({
          name: "سوپرست مشترک",
          recipe: expect.objectContaining({ version: 1 })
        })
      )
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
  });
  it("creates, edits, and deletes a coach-owned training system", async () => {
    const user = userEvent.setup();
    let systems: TrainingSystem[] = [];
    const repository: TrainingSystemsRepository = {
      list: vi.fn(async () => systems),
      savePlatform: vi.fn(),
      listPage: vi.fn(async () => ({ results: systems, count: systems.length, next: null })),
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
