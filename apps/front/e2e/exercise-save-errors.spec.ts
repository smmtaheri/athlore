import { expect, test } from "@playwright/test";

test("catalog search and duplicate feedback include movements beyond the first 100", async ({
  page,
  request
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const phone = `09${suffix.slice(-9)}`;
  const password = "QA-Catalog-123!";
  const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8767/api/v1";
  const registered = await request.post(`${api}/auth/register/`, {
    data: {
      email: `pagination-${suffix}@example.com`,
      password,
      phone_number: phone,
      full_name: "Catalog Pagination QA"
    }
  });
  expect(registered.status()).toBe(201);
  const account = await registered.json();
  const headers = { Authorization: `Bearer ${account.tokens.access}` };
  for (let index = 0; index < 104; index += 1) {
    const created = await request.post(`${api}/exercises/`, {
      headers,
      data: {
        name: `QA catalog ${suffix} ${index}`,
        targets: [{ muscle_key: "chest", role: "primary" }],
        levels: ["beginner"],
        equipment_keys: ["cable"]
      }
    });
    expect(created.status()).toBe(201);
  }
  const lateName = `اسکوات تکی ${suffix}`;
  const created = await request.post(`${api}/exercises/`, {
    headers,
    data: {
      name: lateName,
      targets: [{ muscle_key: "quadriceps", role: "primary" }],
      levels: ["beginner"],
      equipment_keys: ["cable"]
    }
  });
  expect(created.status()).toBe(201);

  await page.goto("/login");
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const mobileMenu = page.getByRole("button", { name: "باز کردن منوی ناوبری" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page
    .getByRole("link", { name: "قوانین مربی", exact: true })
    .filter({ visible: true })
    .click();
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await page
      .getByRole("combobox", { name: "بخش های قوانین مربی در موبایل" })
      .selectOption("exercises");
  } else {
    await page.getByRole("tab", { name: "کاتالوگ حرکات", exact: true }).click();
  }
  const lateMovement = page.getByText(lateName, { exact: true }).filter({ visible: true });
  await expect(lateMovement).toBeVisible();
  const search = page.locator("#exercise-catalog-search");
  for (const query of ["چهار سر", "چهارسر", "چهار‌سر", "اسكوات تكي"]) {
    await search.fill(query);
    await expect(lateMovement).toBeVisible();
  }
  await search.fill("");
  await page.locator("#exercise-catalog-filter-muscle").selectOption("quadriceps");
  await expect(lateMovement).toBeVisible();
  await expect(
    page.getByText(new RegExp(`QA catalog ${suffix}`)).filter({ visible: true })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "حرکت جدید", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "حرکت جدید", exact: true });
  await drawer.getByRole("textbox").first().fill(lateName);
  await drawer.locator("#exercise-primary-muscle").selectOption("quadriceps");
  await drawer.getByLabel("مبتدی", { exact: true }).check();
  await drawer.getByRole("button", { name: "ذخیره حرکت", exact: true }).click();
  await expect(drawer.getByRole("alert")).toContainText("این حرکت تکراری است");
  await expect(drawer.getByRole("textbox").first()).toHaveValue(lateName);
  const remaining = await request.get(`${api}/exercises/?muscle=quadriceps`, { headers });
  expect((await remaining.json()).count).toBe(1);
});

test("exercise save explains failures, preserves the draft, and allows correction", async ({
  page,
  request
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const phone = `09${suffix.slice(-9)}`;
  const password = "QA-Exercise-123!";
  const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8767/api/v1";
  const registered = await request.post(`${api}/auth/register/`, {
    data: {
      email: `exercise-${suffix}@example.com`,
      password,
      phone_number: phone,
      full_name: "Exercise Error QA"
    }
  });
  expect(registered.status()).toBe(201);
  const account = await registered.json();
  const headers = { Authorization: `Bearer ${account.tokens.access}` };
  const existingName = `حرکت موجود ${suffix}`;
  const created = await request.post(`${api}/exercises/`, {
    headers,
    data: {
      name: existingName,
      targets: [{ muscle_key: "chest", region_key: null, role: "primary" }],
      levels: ["beginner", "intermediate"],
      equipment_keys: ["cable"]
    }
  });
  expect(created.status()).toBe(201);

  await page.goto("/login");
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const mobileMenu = page.getByRole("button", { name: "باز کردن منوی ناوبری" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page
    .getByRole("link", { name: "قوانین مربی", exact: true })
    .filter({ visible: true })
    .click();
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await page
      .getByRole("combobox", { name: "بخش های قوانین مربی در موبایل" })
      .selectOption("exercises");
  } else {
    await page.getByRole("tab", { name: "کاتالوگ حرکات", exact: true }).click();
  }
  await page.getByRole("button", { name: "حرکت جدید", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "حرکت جدید", exact: true });
  const nameInput = drawer.getByRole("textbox").first();
  const save = drawer.getByRole("button", { name: "ذخیره حرکت", exact: true });
  const error = drawer.getByRole("alert");

  await save.click();
  await expect(error).toContainText("نام فارسی و عضله اصلی");
  await nameInput.fill(existingName);
  await drawer.locator("#exercise-primary-muscle").selectOption("chest");
  await drawer.getByLabel("مبتدی", { exact: true }).check();
  await drawer.getByLabel("نیمه‌حرفه‌ای", { exact: true }).check();
  await drawer.getByLabel("کابل", { exact: true }).check();
  await save.click();
  await expect(error).toContainText("این حرکت تکراری است");
  await expect(error).toBeVisible();
  await expect(nameInput).toHaveValue(existingName);
  await expect(save).toBeEnabled();

  const newName = `حرکت جدید ${suffix}`;
  await nameInput.fill(newName);
  await page.route(
    "**/api/v1/exercises/",
    async (route) => {
      const payload = route.request().postDataJSON();
      await route.continue({ postData: JSON.stringify({ ...payload, levels: ["invalid-level"] }) });
    },
    { times: 1 }
  );
  await save.click();
  await expect(error).toContainText("سطح تمرینی انتخاب‌شده معتبر نیست");
  await expect(nameInput).toHaveValue(newName);

  const errorId = "0123456789abcdef0123456789abcdef";
  await page.route(
    "**/api/v1/exercises/",
    (route) =>
      route.fulfill({
        status: 500,
        json: {
          error: {
            code: "exercise_save_unknown",
            message:
              "خطای ناشناخته‌ای هنگام ذخیره حرکت رخ داد. برای بررسی لاگ با پشتیبانی تماس بگیرید.",
            details: { error_id: errorId }
          }
        }
      }),
    { times: 1 }
  );
  await save.click();
  await expect(error).toContainText(`کد پیگیری: ${errorId}`);
  await expect(error).toBeVisible();
  await expect(nameInput).toHaveValue(newName);
  expect(
    await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1);

  await page.route("**/api/v1/exercises/", (route) => route.abort("failed"), { times: 1 });
  await save.click();
  await expect(error).toContainText("اتصال اینترنت را بررسی کنید");
  await expect(nameInput).toHaveValue(newName);

  await save.click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("حرکت ذخیره شد");
  const listResponse = await request.get(`${api}/exercises/`, { headers });
  const catalog = await listResponse.json();
  expect(
    catalog.results.filter((exercise: { name: string }) => exercise.name === newName)
  ).toHaveLength(1);
  expect(
    catalog.results.filter((exercise: { name: string }) => exercise.name === existingName)
  ).toHaveLength(1);
  await page.getByRole("button", { name: "حرکت جدید", exact: true }).click();
  await expect(drawer.getByRole("alert")).not.toBeVisible();
  await expect(nameInput).toHaveValue("");
});
