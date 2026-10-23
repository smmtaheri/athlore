import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Runs against the disposable SQLite/media stack with SMS_BACKEND=mock only.
test("visit prepares one draft, publishes a PDF and persists athlete set progress", async ({
  page,
  request,
  browser,
  baseURL
}, testInfo) => {
  const api = process.env.E2E_API_BASE_URL!;
  const suffix = `${Date.now()}${testInfo.workerIndex}`;
  const phone = `09${suffix.slice(-9)}`;
  const athletePhone = `09${String((Number(suffix.slice(-9)) + 1) % 1e9).padStart(9, "0")}`;
  const password = "WorkoutFlow-QA-123!";
  const registered = await request.post(`${api}/auth/register/`, {
    data: {
      email: `workout-${suffix}@example.com`,
      full_name: "Workout QA",
      phone_number: phone,
      password
    }
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const coach = await registered.json();
  const headers = { Authorization: `Bearer ${coach.tokens.access}` };
  const created = await request.post(`${api}/students/`, {
    headers,
    data: {
      full_name: "ورزشکار تست اجرای برنامه",
      phone_number: athletePhone,
      age: 28,
      gender: "male",
      height_cm: 180,
      weight_kg: 80,
      goals: { primary_goal: "hypertrophy" },
      training_background: { level: "intermediate" },
      training_conditions: {
        training_days_per_week: 2,
        environment: "gym",
        session_duration_minutes: 60
      },
      equipment: { has_full_gym: true }
    }
  });
  expect(created.status(), await created.text()).toBe(201);
  const student = await created.json();
  const provisioned = await request.post(
    `${api}/students/${student.id}/portal/set-initial-password/`,
    { headers, data: { initial_password: password } }
  );
  expect(provisioned.status(), await provisioned.text()).toBe(200);
  const pendingResponse = await request.post(`${api}/auth/phone-login/`, {
    data: { phone_number: athletePhone, role: "student", method: "password", password }
  });
  expect(pendingResponse.status(), await pendingResponse.text()).toBe(200);
  const pending = await pendingResponse.json();
  const setup = await request.post(`${api}/student/complete-setup/`, {
    headers: { Authorization: `Bearer ${pending.tokens.access}` },
    data: { password: "WorkoutStudent-456!", password_confirm: "WorkoutStudent-456!" }
  });
  expect(setup.status(), await setup.text()).toBe(200);
  const sessionResponse = await request.post(`${api}/auth/phone-login/`, {
    data: {
      phone_number: athletePhone,
      role: "student",
      method: "password",
      password: "WorkoutStudent-456!"
    }
  });
  expect(sessionResponse.status(), await sessionResponse.text()).toBe(200);
  const athleteSession = await sessionResponse.json();
  for (const [name, muscle] of [
    ["پرس سینه دستگاه", "chest"],
    ["پرس بالا سینه دمبل", "chest"],
    ["قفسه سینه دستگاه", "chest"],
    ["زیربغل سیمکش", "back"],
    ["زیربغل قایقی", "back"],
    ["زیربغل پول اور", "back"],
    ["اسکوات دستگاه", "quadriceps"],
    ["جلو پا دستگاه", "quadriceps"],
    ["پشت پا دستگاه", "hamstrings"],
    ["پرس سرشانه دستگاه", "shoulders"],
    ["نشر جانب دمبل", "shoulders"],
    ["نشر خم دمبل", "shoulders"]
  ]) {
    const exercise = await request.post(`${api}/exercises/`, {
      headers,
      data: {
        name: `${name} ${suffix}`,
        targets: [{ muscle_key: muscle, role: "primary" }],
        levels: ["intermediate"],
        equipment_keys: ["machine"],
        execution_guide: { execution: "حرکت را کنترل‌شده و بدون درد اجرا کنید." }
      }
    });
    expect(exercise.status(), await exercise.text()).toBe(201);
  }
  const visited = await request.post(`${api}/students/${student.id}/visits/`, {
    headers,
    data: {
      visit_date: "2026-10-23",
      current_weight_kg: 80,
      previous_weight_kg: 80,
      program_settings: {
        sections: ["workout"],
        training_systems: [],
        duration_weeks: 4,
        start_date: "2026-10-23",
        exercise_variety: "varied",
        session_muscles: [
          ["سینه", "زیربغل"],
          ["پا", "سرشانه"]
        ]
      }
    }
  });
  expect(visited.status(), await visited.text()).toBe(201);
  const visit = await visited.json();
  const requested = await request.post(`${api}/me/program-requests/`, {
    headers: { Authorization: `Bearer ${athleteSession.tokens.access}` },
    data: {
      student_id: student.id,
      sections: ["workout"],
      sessions_per_week: 2,
      assessment_mode: "in_person"
    }
  });
  expect(requested.status(), await requested.text()).toBe(201);
  const programRequest = await requested.json();
  const started = await request.post(`${api}/program-requests/${programRequest.id}/start/`, {
    headers,
    data: { visit_id: visit.id, assessment_mode: "in_person" }
  });
  expect(started.status(), await started.text()).toBe(200);
  const origin = new URL(baseURL!);
  origin.hostname = "localhost";
  await page.goto(`${origin.origin}/login`);
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  const fromVisitForm = testInfo.project.name === "mobile-chromium";
  await page.evaluate(
    (path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    },
    fromVisitForm
      ? `/students/${student.id}/visits/${visit.id}/edit`
      : `/programs/new?studentId=${student.id}&visitId=${visit.id}`
  );
  await expect(
    page.getByRole("heading", {
      name: fromVisitForm ? "ویرایش ویزیت" : "آماده‌سازی برنامه",
      exact: true
    })
  ).toBeVisible();
  const preparedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/visits/${visit.id}/prepare-program/`) &&
      response.request().method() === "POST"
  );
  await page
    .getByRole("button", {
      name: fromVisitForm ? "تأیید و ساخت پیش‌نویس برنامه" : "ساخت پیش‌نویس از ویزیت",
      exact: true
    })
    .click();
  const prepared = await preparedResponse;
  expect(prepared.status(), await prepared.text()).toBe(200);
  const program = (await prepared.json()).program;
  await expect(page).toHaveURL(new RegExp(`/programs/${program.id}$`));
  await expect(page.getByRole("heading", { name: "پیش نمایش برنامه", exact: true })).toBeVisible();
  expect(program.training.days.length).toBe(2);
  expect(
    program.training.days.every((day: { exercises: unknown[] }) => day.exercises.length > 0)
  ).toBeTruthy();
  // First session is expanded; other sessions retain the same accordion design.
  await expect(
    page.getByRole("button", { name: "نهایی‌سازی و ارسال به شاگرد", exact: true }).first()
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `artifacts/ui-review/workout-review-${testInfo.project.name}.png`,
    fullPage: true
  });
  await page
    .getByRole("button", { name: "نهایی‌سازی و ارسال به شاگرد", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/students/${student.id}/programs$`), { timeout: 60000 });
  const fulfilled = await request.get(`${api}/program-requests/${programRequest.id}/`, { headers });
  expect((await fulfilled.json()).status).toBe("fulfilled");

  const athleteContext = await browser.newContext({ viewport: page.viewportSize()! });
  const athletePage = await athleteContext.newPage();
  const athleteOrigin = new URL(baseURL!);
  athleteOrigin.hostname = "127.0.0.1";
  await athletePage.goto(`${athleteOrigin.origin}/login`);
  await athletePage.getByLabel(/شماره موبایل/).fill(athletePhone);
  await athletePage.locator("#student-login-password").fill("WorkoutStudent-456!");
  await athletePage.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(athletePage).not.toHaveURL(/login$/);
  await athletePage.goto(`${athleteOrigin.origin}/programs/${program.id}`);
  await expect(athletePage.getByRole("region", { name: "تمرین تعاملی" })).toBeVisible();
  const set = athletePage.getByRole("checkbox", { name: "ست 1", exact: true }).first();
  await expect(set).toBeEnabled();
  await set.check();
  await expect(set).toBeEnabled();
  await athletePage.reload();
  await expect(
    athletePage.getByRole("checkbox", { name: "ست 1", exact: true }).first()
  ).toBeChecked();
  await athletePage.getByLabel("هفتهٔ دوره", { exact: true }).selectOption("2");
  await expect(
    athletePage.getByRole("checkbox", { name: "ست 1", exact: true }).first()
  ).not.toBeChecked();
  await athletePage.getByLabel("هفتهٔ دوره", { exact: true }).selectOption("1");
  await expect(
    athletePage.getByRole("checkbox", { name: "ست 1", exact: true }).first()
  ).toBeChecked();
  await athletePage.getByRole("button", { name: "شروع / شروع دوباره" }).click();
  await expect(athletePage.getByLabel("زمان باقی‌مانده")).toContainText("1:");
  const downloadEvent = athletePage.waitForEvent("download");
  await athletePage.getByRole("button", { name: "دانلود برنامه تمرینی", exact: true }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  expect(
    await athletePage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await athletePage.screenshot({
    path: `artifacts/ui-review/workout-player-${testInfo.project.name}.png`,
    fullPage: true
  });
  const pdfPath = await download.path();
  expect(pdfPath).not.toBeNull();
  const stagedResponse = await request.post(`${api}/program-pdfs/staging/`, {
    headers,
    multipart: {
      student_id: student.id,
      section: "workout",
      file: {
        name: "manual-workout.pdf",
        mimeType: "application/pdf",
        buffer: await readFile(pdfPath!)
      }
    }
  });
  expect(stagedResponse.status(), await stagedResponse.text()).toBe(201);
  const uploadedResponse = await request.post(`${api}/programs/upload-pdf/`, {
    headers,
    data: {
      student_id: student.id,
      staged_pdf_id: (await stagedResponse.json()).id,
      title: "برنامهٔ دستی تست",
      program_type: "workout",
      date_range_start: "2026-10-23",
      date_range_end: "2026-11-19"
    }
  });
  expect(uploadedResponse.status(), await uploadedResponse.text()).toBe(201);
  const uploaded = await uploadedResponse.json();
  const finalized = await request.post(
    `${api}/programs/${uploaded.id}/versions/${uploaded.current_draft.id}/finalize/`,
    { headers, data: {} }
  );
  expect(finalized.status(), await finalized.text()).toBe(200);
  const activated = await request.post(`${api}/programs/${uploaded.id}/activate/`, {
    headers,
    data: { version_id: uploaded.current_draft.id }
  });
  expect(activated.status(), await activated.text()).toBe(200);
  await athletePage.goto(`${athleteOrigin.origin}/programs/${uploaded.id}`);
  await expect(
    athletePage.getByRole("heading", { name: "برنامهٔ دستی تست", exact: true })
  ).toBeVisible();
  await expect(
    athletePage.getByRole("button", { name: "دانلود برنامه تمرینی", exact: true })
  ).toBeVisible();
  await expect(athletePage.getByRole("region", { name: "تمرین تعاملی" })).toHaveCount(0);
  await athleteContext.close();
});
