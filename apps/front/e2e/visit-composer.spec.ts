import { expect, test } from "@playwright/test";

test("unified visit keeps one source for weight, optional unknowns and private history", async ({
  page,
  request,
  baseURL
}, testInfo) => {
  const api = process.env.E2E_API_BASE_URL!;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const phone = `09${suffix.slice(-9)}`;
  const password = "VisitComposer-QA-123!";
  const registered = await request.post(`${api}/auth/register/`, {
    data: {
      email: `visit-composer-${suffix}@example.com`,
      full_name: "Visit Composer QA",
      phone_number: phone,
      password
    }
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const account = await registered.json();
  const headers = { Authorization: `Bearer ${account.tokens.access}` };
  const created = await request.post(`${api}/students/`, {
    headers,
    data: {
      full_name: "شاگرد تست فرم یکپارچه",
      age: 28,
      gender: "male",
      height_cm: 180,
      weight_kg: 80,
      phone_number: `09${suffix.slice(-9).split("").reverse().join("")}`,
      goals: { primary_goal: "hypertrophy", weak_muscles: [] },
      training_background: { level: "intermediate" },
      training_conditions: {
        training_days_per_week: 3,
        session_duration_minutes: 60,
        environment: "gym"
      },
      equipment: { has_full_gym: true }
    }
  });
  expect(created.status(), await created.text()).toBe(201);
  const student = await created.json();
  const field = (
    key: string,
    label: string,
    semanticKey = "",
    type = "text",
    options: { value: string; label: string }[] = []
  ) => ({
    key,
    label,
    semantic_key: semanticKey,
    type,
    options,
    enabled: true,
    required: false,
    order: 0,
    coach_editable: true,
    student_visible: false,
    student_editable: false,
    student_visible_when_finalized: false,
    help_text: "",
    prefill_from: ""
  });
  const template = await request.post(`${api}/visit-form-templates/`, {
    headers,
    data: {
      name: "قالب تست ویزیت",
      key: "arman_visit_v1",
      is_default: true,
      is_active: true,
      sections: [
        {
          key: "general",
          label: "ارزیابی عمومی",
          order: 0,
          fields: [
            field("full_name", "نام تکراری"),
            field("weight_kg", "وزن داخل قالب", "", "number"),
            field("goal", "هدف اصلی دوره", "goal", "single_select", [
              { value: "hypertrophy", label: "حجم" }
            ]),
            field("training_level", "سطح", "training_level", "single_select", [
              { value: "intermediate", label: "متوسط" }
            ]),
            field("sessions_per_week", "تعداد جلسات", "sessions_per_week", "number"),
            field("training_environment", "محیط تمرین", "training_environment", "single_select", [
              { value: "gym", label: "باشگاه" }
            ]),
            field(
              "session_duration_minutes",
              "زمان جلسه",
              "session_duration_minutes",
              "single_select",
              [{ value: "60", label: "۶۰ دقیقه" }]
            ),
            field("injuries", "محدودیت فعال", "injuries", "multi_select", [
              { value: "none", label: "بدون آسیب فعال" }
            ]),
            field("weak_muscles", "عضلات ضعیف", "weak_muscles", "multi_select", [
              { value: "chest", label: "سینه" },
              { value: "back", label: "پشت" },
              { value: "none", label: "بدون ضعف مشخص" }
            ]),
            field("free_text_plan", "برنامه آزاد")
          ]
        },
        {
          key: "chest",
          label: "جزئیات سینه",
          order: 1,
          fields: [
            field("muscle_detail.chest.upper", "بالاسینه", "muscle_detail", "single_select", [
              { value: "weak", label: "ضعیف" }
            ])
          ]
        },
        {
          key: "back",
          label: "جزئیات پشت",
          order: 2,
          fields: [
            field("muscle_detail.back.width", "عرض پشت", "muscle_detail", "single_select", [
              { value: "weak", label: "ضعیف" }
            ])
          ]
        }
      ]
    }
  });
  expect(template.status(), await template.text()).toBe(201);

  const origin = new URL(baseURL!);
  origin.hostname = "localhost";
  await page.goto(new URL("/login", origin).href);
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  // Keep SPA navigation: localhost UI and the disposable 127.0.0.1 API are
  // different sites, so a full reload cannot reuse its SameSite refresh cookie.
  const navigate = async (path: string) =>
    page.evaluate((nextPath) => {
      history.pushState({}, "", nextPath);
      dispatchEvent(new PopStateEvent("popstate"));
    }, path);
  await navigate(`/students/${student.id}/visits/new`);
  await expect(page.getByRole("heading", { name: "۱. ارزیابی کلی", exact: true })).toBeVisible();
  await expect(page.getByLabel("وزن داخل قالب")).toHaveCount(0);
  await expect(page.getByLabel("نام تکراری")).toHaveCount(0);
  await expect(page.getByLabel("برنامه آزاد")).toHaveCount(0);
  await expect(page.getByLabel("تعداد جلسات", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("محیط تمرین", { exact: true })).toHaveValue("gym");
  await expect(page.getByLabel("زمان جلسه", { exact: true })).toHaveValue("60");
  const photos = page
    .locator("details")
    .filter({ has: page.getByText("عکس‌های ارزیابی (اختیاری)", { exact: true }) })
    .last();
  await expect(photos).not.toHaveAttribute("open");
  await expect(page.getByLabel("بالاسینه", { exact: true })).toHaveCount(0);
  await page.getByRole("heading", { name: "۳. ارزیابی بدن و نقاط ضعف", exact: true }).click();
  await page.getByRole("checkbox", { name: "سینه", exact: true }).check();
  await page.getByLabel("بالاسینه", { exact: true }).selectOption("weak");
  await expect(page.getByRole("checkbox", { name: "بدون ضعف مشخص", exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "سینه", exact: true }).uncheck();
  await expect(page.getByLabel("بالاسینه", { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "سینه", exact: true }).check();
  await page.getByLabel("بالاسینه", { exact: true }).selectOption("weak");
  await page.getByLabel(/^وزن جدید/).fill("78");
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/students/${student.id}/visits/`) &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "ثبت پیش‌نویس", exact: true }).click();
  const saved = await savedResponse;
  expect(saved.status(), await saved.text()).toBe(201);
  const visitId = (await saved.json()).id;
  await expect(page).toHaveURL(new RegExp(`/students/${student.id}/visits$`));
  const storedResponse = await request.get(`${api}/students/${student.id}/visits/${visitId}/`, {
    headers
  });
  expect(storedResponse.status()).toBe(200);
  const stored = await storedResponse.json();
  expect(stored.current_weight_kg).toBe("78.0");
  expect(stored.sleep_quality).toBeNull();
  expect(stored.stress_level).toBeNull();
  expect(stored.daily_energy_level).toBeNull();
  expect(Object.values(stored.adherence)).toEqual([null, null, null, null]);
  expect(stored.answers.sessions_per_week).toBe(3);
  expect(stored.answers["muscle_detail.chest.upper"]).toBe("weak");
  expect(stored.answers.weight_kg).toBeUndefined();

  const historical = await request.patch(`${api}/students/${student.id}/visits/${visitId}/`, {
    headers,
    data: {
      coach_assessment: "برداشت خصوصی قبلی",
      coach_notes: "یادداشت خصوصی قبلی",
      answers: { full_name: "نام ثبت‌شده قدیمی", weight_kg: 70, free_text_plan: "متن تاریخی دوره" }
    }
  });
  expect(historical.status()).toBe(200);
  await navigate(`/students/${student.id}/visits/${visitId}/edit`);
  await page.getByRole("heading", { name: "۱. ارزیابی کلی", exact: true }).click();
  await page.getByLabel(/^وزن جدید/).fill("77");
  await page.getByText("۶. بازخورد و یادداشت مربی", { exact: true }).click();
  await page.getByLabel("یادداشت خصوصی مربی", { exact: true }).fill("برداشت خصوصی جدید");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: testInfo.outputPath("unified-visit.png"), fullPage: true });
  await page.getByRole("button", { name: "ذخیره ویزیت", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/students/${student.id}/visits$`));
  const edited = await (
    await request.get(`${api}/students/${student.id}/visits/${visitId}/`, { headers })
  ).json();
  expect(edited.answers.weight_kg).toBe(70);
  expect(edited.answers.free_text_plan).toBe("متن تاریخی دوره");
  expect(edited.coach_assessment).toBe("برداشت خصوصی قبلی");
  expect(edited.coach_notes).toBe("یادداشت خصوصی قبلی");
  expect(edited.coach_private_notes).toBe("برداشت خصوصی جدید");

  await navigate(`/students/${student.id}/visits/new`);
  await page.getByRole("button", { name: "ثبت پیش‌نویس", exact: true }).click();
  const duplicate = page
    .getByRole("alert")
    .filter({ hasText: "برای این تاریخ قبلاً ویزیت ثبت شده است" });
  await expect(duplicate).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});
