import { expect, test } from "@playwright/test";

// start-stack.mjs provides a disposable SQLite/media backend with mocked SMS
// and the database-backed fixed test code 111111. No SMS provider is contacted.
for (const role of ["coach", "student"] as const) {
  test(`${role} requests a code before verification and keeps the same identity`, async ({
    page,
    request,
    context,
    baseURL
  }) => {
    const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8767/api/v1";
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const coachPhone = `09${suffix.slice(-9)}`;
    const password = "CodeFlowPass123!";
    const registration = await request.post(`${api}/auth/register/`, {
      data: {
        email: `otp-${suffix}@example.com`,
        password,
        full_name: "Code Flow Coach",
        phone_number: coachPhone
      }
    });
    expect(registration.status()).toBe(201);
    const coach = await registration.json();
    let phone = coachPhone;
    let expectedUserId = coach.user.id;
    const origin = new URL(baseURL!);
    origin.hostname = role === "coach" ? "localhost" : "127.0.0.1";
    if (role === "student") {
      phone = `09${((Number(coachPhone.slice(2)) + 1) % 1_000_000_000).toString().padStart(9, "0")}`;
      const headers = { Authorization: `Bearer ${coach.tokens.access}` };
      const created = await request.post(`${api}/students/`, {
        headers,
        data: {
          full_name: "Code Flow Athlete",
          age: 25,
          gender: "male",
          height_cm: "180",
          weight_kg: "80",
          phone_number: phone
        }
      });
      expect(created.status()).toBe(201);
      const student = await created.json();
      const provisioned = await request.post(
        `${api}/students/${student.id}/portal/set-initial-password/`,
        {
          headers,
          data: { initial_password: "InitialCode123!" }
        }
      );
      expect(provisioned.status()).toBe(200);
      const initial = await request.post(`${api}/auth/phone-login/`, {
        data: {
          phone_number: phone,
          role: "student",
          method: "password",
          password: "InitialCode123!"
        }
      });
      expect(initial.status()).toBe(200);
      const pending = await initial.json();
      expectedUserId = pending.user.id;
      await context.clearCookies();
      await page.goto(`${origin.origin}/login`);
      await page.getByLabel(/شماره موبایل/).fill(phone);
      await page.locator("#student-login-password").fill("InitialCode123!");
      await page.getByRole("button", { name: "ورود", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "تغییر رمز عبور", exact: true })
      ).toBeVisible();
      await page.locator("#setup-password").fill(password);
      await page.locator("#setup-password-confirm").fill(password);
      await page.getByRole("button", { name: "ثبت رمز جدید", exact: true }).click();
      await expect(page.getByLabel(/شماره موبایل/)).toBeVisible();
    }
    await context.clearCookies();

    await page.goto(`${origin.origin}/login`);
    await expect(page.getByLabel(/شماره موبایل/)).toHaveAttribute(
      "placeholder",
      "شماره موبایل؛ 09xxxxxxxxx"
    );
    await expect(page.getByLabel(/شماره موبایل/)).toHaveAccessibleDescription(/فقط شماره موبایل/);
    await page.getByLabel(/شماره موبایل/).fill(phone.slice(1));
    await page.getByRole("button", { name: "ورود با کد یک‌بارمصرف", exact: true }).click();
    const code = page.getByLabel(/کد یک‌بارمصرف/);
    const send = page.getByRole("button", { name: "ارسال کد", exact: true });
    await expect(code).not.toBeVisible();

    await page.route(
      "**/api/v1/auth/request-code/",
      (route) =>
        route.fulfill({
          status: 503,
          json: {
            error: {
              code: "otp_unavailable",
              message: "ارسال کد انجام نشد؛ دوباره تلاش کنید.",
              details: {}
            }
          }
        }),
      { times: 1 }
    );
    await send.click();
    await expect(page.getByRole("alert")).toContainText("ارسال کد انجام نشد");
    await expect(code).not.toBeVisible();
    await expect(send).toBeEnabled();

    const deliveryResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/request-code/") && response.request().method() === "POST"
    );
    await send.click();
    const delivered = await deliveryResponse;
    expect(delivered.status()).toBe(200);
    expect(delivered.request().postDataJSON()).toEqual({ phone_number: phone.slice(1), role });
    await expect(code).toBeVisible();
    await expect(code).toBeFocused();
    await expect(page.getByRole("status")).toContainText("پیامک واقعی ارسال نمی‌شود");

    await code.fill("222222");
    const wrongResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/phone-login/") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "ورود با کد", exact: true }).click();
    expect((await wrongResponse).status()).toBe(401);
    await expect(page.getByRole("alert")).toContainText("کد ورود نادرست است");
    await expect(code).toHaveValue("222222");

    await expect(page.getByRole("button", { name: /ارسال دوباره کد/ })).toBeDisabled();
    await code.fill("111111");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);

    const loginResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/phone-login/") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "ورود با کد", exact: true }).click();
    const loggedIn = await loginResponse;
    expect(loggedIn.status()).toBe(200);
    const session = await loggedIn.json();
    expect(session.user.id).toBe(expectedUserId);
    expect(session.role).toBe(role);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", {
        name: role === "coach" ? "داشبورد مربی" : "سلام Code Flow Athlete",
        exact: true
      })
    ).toBeVisible();

    for (const path of ["/auth/login/", "/student/login/"]) {
      const retired = await request.post(`${api}${path}`, {
        data: { username: phone, password }
      });
      expect(retired.status()).toBe(410);
      expect((await retired.json()).error.code).toBe("phone_login_required");
    }
    await context.clearCookies();
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
    await page.goto(`${origin.origin}/login`);
    await page.getByLabel(/شماره موبایل/).fill(phone);
    await page
      .locator(role === "coach" ? "#login-password" : "#student-login-password")
      .fill(password);
    const passwordResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/phone-login/") && response.request().method() === "POST"
    );
    await page
      .getByRole("button", {
        name: role === "coach" ? "ورود به داشبورد" : "ورود",
        exact: true
      })
      .click();
    const passwordLogin = await passwordResponse;
    expect(passwordLogin.status()).toBe(200);
    expect((await passwordLogin.json()).user.id).toBe(expectedUserId);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
}
