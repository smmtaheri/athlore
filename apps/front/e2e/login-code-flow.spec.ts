import { expect, test } from "@playwright/test";

// Run with LOGIN_OTP_ENABLED=true LOGIN_OTP_STATIC_CODE=1111
// VITE_LOGIN_OTP_ENABLED=true VITE_COACH_DOMAIN=localhost VITE_STUDENT_DOMAIN=127.0.0.1.
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
          data: { username: phone, initial_password: "InitialCode123!" }
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
      const setup = await request.post(`${api}/student/complete-setup/`, {
        headers: { Authorization: `Bearer ${pending.tokens.access}` },
        data: { password, password_confirm: password }
      });
      expect(setup.status()).toBe(200);
    }
    await context.clearCookies();

    const origin = new URL(baseURL!);
    origin.hostname = role === "coach" ? "localhost" : "127.0.0.1";
    await page.goto(`${origin.origin}/login`);
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

    await code.fill("2222");
    const wrongResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/phone-login/") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "ورود با کد", exact: true }).click();
    expect((await wrongResponse).status()).toBe(401);
    await expect(page.getByRole("alert")).toContainText("کد ورود نادرست است");
    await expect(code).toHaveValue("2222");

    await page.getByRole("button", { name: "ارسال دوباره کد", exact: true }).click();
    await expect(code).toHaveValue("");
    await code.fill("1111");
    await page.getByRole("button", { name: "رمز عبور", exact: true }).click();
    await expect(code).not.toBeVisible();
    await expect(page.getByLabel(/رمز عبور/)).toBeVisible();
    await page.getByRole("button", { name: "ورود با کد یک‌بارمصرف", exact: true }).click();
    await expect(code).not.toBeVisible();
    await send.click();
    await code.fill("1111");
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
  });
}
