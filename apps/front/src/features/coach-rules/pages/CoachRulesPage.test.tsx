import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { coachRulesFixture } from "../fixtures/coachRules";
import { createCoachRulesRepository } from "../services/coachRulesRepository";
import type { NutritionSupplementTemplatesRepository } from "../services/nutritionSupplementTemplatesRepository";
import { CoachRulesPage } from "./CoachRulesPage";

describe("CoachRulesPage", () => {
  it("loads Arman Vaezi fixtures and saves edited templates", async () => {
    const user = userEvent.setup();
    const storage = window.localStorage;
    storage.clear();
    const repository = createCoachRulesRepository(storage);

    render(
      <MemoryRouter initialEntries={["/coach-rules"]}>
        <CoachRulesPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findByDisplayValue("فول بادی مبتدی ۳ روزه")).toBeInTheDocument();
    const nameInput = screen.getByDisplayValue("فول بادی مبتدی ۳ روزه");
    await user.clear(nameInput);
    await user.type(nameInput, "فول بادی تست");
    await user.click(screen.getByRole("button", { name: "ذخیره قوانین" }));

    expect(await screen.findByText("قوانین مربی ذخیره شد.")).toBeInTheDocument();
    expect((await repository.get()).templates[0].name).toBe("فول بادی تست");
  });

  it("edits injury rules and exercise bank", async () => {
    const user = userEvent.setup();
    const repository = createCoachRulesRepository(window.localStorage);
    await repository.reset();

    render(
      <MemoryRouter initialEntries={["/coach-rules?section=injuries"]}>
        <CoachRulesPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findByDisplayValue("گردن درد")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "بانک حرکات" }));
    expect(await screen.findAllByText("بانک حرکات")).not.toHaveLength(0);
    expect(screen.getAllByDisplayValue(/پرس سینه هالتر/)).not.toHaveLength(0);
  });

  it("shows read-only empty state when no nutrition/supplement templates are returned", async () => {
    const user = userEvent.setup();
    const repository = createCoachRulesRepository(window.localStorage);
    await repository.reset();

    render(
      <MemoryRouter initialEntries={["/coach-rules?section=nutritionTemplates"]}>
        <CoachRulesPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findAllByText("برنامه غذایی مرجع")).not.toHaveLength(0);
    expect(screen.getByText("قالب غذایی‌ای برای نمایش نیست")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "مکمل های مرجع" }));
    expect(
      await screen.findByText(
        "مصرف مکمل باید با توجه به وضعیت فردی، سوابق پزشکی و نظر متخصص واجد صلاحیت بررسی شود."
      )
    ).toBeInTheDocument();
  });

  it("approves and activates a nutrition template needing coach review", async () => {
    const user = userEvent.setup();
    const repository = createCoachRulesRepository(window.localStorage);
    await repository.reset();
    const stored = await repository.get();
    repository.get = async () => ({
      ...stored,
      nutritionTemplates: [
        {
          goal: "افزایش حجم",
          id: "nutrition-1",
          isEligibleForAutoSelect: false,
          name: "برنامه غذایی حجمی",
          needsCoachReview: true,
          status: "draft"
        }
      ]
    });

    const approveNutritionTemplate = vi.fn(async (id: string) => ({
      goal: "افزایش حجم",
      id,
      isEligibleForAutoSelect: true,
      name: "برنامه غذایی حجمی",
      needsCoachReview: false,
      status: "active"
    }));
    const templatesRepository: NutritionSupplementTemplatesRepository = {
      approveNutritionTemplate,
      approveSupplementTemplate: vi.fn()
    };

    render(
      <MemoryRouter initialEntries={["/coach-rules?section=nutritionTemplates"]}>
        <CoachRulesPage repository={repository} templatesRepository={templatesRepository} />
      </MemoryRouter>
    );

    expect(await screen.findByText("برنامه غذایی حجمی")).toBeInTheDocument();
    expect(screen.getByText("نیاز به بازبینی مربی")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "تایید و فعال‌سازی" }));

    expect(approveNutritionTemplate).toHaveBeenCalledWith("nutrition-1");
    expect(await screen.findByText("«برنامه غذایی حجمی» تایید و فعال شد.")).toBeInTheDocument();
    expect(await screen.findByText("بازبینی شده")).toBeInTheDocument();
  });

  it("renders repository error state", async () => {
    render(
      <MemoryRouter initialEntries={["/coach-rules"]}>
        <CoachRulesPage
          repository={{
            get: async () => {
              throw new Error("failed");
            },
            reset: async () => coachRulesFixture,
            save: async () => coachRulesFixture
          }}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText("خطای دریافت قوانین")).toBeInTheDocument();
  });
});
