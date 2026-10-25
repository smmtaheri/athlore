import { normalizeIranMobile } from "../src/shared/phone/iranMobile";
import { expect, test } from "@playwright/test";

test("recent visits expand and open the paginated history with exact visit details", async ({
  page,
  request
}, testInfo) => {
  const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8767/api/v1";
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const phone = `09${suffix.slice(-9)}`;
  const password = "VisitHistory-QA-123!";
  const registration = await request.post(`${api}/auth/register/`, {
    data: {
      email: `visits-${suffix}@example.com`,
      phone_number: phone,
      password,
      full_name: "Visit History QA"
    }
  });
  expect(registration.status()).toBe(201);
  const account = await registration.json();
  const headers = { Authorization: `Bearer ${account.tokens.access}` };
  const studentResponse = await request.post(`${api}/students/`, {
    headers,
    data: {
      full_name: "شاگرد تست تاریخچه ویزیت",
      age: 25,
      gender: "male",
      height_cm: 175,
      weight_kg: 75,
      phone_number: `09${suffix.slice(-9).split("").reverse().join("")}`,
      status: "active"
    }
  });
  expect(studentResponse.status(), await studentResponse.text()).toBe(201);
  const student = await studentResponse.json();
  const visits: { id: string }[] = [];
  for (let index = 0; index < 23; index += 1) {
    const response = await request.post(`${api}/students/${student.id}/visits/`, {
      headers,
      data: {
        visit_date: `2026-09-${String(index + 1).padStart(2, "0")}`,
        current_weight_kg: 75,
        previous_weight_kg: 75,
        daily_energy_level: "good",
        sleep_quality: "good",
        stress_level: "medium",
        skip_form_template: true,
        next_cycle_goal: `هدف ویزیت ${index + 1}`
      }
    });
    expect(response.status(), await response.text()).toBe(201);
    const visit = await response.json();
    visits.push(visit);
    if (index < 22) {
      const finalized = await request.post(
        `${api}/students/${student.id}/visits/${visit.id}/finalize/`,
        { headers }
      );
      expect(finalized.status()).toBe(200);
    }
  }
  await page.goto("/login");
  await page.locator("#login-phone").fill(normalizeIranMobile(phone).slice(3));
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const recent = page.getByRole("region", { name: "آخرین ویزیت‌ها" });
  await expect(recent.getByRole("link", { name: /مشاهده ویزیت/ })).toHaveCount(5);
  await recent.getByRole("button", { name: "نمایش 10 ویزیت آخر" }).click();
  await expect(recent.getByRole("link", { name: /مشاهده ویزیت/ })).toHaveCount(10);
  await expect(recent.getByText("هدف: هدف ویزیت 13", { exact: true })).toBeVisible();
  await expect(recent.getByText("هدف: هدف ویزیت 12", { exact: true })).toHaveCount(0);
  await recent.getByRole("link", { name: /هدف ویزیت 22 / }).click();
  await expect(page).toHaveURL(
    new RegExp(`/visits\\?student=${student.id}&visit=${visits[21].id}`)
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "جزئیات ویزیت", exact: true })).toBeVisible();
  await dialog.getByText("پاسخ‌ها و یادداشت‌های ویزیت", { exact: true }).click();
  await expect(dialog.getByText("هدف ویزیت 22", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("visit-details.png") });
  await dialog.getByRole("button", { name: "بستن", exact: true }).click();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "مشاهده همه ویزیت‌ها", exact: true }).click();
  await expect(page).toHaveURL(/\/visits\?/);
  const visibleActions = page
    .getByRole("button", { name: "مشاهده ویزیت", exact: true })
    .filter({ visible: true });
  await expect(visibleActions).toHaveCount(20);
  await page.getByRole("button", { name: "بعدی", exact: true }).click();
  await expect(visibleActions).toHaveCount(3);
  await page.getByLabel("وضعیت ویزیت", { exact: true }).selectOption("draft");
  await expect(visibleActions).toHaveCount(1);
  await page.getByLabel("جستجوی شاگرد", { exact: true }).fill("نام ناموجود");
  await expect(page.getByText("ویزیتی پیدا نشد", { exact: true })).toBeVisible();
  await page.getByLabel("جستجوی شاگرد", { exact: true }).fill("");
  await page.getByLabel("وضعیت ویزیت", { exact: true }).selectOption("all");
  await page.getByLabel("مرتب‌سازی", { exact: true }).selectOption("-created_at");
  await expect(visibleActions).toHaveCount(20);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("all-visits.png") });
});
