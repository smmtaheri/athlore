import { expect, test } from "@playwright/test";

test("coach supplement CRUD and confirmed consumption snapshots work without overflow", async ({
  page,
  request
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const phone = `+989${suffix.slice(-9)}`;
  const password = "QA-Supplement-123!";
  const api = process.env.E2E_API_BASE_URL!;
  const registration = await request.post(`${api}/auth/register/`, {
    data: {
      email: `supp-${suffix}@example.com`,
      phone_number: phone,
      password,
      full_name: "QA Supplement Coach"
    }
  });
  expect(registration.status()).toBe(201);
  const headers = { Authorization: `Bearer ${(await registration.json()).tokens.access}` };
  const goalResponse = await request.post(`${api}/supplement-catalog/goals/`, {
    headers,
    data: { name: "QA Goal" }
  });
  expect(goalResponse.status()).toBe(201);
  const goal = await goalResponse.json();
  const studentResponse = await request.post(`${api}/students/`, {
    headers,
    data: {
      full_name: "QA Supplement Student",
      age: 25,
      gender: "male",
      height_cm: 180,
      weight_kg: 80,
      phone_number: `+989${((Number(suffix.slice(-9)) + 1) % 1e9).toString().padStart(9, "0")}`,
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
  const template = await templateResponse.json();
  await page.goto("/login");
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/coach-rules?section=nutritionTemplates");
  await page.getByRole("button", { name: "افزودن مکمل", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "افزودن مکمل", exact: true });
  await drawer.getByLabel("نام مکمل", { exact: true }).fill("QA Catalog Supplement");
  await drawer.getByLabel("نوع مکمل", { exact: true }).fill("QA Category");
  await drawer.getByLabel("QA Goal", { exact: true }).check();
  await drawer.getByLabel("مقدار نوبت 1", { exact: true }).fill("1");
  await drawer.getByRole("button", { name: "افزودن نوبت مصرف" }).click();
  await drawer.getByLabel("مقدار نوبت 2", { exact: true }).fill("2");
  await drawer.getByRole("button", { name: "ذخیره مکمل" }).click();
  await expect(drawer).not.toBeVisible();
  await page.getByRole("button", { name: "ویرایش QA Catalog Supplement" }).click();
  await page.getByLabel("مقدار نوبت 2", { exact: true }).fill("3");
  await page.getByRole("button", { name: "ذخیره مکمل" }).click();
  const entries = await request.get(`${api}/supplement-catalog/`, { headers });
  const entryId = (await entries.json()).results[0].id;
  const generatedResponse = await request.post(`${api}/programs/generate/`, {
    headers,
    data: {
      student_id: student.id,
      template_id: template.id,
      program_type: "supplement",
      supplement_selection: {
        items: [{ entry_id: entryId }],
        confirmed: true,
        safety_reviewed: true,
        goal_ids: [goal.id]
      }
    }
  });
  expect(generatedResponse.status(), await generatedResponse.text()).toBe(201);
  const generated = await generatedResponse.json();
  expect(generated.program.supplements.items).toHaveLength(2);
  expect(generated.program.supplements.items[1].amount).toBe("3 اسکوپ");
  const untouchedCatalog = await request.get(`${api}/supplement-catalog/${entryId}/`, { headers });
  expect((await untouchedCatalog.json()).doses[0].amount).toBe("1.000");
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
