import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StructuredCatalogSection } from "./StructuredCatalogSection";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("../../../shared/api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args)
}));

describe("StructuredCatalogSection", () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/exercise-taxonomy/") {
        return {
          equipment: [{ key: "dumbbell", name: "دمبل" }],
          levels: [{ key: "intermediate", name: "نیمه‌حرفه‌ای" }],
          muscles: [
            {
              id: "muscle-chest",
              key: "chest",
              name: "سینه",
              name_en: "Chest",
              is_active: true,
              sort_order: 1,
              regions: [
                {
                  id: "region-upper-chest",
                  key: "upper_chest",
                  name: "بالاسینه",
                  name_en: "Upper chest",
                  is_active: true,
                  sort_order: 1
                }
              ]
            },
            {
              id: "muscle-back",
              key: "back",
              name: "زیربغل",
              name_en: "Back",
              is_active: true,
              sort_order: 2,
              regions: [
                {
                  id: "region-lats",
                  key: "lats",
                  name: "لت",
                  name_en: "Lats",
                  is_active: true,
                  sort_order: 1
                }
              ]
            },
            {
              id: "muscle-biceps",
              key: "biceps",
              name: "جلو بازو",
              name_en: "Biceps",
              is_active: true,
              sort_order: 3,
              regions: [
                {
                  id: "region-biceps-long-head",
                  key: "long_head",
                  name: "سر بلند",
                  name_en: "Long head",
                  is_active: true,
                  sort_order: 1
                }
              ]
            },
            {
              id: "muscle-triceps",
              key: "triceps",
              name: "پشت بازو",
              name_en: "Triceps",
              is_active: true,
              sort_order: 4,
              regions: [
                {
                  id: "region-triceps-long-head",
                  key: "long_head",
                  name: "سر بلند",
                  name_en: "Long head",
                  is_active: true,
                  sort_order: 1
                }
              ]
            }
          ]
        };
      }
      if (path === "/exercises/") {
        return {
          results: [
            {
              id: "exercise-1",
              name: "پرس بالاسینه دمبل",
              name_en: "Incline dumbbell press",
              aliases: [],
              targets: [{ muscle_key: "chest", region_key: "upper_chest", role: "primary" }],
              levels: ["intermediate"],
              equipment_keys: ["dumbbell"],
              movement_pattern: "press",
              source_document: "manual",
              coach_notes: "",
              is_active: true,
              is_archived: false,
              is_preferred: true,
              is_prohibited: false,
              priority: 1
            }
          ]
        };
      }
      return [
        {
          id: null,
          key: "superset",
          name: "سوپرست",
          description: "دو حرکت سازگار پشت سر هم.",
          execution_method: "جفت کن و بعد استراحت بده.",
          allowed_levels: [],
          max_per_session: 0,
          parameters: {},
          enabled: false,
          source: "platform",
          base_technique_key: "superset",
          handler_key: "superset",
          handler_status: "implemented",
          parameter_schema: {
            pairing_mode: { default: "same_muscle_isolation" },
            max_pairs: { default: 1 },
            rest_after_pair_seconds: { default: 90 }
          }
        },
        {
          id: null,
          key: "custom_manual",
          name: "تکنیک اختصاصی",
          description: "",
          execution_method: "",
          allowed_levels: [],
          max_per_session: 0,
          parameters: {},
          enabled: true,
          source: "coach_private",
          base_technique_key: null,
          handler_status: "manual_only"
        }
      ];
    });
  });

  it("renders structured rows, handler status, and archive action", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    expect((await screen.findAllByText("پرس بالاسینه دمبل")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("فقط ذخیره اطلاعات").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "آرشیو" }));
    expect(apiRequestMock).toHaveBeenCalledWith("/exercises/exercise-1/", { method: "DELETE" });
  });

  it("opens the exercise editor with structured levels and existing values", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    expect((await screen.findAllByText("نیمه‌حرفه‌ای")).length).toBeGreaterThan(0);
    const exerciseRow = (await screen.findAllByText("پرس بالاسینه دمبل"))
      .map((element) => element.closest("tr"))
      .find(Boolean);
    expect(exerciseRow).not.toBeNull();
    await user.click(within(exerciseRow as HTMLElement).getByRole("button", { name: "ویرایش" }));

    expect(screen.getByRole("heading", { name: "ویرایش حرکت" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("پرس بالاسینه دمبل")).toBeInTheDocument();
  });

  it("shows the shared muscle and region taxonomy as distinct, parent-linked lists", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    await user.click(await screen.findByText("مدیریت عضله‌ها و ناحیه‌ها"));
    expect(await screen.findByText(/عضله، گروه اصلی هدف تمرین است/)).toBeInTheDocument();
    expect(screen.getByText("مشترک برای همه مربی‌ها")).toBeInTheDocument();
    expect(screen.getByText("ناحیه‌های عضله‌ی سینه")).toBeInTheDocument();
    expect(screen.getByText("ناحیه‌های عضله‌ی زیربغل")).toBeInTheDocument();
  });

  it("keeps same-named regions distinct by their parent muscle in filters", async () => {
    render(<StructuredCatalogSection />);

    const regionFilter = await screen.findByRole("combobox", { name: "فیلتر ناحیه" });
    expect(within(regionFilter).getByRole("option", { name: "جلو بازو — سر بلند" })).toHaveValue(
      "biceps:long_head"
    );
    expect(within(regionFilter).getByRole("option", { name: "پشت بازو — سر بلند" })).toHaveValue(
      "triceps:long_head"
    );
  });

  it("creates a shared muscle through the taxonomy manager", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/exercise-taxonomy/muscles/") {
        return {
          id: "muscle-forearm",
          key: "custom-muscle-forearm",
          name: "ساعد",
          name_en: "Forearm",
          is_active: true,
          sort_order: 0
        };
      }
      if (path === "/exercise-taxonomy/") {
        return {
          equipment: [],
          levels: [],
          muscles: [
            {
              id: "muscle-chest",
              key: "chest",
              name: "سینه",
              name_en: "Chest",
              is_active: true,
              sort_order: 1,
              regions: []
            }
          ]
        };
      }
      if (path === "/exercises/") return { results: [] };
      return [];
    });
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    await user.click(await screen.findByText("مدیریت عضله‌ها و ناحیه‌ها"));
    await user.click(screen.getByRole("button", { name: "افزودن عضله" }));
    const dialog = screen.getByRole("dialog", { name: "افزودن عضله به فهرست مشترک" });
    await user.type(within(dialog).getByLabelText(/نام فارسی/), "ساعد");
    await user.type(within(dialog).getByLabelText(/نام انگلیسی/), "Forearm");
    await user.click(within(dialog).getByRole("button", { name: "ذخیره عضله" }));

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/exercise-taxonomy/muscles/",
      expect.objectContaining({
        body: { name: "ساعد", name_en: "Forearm" },
        method: "POST"
      })
    );
    expect(await screen.findByText("عضله به فهرست مشترک اضافه شد.")).toBeInTheDocument();
  });

  it("lets the coach edit and remove a secondary muscle before saving the exercise", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    await user.click(await screen.findByRole("button", { name: "حرکت جدید" }));
    const dialog = screen.getByRole("dialog", { name: "حرکت جدید" });
    await user.selectOptions(within(dialog).getByLabelText("عضله فرعی"), "chest");
    await user.selectOptions(within(dialog).getByLabelText("ناحیه فرعی"), "upper_chest");
    await user.click(within(dialog).getByRole("button", { name: "افزودن عضله فرعی" }));
    expect(within(dialog).getByText("سینه — بالاسینه")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "ویرایش" }));
    await user.selectOptions(within(dialog).getByLabelText("عضله فرعی"), "back");
    await user.selectOptions(within(dialog).getByLabelText("ناحیه فرعی"), "lats");
    await user.click(within(dialog).getByRole("button", { name: "ذخیره ویرایش عضله فرعی" }));
    expect(within(dialog).getByText("زیربغل — لت")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "حذف" }));
    expect(within(dialog).queryByText("زیربغل — لت")).not.toBeInTheDocument();
  });

  it("shows executable technique logic and structured superset settings", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    expect((await screen.findAllByText(/جفت‌سازی:/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("قابل اجرا").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "تنظیم برای من" })[0]);

    expect(screen.getByText("روش جفت‌سازی")).toBeInTheDocument();
    expect(screen.getByText("استراحت بعد از جفت (ثانیه)")).toBeInTheDocument();
    expect(screen.getByText(/این handler در generator پیاده‌سازی شده است/)).toBeInTheDocument();
  });
});
