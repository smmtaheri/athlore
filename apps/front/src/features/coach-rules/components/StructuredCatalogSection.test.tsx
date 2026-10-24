import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/errors";
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
              targets: [
                { muscle_key: "chest", region_key: "upper_chest", role: "primary" },
                { muscle_key: "triceps", region_key: "long_head", role: "secondary" }
              ],
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
          recipe: {
            version: 1,
            target: "all",
            grouping: {
              size: 2,
              mode: "same_muscle_isolation",
              max_groups_per_session: 1,
              rest_between_seconds: 0,
              rest_after_seconds: 90
            },
            steps: [{ op: "instruction", title: "اجرا", text: "جفت را اجرا کن." }]
          },
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

  it("loads every page and searches late-page movements by muscle and Persian spelling", async () => {
    const user = userEvent.setup();
    const baseImplementation = apiRequestMock.getMockImplementation()!;
    const taxonomy = await baseImplementation("/exercise-taxonomy/");
    const firstPage = await baseImplementation("/exercises/");
    const template = firstPage.results[0];
    const exercises = Array.from({ length: 205 }, (_, index) => ({
      ...template,
      id: `exercise-${index + 1}`,
      name: `حرکت ${index + 1}`,
      aliases: index === 204 ? ["اسکوات تکی"] : [],
      targets:
        index >= 200
          ? [{ muscle_key: "quadriceps", region_key: null, role: "primary" }]
          : template.targets
    }));
    taxonomy.muscles.push({
      id: "muscle-quadriceps",
      key: "quadriceps",
      name: "چهارسر ران",
      name_en: "Quadriceps",
      is_active: true,
      sort_order: 5,
      regions: []
    });
    apiRequestMock.mockImplementation(
      async (path: string, options?: { query?: { offset?: number } }) => {
        if (path === "/exercise-taxonomy/") return taxonomy;
        if (path === "/exercises/") {
          const offset = options?.query?.offset || 0;
          return {
            count: exercises.length,
            next: offset < 200 ? `/api/v1/exercises/?limit=100&offset=${offset + 100}` : null,
            results: exercises.slice(offset, offset + 100)
          };
        }
        return baseImplementation(path, options);
      }
    );
    render(<StructuredCatalogSection />);

    const table = await screen.findByRole("table", { name: "کاتالوگ حرکات" });
    expect(within(table).getByText("حرکت 205")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(206);
    expect(
      apiRequestMock.mock.calls
        .filter(([path]) => path === "/exercises/")
        .map(([, options]) => options.query.offset)
    ).toEqual([0, 100, 200]);

    const search = screen.getByRole("textbox", { name: "جست‌وجو" });
    for (const query of ["چهار سر", "چهارسر", "چهار‌سر", "اسكوات تكي"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(within(table).getByText("حرکت 205")).toBeInTheDocument();
      expect(screen.queryByText("حرکت 1", { exact: true })).not.toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: "" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "فیلتر عضله" }), "quadriceps");
    expect(
      within(screen.getByRole("table", { name: "کاتالوگ حرکات" })).getAllByRole("row")
    ).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: /^حرکت جدید$/ }));
    const drawer = screen.getByRole("dialog", { name: /^حرکت جدید$/ });
    await user.type(within(drawer).getAllByRole("textbox")[0], "حركت ‌205");
    await user.selectOptions(
      within(drawer).getByRole("combobox", { name: /^عضله اصلی/ }),
      "quadriceps"
    );
    await user.click(within(drawer).getByRole("button", { name: /^ذخیره حرکت$/ }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("این حرکت تکراری است");
    expect(apiRequestMock.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("reports a later-page failure instead of displaying an incomplete catalog", async () => {
    const baseImplementation = apiRequestMock.getMockImplementation()!;
    apiRequestMock.mockImplementation(
      async (path: string, options?: { query?: { offset?: number } }) => {
        if (path === "/exercises/") {
          if (options?.query?.offset) throw new Error("Catalog page unavailable");
          const dto = await baseImplementation(path);
          return { ...dto, next: "/api/v1/exercises/?offset=1" };
        }
        return baseImplementation(path, options);
      }
    );
    render(<StructuredCatalogSection />);

    expect(await screen.findByText("دریافت کاتالوگ انجام نشد.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "کاتالوگ حرکات" })).not.toBeInTheDocument();
    expect(screen.queryByText("لیست خالی است")).not.toBeInTheDocument();
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

  it("shows standard equipment when creating an exercise and preserves legacy equipment when editing", async () => {
    const user = userEvent.setup();
    const baseImplementation = apiRequestMock.getMockImplementation()!;
    apiRequestMock.mockImplementation(async (path: string, options?: unknown) => {
      const result = await baseImplementation(path, options);
      if (path === "/exercise-taxonomy/") {
        return {
          ...result,
          equipment: [
            { key: "bodyweight", name: "وزن بدن" },
            { key: "dumbbell", name: "دمبل" },
            { key: "barbell", name: "هالتر" },
            { key: "cable", name: "کابل" },
            { key: "machine", name: "دستگاه" },
            { key: "smith_machine", name: "اسمیت" },
            { key: "kettlebell", name: "کتل بل" },
            { key: "resistance_band", name: "کش" },
            { key: "legacy-pull-up", name: "بارفیکس" },
            { key: "legacy-dip-bench", name: "میز دیپ" }
          ]
        };
      }
      if (path === "/exercises/") {
        return {
          ...result,
          results: result.results.map((exercise: { equipment_keys: string[] }) => ({
            ...exercise,
            equipment_keys: ["legacy-pull-up"]
          }))
        };
      }
      return result;
    });
    render(<StructuredCatalogSection />);

    await user.click(await screen.findByRole("button", { name: /^حرکت جدید$/ }));
    const newExerciseDrawer = screen.getByRole("dialog", { name: /^حرکت جدید$/ });
    for (const label of ["وزن بدن", "دمبل", "هالتر", "کابل", "دستگاه", "اسمیت", "کتل بل", "کش"]) {
      expect(within(newExerciseDrawer).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(newExerciseDrawer).queryByLabelText("بارفیکس")).not.toBeInTheDocument();
    expect(within(newExerciseDrawer).queryByLabelText("میز دیپ")).not.toBeInTheDocument();
    await user.click(within(newExerciseDrawer).getByRole("button", { name: "انصراف" }));

    const exerciseRow = (await screen.findAllByText("پرس بالاسینه دمبل"))
      .map((element) => element.closest("tr"))
      .find(Boolean);
    await user.click(within(exerciseRow as HTMLElement).getByRole("button", { name: "ویرایش" }));
    const editDrawer = screen.getByRole("dialog", { name: "ویرایش حرکت" });
    expect(within(editDrawer).getByLabelText("بارفیکس")).toBeChecked();
  });

  it("shows a clear success message after saving a movement", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    const exerciseRow = (await screen.findAllByText("پرس بالاسینه دمبل"))
      .map((element) => element.closest("tr"))
      .find(Boolean);
    expect(exerciseRow).not.toBeNull();
    await user.click(within(exerciseRow as HTMLElement).getByRole("button", { name: "ویرایش" }));
    await user.click(screen.getByRole("button", { name: "ذخیره حرکت" }));

    expect(await screen.findByRole("status")).toHaveTextContent("حرکت ذخیره شد.");
  });

  it("saves the three public lesson sections independently and preserves private notes", async () => {
    apiRequestMock.mockClear();
    render(<StructuredCatalogSection />);
    const row = (await screen.findAllByText("پرس بالاسینه دمبل"))
      .map((element) => element.closest("tr"))
      .find(Boolean);
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "ویرایش" }));
    fireEvent.change(screen.getByRole("textbox", { name: "اجرای درست" }), {
      target: { value: "آماده‌سازی\nاجرای کنترل‌شده" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "نکات مهم" }), {
      target: { value: "تنفس منظم" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "اشتباهات رایج" }), {
      target: { value: "حرکت شتاب‌زده" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "توضیح مربی" }), {
      target: { value: "یادداشت خصوصی" }
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره حرکت" }));
    await screen.findByRole("status");
    const saved = apiRequestMock.mock.calls.find(
      ([path, options]) => path === "/exercises/exercise-1/" && options?.method === "PATCH"
    );
    expect(saved?.[1].body.execution_guide).toEqual({
      execution: "آماده‌سازی\nاجرای کنترل‌شده",
      tips: "تنفس منظم",
      mistakes: "حرکت شتاب‌زده"
    });
    expect(saved?.[1].body.coach_notes).toBe("یادداشت خصوصی");
  });

  it("shows library education in the editor without saving untouched defaults as overrides", async () => {
    const base = apiRequestMock.getMockImplementation()!;
    apiRequestMock.mockImplementation(async (path: string, options?: unknown) => {
      const response = await base(path, options);
      if (path === "/exercises/")
        response.results[0].media = {
          education: {
            steps: [{ title: "آماده‌سازی", text: "راهنمای اولیه", at_seconds: 5 }],
            tips: ["نکتهٔ اولیه"],
            mistakes: []
          }
        };
      return response;
    });
    apiRequestMock.mockClear();
    render(<StructuredCatalogSection />);
    const row = (await screen.findAllByText("پرس بالاسینه دمبل"))
      .map((element) => element.closest("tr"))
      .find(Boolean);
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "ویرایش" }));
    expect(screen.getByRole("textbox", { name: "اجرای درست" })).toHaveValue(
      "آماده‌سازی: راهنمای اولیه"
    );
    expect(screen.getByRole("textbox", { name: "نکات مهم" })).toHaveValue("نکتهٔ اولیه");
    fireEvent.change(screen.getByRole("textbox", { name: "اجرای درست" }), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره حرکت" }));
    await screen.findByRole("status");
    const saved = apiRequestMock.mock.calls.find(
      ([path, options]) => path === "/exercises/exercise-1/" && options?.method === "PATCH"
    );
    expect(saved?.[1].body.execution_guide).toEqual({ execution: "" });
    expect(saved?.[1].body.default_guide).toBeUndefined();
  });

  it.each([
    ["exercise_duplicate", "حرکتی با این نام برای این عضله قبلاً ثبت شده است."],
    ["exercise_validation_error", "تجهیزات انتخاب‌شده نامعتبر است؛ دوباره انتخاب کنید."],
    ["exercise_save_unknown", "خطای ناشناخته‌ای رخ داد. کد پیگیری را برای بررسی لاگ بدهید."]
  ])("keeps the editor and draft open after %s", async (code, message) => {
    const user = userEvent.setup();
    const baseImplementation = apiRequestMock.getMockImplementation()!;
    apiRequestMock.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") {
        throw new ApiError({
          code,
          message,
          status: code === "exercise_save_unknown" ? 500 : 400,
          details:
            code === "exercise_save_unknown" ? { error_id: "0123456789abcdef0123456789abcdef" } : {}
        });
      }
      return baseImplementation(path, options);
    });
    render(<StructuredCatalogSection />);
    const exerciseRow = (await screen.findAllByText("پرس بالاسینه دمبل"))
      .map((element) => element.closest("tr"))
      .find(Boolean);
    await user.click(within(exerciseRow as HTMLElement).getByRole("button", { name: "ویرایش" }));
    const editedName = "پرس بالاسینه دمبل ویرایش‌شده";
    const nameInput = screen.getByDisplayValue("پرس بالاسینه دمبل");
    await user.clear(nameInput);
    await user.type(nameInput, editedName);
    await user.click(screen.getByRole("button", { name: "ذخیره حرکت" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "ویرایش حرکت" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(editedName)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ذخیره حرکت" })).toBeEnabled();
    if (code === "exercise_save_unknown") {
      expect(screen.getByRole("alert")).toHaveTextContent("0123456789abcdef0123456789abcdef");
    }

    apiRequestMock.mockImplementation(baseImplementation);
    await user.click(screen.getByRole("button", { name: "ذخیره حرکت" }));
    expect(await screen.findByRole("status")).toHaveTextContent("حرکت ذخیره شد.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenLastCalledWith("/exercises/exercise-1/", {
      method: "PATCH",
      body: expect.objectContaining({ name: editedName })
    });
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

  it("limits regions to the selected muscle and clears the region when the muscle changes", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    const muscleFilter = await screen.findByRole("combobox", { name: "فیلتر عضله" });
    const regionFilter = screen.getByRole("combobox", { name: "فیلتر ناحیه" });
    await user.selectOptions(regionFilter, "biceps:long_head");
    await user.selectOptions(muscleFilter, "chest");

    expect(regionFilter).toHaveValue("");
    expect(
      within(regionFilter).getByRole("option", { name: "سینه — بالاسینه" })
    ).toBeInTheDocument();
    expect(
      within(regionFilter).queryByRole("option", { name: "جلو بازو — سر بلند" })
    ).not.toBeInTheDocument();
    expect(
      within(regionFilter).queryByRole("option", { name: "زیربغل — لت" })
    ).not.toBeInTheDocument();
    expect((await screen.findAllByText("پرس بالاسینه دمبل")).length).toBeGreaterThan(0);

    await user.selectOptions(regionFilter, "chest:upper_chest");
    await user.selectOptions(muscleFilter, "back");
    expect(regionFilter).toHaveValue("");
    expect(within(regionFilter).getByRole("option", { name: "زیربغل — لت" })).toBeInTheDocument();
    expect(
      within(regionFilter).queryByRole("option", { name: "سینه — بالاسینه" })
    ).not.toBeInTheDocument();

    await user.selectOptions(regionFilter, "back:lats");
    await user.selectOptions(muscleFilter, "");
    expect(regionFilter).toHaveValue("");
    expect(
      within(regionFilter).getByRole("option", { name: "سینه — بالاسینه" })
    ).toBeInTheDocument();
    expect(
      within(regionFilter).getByRole("option", { name: "جلو بازو — سر بلند" })
    ).toBeInTheDocument();
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

  it("hides secondary-target editing while preserving saved targets when the exercise is edited", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    const exerciseRow = (await screen.findAllByText("پرس بالاسینه دمبل"))
      .map((element) => element.closest("tr"))
      .find(Boolean);
    expect(exerciseRow).not.toBeNull();
    await user.click(within(exerciseRow as HTMLElement).getByRole("button", { name: "ویرایش" }));

    const dialog = screen.getByRole("dialog", { name: "ویرایش حرکت" });
    expect(within(dialog).queryByLabelText("عضله فرعی")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("ناحیه فرعی")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "افزودن عضله فرعی" })
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "ذخیره حرکت" }));

    const patchCall = apiRequestMock.mock.calls.find(
      ([path, options]) => path === "/exercises/exercise-1/" && options?.method === "PATCH"
    );
    expect(patchCall?.[1]).toMatchObject({
      body: {
        targets: [
          { muscle_key: "chest", region_key: "upper_chest", role: "primary" },
          { muscle_key: "triceps", region_key: "long_head", role: "secondary" }
        ]
      },
      method: "PATCH"
    });
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

  it("allows editing a public training system for every coach separately from personal setup", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    await user.click((await screen.findAllByRole("button", { name: "ویرایش برای همه" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "ویرایش سیستم برای همهٔ مربی‌ها" });
    expect(
      within(dialog).getByText(/برای همهٔ مربی‌ها و برنامه‌های بعدی مشترک است/)
    ).toBeInTheDocument();
    const nameField = within(dialog).getAllByRole("textbox")[0];
    await user.clear(nameField);
    await user.type(nameField, "سوپرست مشترک");
    await user.click(within(dialog).getByRole("button", { name: "ذخیره برای همهٔ مربی‌ها" }));

    const patchCall = apiRequestMock.mock.calls.find(
      ([path, options]) =>
        path === "/training-techniques/platform/superset/" && options?.method === "PATCH"
    );
    expect(patchCall?.[1]).toMatchObject({
      body: {
        name: "سوپرست مشترک",
        recipe: expect.objectContaining({ version: 1, target: "all" })
      },
      method: "PATCH"
    });
    expect(
      await screen.findByText("تعریف مشترک سیستم برای همهٔ مربی‌ها ذخیره شد.")
    ).toBeInTheDocument();
  });
});
