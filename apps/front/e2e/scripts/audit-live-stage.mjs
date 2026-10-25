// Read-only browser inspection of a synthetic Stage QA athlete. Never sends SMS.
/* global process, URL, document, console */
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [studentId, programId] = process.argv.slice(2);
const uuid = /^[a-f0-9-]{36}$/;
if (!uuid.test(studentId ?? "") || !uuid.test(programId ?? "")) {
  throw new Error("Usage: node e2e/scripts/audit-live-stage.mjs <QA-student-uuid> <program-uuid>");
}
const python = `from students.models import StudentProfile; from rest_framework_simplejwt.tokens import RefreshToken; p=StudentProfile.objects.select_related("student","user").get(student_id="${studentId}"); assert p.user.username.startswith("stage-qa-") and p.student.full_name.startswith("QA — unified workout"); print(str(RefreshToken.for_user(p.user)))`;
function newRefresh() {
  const output = execFileSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "root@82.115.8.152",
      `docker exec athlore-stage-backend-1 python manage.py shell -c '${python}'`
    ],
    { encoding: "utf8" }
  );
  const refresh = output.trim().split("\n").at(-1);
  if (!refresh?.startsWith("eyJ")) throw new Error("QA session creation failed.");
  return refresh;
}
const browser = await chromium.launch();
const reports = [];
await mkdir("artifacts/stage-unification", { recursive: true });
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844]
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: "fa-IR" });
    await context.addCookies([
      {
        name: "coach_assistant_refresh",
        value: newRefresh(),
        domain: "stage.student.athlore.ir",
        path: "/api/v1/auth/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    ]);
    await context.route("**/api/v1/**", (route) => {
      const request = route.request();
      if (
        ["GET", "HEAD", "OPTIONS"].includes(request.method()) ||
        new URL(request.url()).pathname === "/api/v1/auth/refresh/"
      )
        return route.continue();
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`https://stage.student.athlore.ir/programs/${programId}`, {
      waitUntil: "networkidle"
    });
    await page.getByRole("region", { name: "تمرین تعاملی" }).waitFor({ timeout: 30000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    const pdfButtons = await page
      .getByRole("button", { name: "دانلود برنامه تمرینی", exact: true })
      .count();
    await page.screenshot({ path: `artifacts/stage-unification/${name}.png`, fullPage: true });
    reports.push({ viewport: name, overflow, pdfButtons, errors, url: page.url() });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(reports));
if (reports.some((report) => report.overflow > 1 || report.errors.length || !report.pdfButtons))
  process.exitCode = 1;
