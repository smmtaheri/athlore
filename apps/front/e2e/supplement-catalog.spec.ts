import { expect, test } from "@playwright/test";

test("coach supplement CRUD and consumption slots work without horizontal overflow", async ({
  page,
  request
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `supp-${suffix}@example.com`;
  const password = "QA-Supplement-123!";
  const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8767/api/v1";
  const registration = await request.post(`${api}/auth/register/`, {
    data: {
      email,
      password,
      full_name: "QA Supplement Coach",
      phone_number: `+989${suffix.slice(-9)}`
    }
  });
  expect(registration.status()).toBe(201);
  const registered = await registration.json();
  const headers = { Authorization: `Bearer ${registered.tokens.access}` };
  const goalResponse = await request.post(`${api}/supplement-catalog/goals/`, {
    headers,
    data: { name: "QA Goal" }
  });
  expect(goalResponse.status()).toBe(201);
  const studentResponse = await request.post(`${api}/students/`, {
    headers,
    data: {
      full_name: "QA Supplement Student",
      age: 25,
      gender: "male",
      height_cm: "180",
      weight_kg: "80",
      phone_number: `+989${(Number(suffix.slice(-9)) + 1).toString().padStart(9, "0")}`,
      training_background: { level: "intermediate" }
    }
  });
  expect(studentResponse.status()).toBe(201);
  const student = await studentResponse.json();
  const templateResponse = await request.post(`${api}/program-templates/`, {
    headers,
    data: {
      name: "QA Supplement Template",
      days_per_week: 4,
      level: "intermediate",
      split: [],
      is_active: true
    }
  });
  expect(templateResponse.status()).toBe(201);
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/coach-rules?section=supplementTemplates");
  await page.getByRole("button", { name: "افزودن مکمل", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "افزودن مکمل", exact: true });
  await drawer.getByLabel("نام مکمل", { exact: true }).fill("QA Catalog Supplement");
  await drawer.getByLabel("نوع مکمل", { exact: true }).fill("QA Category");
  await drawer.getByLabel("QA Goal", { exact: true }).check();
  await drawer.getByLabel("تعریف و مقدارها را بازبینی کرده‌ام", { exact: true }).check();
  await drawer.getByLabel("مجاز برای پیشنهاد خودکار", { exact: true }).check();
  await drawer.getByLabel("مقدار نوبت 1", { exact: true }).fill("1");
  await drawer.getByRole("button", { name: "افزودن نوبت مصرف" }).click();
  await drawer.getByLabel("مقدار نوبت 2", { exact: true }).fill("2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await drawer.getByRole("button", { name: "ذخیره مکمل" }).click();
  await expect(drawer).not.toBeVisible();
  await page.getByRole("button", { name: "ویرایش QA Catalog Supplement" }).click();
  await page.getByLabel("مقدار نوبت 2", { exact: true }).fill("3");
  await page.getByRole("button", { name: "ذخیره مکمل" }).click();
  await page.getByRole("button", { name: "ویرایش QA Catalog Supplement" }).click();
  await expect(page.getByLabel("مقدار نوبت 2", { exact: true })).toHaveValue("3.000");
  await page.getByRole("button", { name: "بستن ویرایشگر" }).click();
  await page.goto(`/programs/new?studentId=${student.id}`);
  await page.getByLabel("نوع برنامه", { exact: true }).selectOption("supplement");
  await page.getByLabel("QA Goal", { exact: true }).check();
  await page.getByRole("button", { name: "پیشنهاد براساس هدف و اولویت" }).click();
  await expect(
    page.getByRole("heading", { name: "QA Catalog Supplement", exact: true })
  ).toBeVisible();
  await page.getByLabel("محدودیت‌ها و وضعیت فردی شاگرد را بررسی کرده‌ام", { exact: true }).check();
  await page
    .getByLabel("انتخاب‌ها، مقدارها و زمان مصرف این شاگرد را تأیید می‌کنم", { exact: true })
    .check();
  const generation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/programs/generate/") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "تولید برنامه", exact: true }).click();
  const generatedResponse = await generation;
  expect(generatedResponse.status()).toBe(201);
  const generated = await generatedResponse.json();
  const detail = await request.get(`${api}/programs/${generated.program.id}/`, { headers });
  const content = await detail.json();
  expect(content.supplements.items).toHaveLength(2);
  expect(content.supplements.items[1].amount).toBe("3 اسکوپ");
  await expect(page.locator('input[value="QA Catalog Supplement"]').first()).toBeVisible();
  await page.getByRole("button", { name: "انتخاب از بانک مکمل", exact: true }).click();
  const selectionDrawer = page.getByRole("dialog", { name: "انتخاب مکمل برای شاگرد", exact: true });
  const entries = await request.get(`${api}/supplement-catalog/`, { headers });
  const entryId = (await entries.json()).results[0].id;
  await selectionDrawer.getByLabel("انتخاب دستی مکمل", { exact: true }).selectOption(entryId);
  await selectionDrawer.getByRole("button", { name: "افزودن از بانک مکمل" }).click();
  await selectionDrawer.getByLabel("مقدار نوبت 1", { exact: true }).fill("4");
  await selectionDrawer
    .getByLabel("محدودیت‌ها و وضعیت فردی شاگرد را بررسی کرده‌ام", { exact: true })
    .check();
  await selectionDrawer
    .getByLabel("انتخاب‌ها، مقدارها و زمان مصرف این شاگرد را تأیید می‌کنم", { exact: true })
    .check();
  await selectionDrawer
    .getByRole("button", { name: "افزودن انتخاب‌ها به برنامه", exact: true })
    .click();
  await expect(selectionDrawer).not.toBeVisible();
  const saveResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/programs/${generated.program.id}/versions/${content.current_draft.id}/`) &&
      response.request().method() === "PATCH"
  );
  await page
    .getByRole("button", { name: "ذخیره تغییرات", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const saved = await saveResponse;
  expect(saved.status()).toBe(200);
  const persistedResponse = await request.get(`${api}/programs/${generated.program.id}/`, {
    headers
  });
  const persisted = await persistedResponse.json();
  expect(persisted.supplements.items[0].amount).toBe("4 اسکوپ");
  const unchangedCatalog = await request.get(`${api}/supplement-catalog/${entryId}/`, { headers });
  expect((await unchangedCatalog.json()).doses[0].amount).toBe("1.000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await page.goto("/coach-rules?section=supplementTemplates");
  await page.getByRole("button", { name: "آرشیو QA Catalog Supplement" }).click();
  await page.getByRole("button", { name: "تأیید آرشیو" }).click();
  await expect(
    page.getByRole("button", { name: "ویرایش QA Catalog Supplement" })
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});
