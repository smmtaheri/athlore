import { expect, test } from "@playwright/test";

// PDF lifecycle, sharing and owner isolation run in visit-workout-delivery.spec.ts.
// Keep one visit-first flow, not the retired generation wizard or Web Storage tokens.
test("invalid login shows Persian error", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-phone").fill("09121112233");
  await page.locator("#login-password").fill("wrong-password");
  await page.getByRole("button", { name: "ورود به داشبورد", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("protected route redirects unauthenticated users", async ({ page }) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/login/);
});

test("not found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist-xyz");
  await expect(page.getByText(/پیدا نشد|یافت نشد|404|Not Found/i).first()).toBeVisible();
});

test("login does not overflow the viewport", async ({ page }) => {
  await page.goto("/login");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});
