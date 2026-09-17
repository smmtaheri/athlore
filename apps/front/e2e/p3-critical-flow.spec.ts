import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const reviewDir = path.resolve("artifacts/ui-review/p3-pdf-e2e");
const API = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8767/api/v1";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function registerViaUi(page: Page, email: string, fullName: string, phone: string) {
  await page.goto("/register");
  await page.locator("#register-full-name").fill(fullName);
  await page.locator("#register-email").fill(email);
  await page.locator("#register-phone").fill(phone);
  await page.locator("#register-password").fill("SecurePass123!");
  await page.getByRole("button", { name: /ساخت حساب مربی/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
}

async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const raw =
      sessionStorage.getItem("coach-assistant.auth.session.v3") ||
      localStorage.getItem("coach-assistant.auth.session.v2");
    if (!raw) return "";
    const session = JSON.parse(raw) as { accessToken?: string; token?: string };
    return session.accessToken || session.token || "";
  });
  expect(token).toBeTruthy();
  return token;
}

async function api(
  request: APIRequestContext,
  method: string,
  pathName: string,
  token: string,
  body?: unknown
) {
  const response = await request.fetch(`${API}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    data: body
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  return { status: response.status(), json, body: text };
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

const MIN_RULES = {
  templates: [
    {
      name: "۴ روزه حجم",
      goal: "حجم",
      main_goal: "حجم",
      level: "intermediate",
      days_per_week: 4,
      intensity: "متوسط",
      volume: "متوسط",
      rest_time: "۹۰",
      split: ["سینه", "زیربغل", "پا", "سرشانه"],
      muscle_priority_order: ["سینه", "زیربغل", "پا", "سرشانه"],
      special_rules: [],
      is_active: true,
      sort_order: 0
    }
  ],
  levels: [],
  injuries: [],
  muscle_priorities: [],
  exercise_bank: [
    {
      group: "سینه",
      favorite_exercises: ["پرس سینه هالتر", "Deadlift"],
      beginner_friendly: [],
      professional_friendly: [],
      forbidden_exercises: [],
      sort_order: 0
    },
    {
      group: "زیربغل",
      favorite_exercises: ["لت سیم کش"],
      beginner_friendly: [],
      professional_friendly: [],
      forbidden_exercises: [],
      sort_order: 1
    },
    {
      group: "پا",
      favorite_exercises: ["پرس پا"],
      beginner_friendly: [],
      professional_friendly: [],
      forbidden_exercises: [],
      sort_order: 2
    },
    {
      group: "سرشانه",
      favorite_exercises: ["نشر جانب"],
      beginner_friendly: [],
      professional_friendly: [],
      forbidden_exercises: [],
      sort_order: 3
    }
  ],
  general_rules: { extra_notes: "", items: [] }
};

test.describe("P3 critical PDF flow", () => {
  test.describe.configure({ mode: "serial" });

  test("full coach PDF lifecycle with isolation", async ({ page, request, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Run once on desktop");
    fs.mkdirSync(reviewDir, { recursive: true });

    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => {
      throw err;
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const emailA = uniqueEmail("coach-a");
    await registerViaUi(page, emailA, "آرمان مربی", "09121001001");
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(reviewDir, "dashboard-with-real-pdf-desktop.png"),
      fullPage: true
    });

    const token = await accessToken(page);

    const studentRes = await api(request, "POST", "/students/", token, {
      full_name: "محمد طاهری",
      age: 27,
      gender: "male",
      height_cm: "182.0",
      weight_kg: "86.0",
      phone_number: "09121001099",
      goals: { primary_goal: "hypertrophy" },
      injuries: { has_injury: false },
      training_background: { level: "intermediate" },
      training_conditions: { training_days_per_week: 4 }
    });
    expect(studentRes.status).toBe(201);
    const studentId = studentRes.json.id as string;

    const visitRes = await api(request, "POST", `/students/${studentId}/visits/`, token, {
      visit_date: "2026-08-01",
      current_weight_kg: "85.5",
      previous_weight_kg: "86.0",
      daily_energy_level: "good",
      sleep_quality: "medium",
      stress_level: "medium"
    });
    expect(visitRes.status).toBe(201);

    const rulesRes = await api(request, "PUT", "/coach-rules/", token, MIN_RULES);
    expect(rulesRes.status).toBe(200);
    const templateId = rulesRes.json.templates[0].id as string;

    const genRes = await api(request, "POST", "/programs/generate/", token, {
      student_id: studentId,
      template_id: templateId,
      program_type: "complete",
      title: "برنامه E2E محمد",
      level: "intermediate",
      days_per_week: 4
    });
    expect(genRes.status).toBe(201);
    const programId = genRes.json.program.id as string;
    const draftId = genRes.json.program.current_draft.id as string;

    await api(request, "PATCH", `/programs/${programId}/versions/${draftId}/`, token, {
      training: {
        ...genRes.json.program.training,
        summary: "ویرایش E2E"
      }
    });

    // UI: open program PDF settings as draft
    await page.goto(`/programs/${programId}?tab=pdf`);
    await expect(page.getByTestId("create-program-pdf")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(reviewDir, "finalized-program-pdf-settings-desktop.png"),
      fullPage: true
    });
    await page.getByTestId("create-program-pdf").click();
    await expect(page.getByTestId("confirm-finalize-for-pdf")).toBeVisible();
    await page.getByTestId("confirm-finalize-for-pdf").click();
    await page.waitForURL(new RegExp(`/students/${studentId}/pdf-files`), { timeout: 90_000 });

    await expect(page.getByText("آماده").first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(reviewDir, "student-pdf-list-desktop.png"),
      fullPage: true
    });
    await assertNoHorizontalOverflow(page);

    const listRes = await api(request, "GET", `/students/${studentId}/pdf-files/?limit=10`, token);
    expect(listRes.status).toBe(200);
    expect(listRes.json.count).toBeGreaterThanOrEqual(1);
    const pdfId = listRes.json.results[0].id as string;
    const fileName = listRes.json.results[0].file_name as string;

    const dl = await request.get(`${API}/pdf-files/${pdfId}/download/`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(dl.status()).toBe(200);
    const dlBody = await dl.body();
    expect(dlBody.subarray(0, 4).toString()).toBe("%PDF");
    expect(dlBody.length).toBeGreaterThan(100);

    const renameRes = await api(request, "PATCH", `/pdf-files/${pdfId}/`, token, {
      file_name: "mohammad-e2e-renamed.pdf"
    });
    expect(renameRes.status).toBe(200);

    await page.reload();
    await expect(page.getByTestId("pdf-download-direct").first()).toBeVisible();
    await expect(page.getByTestId("pdf-view").first()).toBeVisible();
    await expect(page.getByTestId("pdf-delete").first()).toBeVisible();

    const shareRes = await api(request, "POST", `/pdf-files/${pdfId}/share/`, token, {
      expires_in_days: 7
    });
    expect(shareRes.status).toBe(201);
    const shareUrl = shareRes.json.share_url as string;
    expect(shareUrl).toBeTruthy();
    await page.screenshot({
      path: path.join(reviewDir, "share-link-state-desktop.png"),
      fullPage: true
    });

    const anon = await browser.newContext();
    const shared = await anon.request.get(shareUrl!);
    expect(shared.status()).toBe(200);
    expect((await shared.body()).subarray(0, 4).toString()).toBe("%PDF");
    await anon.close();

    const revokeRes = await api(request, "DELETE", `/pdf-files/${pdfId}/share/`, token);
    expect(revokeRes.status).toBe(204);
    const revoked = await request.get(shareUrl!);
    expect(revoked.status()).toBe(404);

    const regen = await api(request, "POST", `/pdf-files/${pdfId}/regenerate/`, token, {});
    expect(regen.status).toBe(201);
    expect(regen.json.id).not.toBe(pdfId);

    await page.reload();
    const list2 = await api(request, "GET", `/students/${studentId}/pdf-files/?limit=10`, token);
    expect(list2.json.count).toBeGreaterThanOrEqual(2);

    const dash = await api(request, "GET", "/dashboard/", token);
    expect(dash.json.pdf_generation_available).toBe(true);
    expect(dash.json.pdf_files_ready).toBeGreaterThanOrEqual(2);

    await page.goto("/dashboard");
    await expect(page.getByText("PDF آماده").first()).toBeVisible();

    // Logout locally and register Coach B
    await page.evaluate(() => localStorage.clear());
    const emailB = uniqueEmail("coach-b");
    await registerViaUi(page, emailB, "Coach B", "09121001002");
    const tokenB = await accessToken(page);
    const blocked = await api(request, "GET", `/students/${studentId}/`, tokenB);
    expect(blocked.status).toBe(404);
    const blockedPdf = await api(request, "GET", `/pdf-files/${pdfId}/`, tokenB);
    expect(blockedPdf.status).toBe(404);

    expect(
      consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e)).length
    ).toBe(0);
    void fileName;
  });
});

test("invalid login shows Persian error", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill("bad@example.com");
  await page.locator("#login-password").fill("wrong-password");
  await page.getByRole("button", { name: /ورود به داشبورد/i }).click();
  await expect(
    page.getByText(/ایمیل یا رمز عبور نادرست|ورود انجام نشد|نامعتبر|اشتباه|خطا|نادرست/i).first()
  ).toBeVisible();
});

test("protected route redirects unauthenticated users", async ({ page }) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/login/);
});

test("not found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist-xyz");
  await expect(page.getByText(/پیدا نشد|یافت نشد|404|Not Found/i).first()).toBeVisible();
});

test("mobile overflow and review screenshot", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile only");
  fs.mkdirSync(reviewDir, { recursive: true });
  await page.goto("/login");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(reviewDir, "student-pdf-list-mobile.png"),
    fullPage: true
  });
});
