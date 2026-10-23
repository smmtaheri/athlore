import { expect, test } from "@playwright/test";

test("typed template editor saves executable blocks without free-text rules", async ({
  page,
  request,
  baseURL
}) => {
  const api = process.env.E2E_API_BASE_URL!;
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const phone = `09${unique.slice(-9)}`;
  const registered = await request.post(`${api}/auth/register/`, {
    data: {
      email: `templates-${unique}@example.com`,
      phone_number: phone,
      full_name: "Template Coach",
      password: "TemplatesPass123!"
    }
  });
  expect(registered.status()).toBe(201);
  const account = await registered.json();
  const headers = { Authorization: `Bearer ${account.tokens.access}` };
  const ids: string[] = [];
  for (const [name, muscle] of [
    ["پرس سینه دستگاه تست", "chest"],
    ["زیربغل قایق تست", "back"]
  ]) {
    const created = await request.post(`${api}/exercises/`, {
      headers,
      data: {
        name,
        targets: [{ muscle_key: muscle, role: "primary" }],
        levels: ["intermediate"],
        equipment_keys: ["machine"]
      }
    });
    expect(created.status()).toBe(201);
    ids.push((await created.json()).id);
  }
  const system = await request.post(`${api}/training-techniques/`, {
    headers,
    data: {
      key: `pair-${unique}`,
      name: "جفت اجرایی تست",
      description: "Test system",
      execution_method: "دو حرکت پشت سر هم",
      enabled: true,
      allowed_levels: ["intermediate"],
      max_per_session: 1,
      parameters: {},
      recipe: {
        version: 1,
        target: "all",
        grouping: {
          size: 2,
          mode: "antagonist",
          allow_compound: true,
          max_groups_per_session: 1,
          rest_between_seconds: 0,
          rest_after_seconds: 90
        },
        steps: [{ op: "prescribe", sets: 3, reps: "10", rest_seconds: 90 }]
      }
    }
  });
  expect(system.status()).toBe(201);
  const origin = new URL(baseURL!);
  origin.hostname = "localhost";
  await page.goto(`${origin.origin}/login`);
  await page.getByLabel(/شماره موبایل/).fill(phone);
  await page.locator("#login-password").fill("TemplatesPass123!");
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  const navigate = async (name: string) => {
    const menu = page.getByRole("button", { name: "باز کردن منوی ناوبری" });
    if ((page.viewportSize()?.width ?? 1440) < 768) await menu.click();
    await page.getByRole("link", { name, exact: true }).filter({ visible: true }).click();
  };
  await navigate("قوانین مربی");
  await page.getByRole("button", { name: "افزودن قالب", exact: true }).click();
  await page.getByLabel("نام قالب", { exact: true }).fill("قالب اجرایی تست");
  await page.getByRole("checkbox", { name: "سینه", exact: true }).check();
  await page.getByRole("checkbox", { name: "زیربغل", exact: true }).check();
  await page.getByRole("button", { name: "افزودن بلوک", exact: true }).click();
  await page
    .getByRole("combobox", { name: "نوع بلوک / سیستم تمرینی", exact: true })
    .selectOption(`pair-${unique}`);
  await page.getByLabel("عضلهٔ حرکت", { exact: true }).nth(0).selectOption("chest");
  await page.getByLabel("عضلهٔ حرکت", { exact: true }).nth(1).selectOption("back");
  await page.getByLabel("انتخاب حرکت", { exact: true }).nth(0).selectOption(ids[0]);
  await page.getByLabel("انتخاب حرکت", { exact: true }).nth(1).selectOption(ids[1]);
  await page.getByLabel("منبع تکرار / زمان", { exact: true }).nth(0).selectOption("custom");
  await page.getByLabel("حداقل تکرار / زمان", { exact: true }).fill("12");
  await page.getByLabel("حداکثر تکرار / زمان", { exact: true }).fill("15");
  await page.getByRole("checkbox", { name: "تغییر تعداد ست / دور سیستم در همین بلوک" }).check();
  await page.getByLabel("تعداد ست / دور", { exact: true }).fill("4");
  await page.getByRole("checkbox", { name: "استراحت متفاوت در همین بلوک" }).check();
  await page.getByLabel("استراحت بعد از دور (ثانیه)", { exact: true }).fill("120");
  await expect(page.getByLabel("قوانین خاص", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("تقسیم بندی روزها", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "ذخیره قوانین", exact: true }).click();
  await expect(page.getByText("قوانین مربی ذخیره شد.", { exact: true })).toBeVisible();
  await navigate("داشبورد");
  await navigate("قوانین مربی");
  await expect(page.getByLabel("تعداد ست / دور", { exact: true })).toHaveValue("4");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `artifacts/ui-review/structured-template-${page.viewportSize()?.width}.png`,
    fullPage: true
  });
  const rules = await (await request.get(`${api}/coach-rules/`, { headers })).json();
  const template = rules.templates.find((row: { name: string }) => row.name === "قالب اجرایی تست");
  expect(template.execution_plan.days[0].blocks[0].sets).toBe(4);
  const student = await request.post(`${api}/students/`, {
    headers,
    data: {
      full_name: "Template Athlete",
      phone_number: `09${String((Number(unique.slice(-9)) + 1) % 1000000000).padStart(9, "0")}`,
      age: 25,
      gender: "male",
      height_cm: "180",
      weight_kg: "80"
    }
  });
  expect(student.status(), await student.text()).toBe(201);
  const generated = await request.post(`${api}/programs/generate/`, {
    headers,
    data: {
      student_id: (await student.json()).id,
      template_id: template.id,
      program_type: "workout",
      days_per_week: 1,
      level: "intermediate"
    }
  });
  expect(generated.status(), await generated.text()).toBe(201);
  const output = (await generated.json()).program.training.days[0].exercises;
  expect(output.map((row: { exercise_id: string }) => row.exercise_id)).toEqual(ids);
  expect(
    output.every(
      (row: { sets: number; supersetRestAfterSeconds: number }) =>
        row.sets === 4 && row.supersetRestAfterSeconds === 120
    )
  ).toBeTruthy();
  expect(output[0].supersetGroupId).toBe(output[1].supersetGroupId);
  expect(output[0].reps).toBe("12–15");
});
