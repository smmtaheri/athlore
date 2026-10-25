import { defineConfig, devices } from "@playwright/test";

const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 5177);
const backendPort = Number(process.env.E2E_BACKEND_PORT || 8767);

// Browser E2E always targets the disposable local stack. In particular, do not
// let an inherited URL point test setup or OTP requests at shared Stage.
process.env.E2E_API_BASE_URL = `http://127.0.0.1:${backendPort}/api/v1`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "artifacts/playwright-report" }]],
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    locale: "fa-IR",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  webServer: {
    command: `node ./e2e/scripts/start-stack.mjs`,
    url: `http://127.0.0.1:${frontendPort}/login`,
    // Reuse could silently attach to a developer's non-isolated server.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe"
  }
});
