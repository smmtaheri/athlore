#!/usr/bin/env node
/**
 * Starts temporary Backend (DB + media) and Frontend for Playwright.
 * Never touches coach-assistant-backend/db.sqlite3.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../..");
const backendRoot = path.resolve(frontendRoot, "../coach-assistant-backend");
const backendPython = path.join(backendRoot, ".venv/bin/python");
const preferUv = fs.existsSync(path.join(backendRoot, "uv.lock"));

const frontendPort = process.env.E2E_FRONTEND_PORT || "5177";
const backendPort = process.env.E2E_BACKEND_PORT || "8767";

const tmpDb = path.join(os.tmpdir(), `ca-e2e-${Date.now()}.sqlite3`);
const tmpMedia = fs.mkdtempSync(path.join(os.tmpdir(), "ca-e2e-media-"));

const children = [];

function shutdown() {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    // ignore
  }
  fs.rmSync(tmpMedia, { recursive: true, force: true });
}

process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

const backendEnv = {
  ...process.env,
  DJANGO_DB_NAME: tmpDb,
  DJANGO_MEDIA_ROOT: tmpMedia,
  DJANGO_DEBUG: "true",
  PUBLIC_API_BASE_URL: `http://127.0.0.1:${backendPort}/api/v1`,
  CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${frontendPort},http://localhost:${frontendPort}`,
  PUBLIC_REGISTRATION_ENABLED: "true"
};

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

function runPython(args, opts) {
  if (preferUv) {
    return run("uv", ["run", "python", ...args], opts);
  }
  return run(backendPython, args, opts);
}

await runPython(["manage.py", "migrate", "--noinput"], {
  cwd: backendRoot,
  env: backendEnv
});

const backend = preferUv
  ? spawn(
      "uv",
      ["run", "python", "manage.py", "runserver", `127.0.0.1:${backendPort}`, "--noreload"],
      {
        cwd: backendRoot,
        env: backendEnv,
        stdio: "inherit"
      }
    )
  : spawn(backendPython, ["manage.py", "runserver", `127.0.0.1:${backendPort}`, "--noreload"], {
      cwd: backendRoot,
      env: backendEnv,
      stdio: "inherit"
    });
children.push(backend);

const frontend = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", frontendPort], {
  cwd: frontendRoot,
  env: {
    ...process.env,
    VITE_API_BASE_URL: `http://127.0.0.1:${backendPort}/api/v1`,
    VITE_PUBLIC_REGISTRATION_ENABLED: "true"
  },
  stdio: "inherit"
});
children.push(frontend);

// Keep process alive while Playwright drives browsers.
await new Promise(() => {});
