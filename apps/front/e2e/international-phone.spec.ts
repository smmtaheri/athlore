import { expect, test } from "@playwright/test";

// The configured disposable backend mocks all SMS; this flow uses passwords.
test("country-aware coach and student login preserves the account identity", async ({
  page,
  request,
  context,
  baseURL
}) => {
  const api = process.env.E2E_API_BASE_URL!;
  const suffix = String(Date.now()).slice(-6);
  const coachNational = `7400${suffix}`;
  const studentNational = `201555${suffix.slice(-4)}`;
  const password = "CountryFlowPass123!";
  const registered = await request.post(`${api}/auth/register/`, {
    data: {
      email: `country-${suffix}@example.com`,
      full_name: "Country Coach",
      phone_number: `+44${coachNational}`,
      password
    }
  });
  expect(registered.status()).toBe(201);
  const coach = await registered.json();
  const headers = { Authorization: `Bearer ${coach.tokens.access}` };
  const created = await request.post(`${api}/students/`, {
    headers,
    data: {
      full_name: "Country Athlete",
      age: 28,
      gender: "male",
      height_cm: "180",
      weight_kg: "80",
      phone_number: `+1${studentNational}`,
      phone_country: "US"
    }
  });
  expect(created.status()).toBe(201);
  const student = await created.json();
  expect(student.phone_country).toBe("US");
  const activated = await request.post(
    `${api}/students/${student.id}/portal/set-initial-password/`,
    {
      headers,
      data: { initial_password: password }
    }
  );
  expect(activated.status()).toBe(200);

  for (const [role, country, national] of [
    ["coach", "GB", coachNational],
    ["student", "US", studentNational]
  ] as const) {
    await context.clearCookies();
    const origin = new URL(baseURL!);
    origin.hostname = role === "coach" ? "localhost" : "127.0.0.1";
    await page.goto(`${origin.origin}/login`);
    const phone = page.getByLabel(/^شماره موبایل/);
    expect(await page.getByRole("combobox", { name: "کشور شماره موبایل" }).inputValue()).toBe("IR");
    await phone.fill("09121234567");
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("combobox", { name: "کشور شماره موبایل" }).selectOption(country);
    await expect(phone).toHaveValue("");
    await phone.fill(national);
    await page
      .locator(role === "coach" ? "#login-password" : "#student-login-password")
      .fill(password);
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/phone-login/") && response.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: role === "coach" ? "ورود به داشبورد" : "ورود", exact: true })
      .click();
    const loggedIn = await response;
    expect(loggedIn.status()).toBe(200);
    const session = await loggedIn.json();
    expect(session.role).toBe(role);
    expect(role === "coach" ? session.coach.id : session.student.id).toBe(
      role === "coach" ? coach.coach.id : student.id
    );
  }
});
