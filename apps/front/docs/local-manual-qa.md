# Local Manual QA — Athlore

This guide is for product owners who want to run and inspect the real Backend + Frontend on localhost.

It uses a **dedicated** manual-QA database and media directory. It never uses or deletes the protected local file:

`coach-assistant-backend/db.sqlite3`

---

## 1. Prerequisites

| Item             | Verified on this machine                                                            |
| ---------------- | ----------------------------------------------------------------------------------- |
| Python           | **3.12** (required; see Backend `.python-version`)                                  |
| uv               | latest (`uv --version`)                                                             |
| Node.js          | 20+ / 22 (tested with v22)                                                          |
| Package manager  | **pnpm** via Corepack (`packageManager` in `package.json`, `pnpm-lock.yaml`)        |
| Browser          | Chromium / Chrome / Firefox                                                         |
| Persian PDF font | `Noto Naskh Arabic` at `/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf` |
| WeasyPrint libs  | Cairo + Pango (system packages)                                                     |

If PDF generation fails with a font/library error on Linux:

```bash
sudo apt-get update
sudo apt-get install -y fonts-noto-core libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0
```

---

## 2. First-time setup

### Backend dependencies

```bash
cd coach-assistant-backend
uv sync --frozen
```

uv creates/uses `.venv/` inside the Backend repo.

### Frontend dependencies

```bash
cd coach-assistant-frontend
corepack enable
pnpm install --frozen-lockfile
```

### Create the manual-QA database + media

```bash
cd coach-assistant-backend
mkdir -p .local/manual-media
export DJANGO_DB_NAME="$(pwd)/.local/manual-qa.sqlite3"
export DJANGO_MEDIA_ROOT="$(pwd)/.local/manual-media"
export DJANGO_DEBUG=true
export CORS_ALLOWED_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
export PUBLIC_API_BASE_URL="http://127.0.0.1:8000/api/v1"
.venv/bin/python manage.py migrate --noinput
```

### Optional demo seed (fast login data)

```bash
cd coach-assistant-backend
export DJANGO_DB_NAME="$(pwd)/.local/manual-qa.sqlite3"
export DJANGO_MEDIA_ROOT="$(pwd)/.local/manual-media"
.venv/bin/python manage.py seed_demo_data
```

The command prints Coach A / Coach B credentials and record IDs. It is idempotent and development-only.

Or use the helper:

```bash
cd coach-assistant-backend
chmod +x scripts/reset-local-qa.sh scripts/start-local-qa.sh
./scripts/reset-local-qa.sh
# then start Backend with ./scripts/start-local-qa.sh (see below)
```

---

## 3. Daily run commands

### Terminal 1 — Backend

Plain commands:

```bash
cd coach-assistant-backend
export DJANGO_DB_NAME="$(pwd)/.local/manual-qa.sqlite3"
export DJANGO_MEDIA_ROOT="$(pwd)/.local/manual-media"
export DJANGO_DEBUG=true
export CORS_ALLOWED_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
export PUBLIC_API_BASE_URL="http://127.0.0.1:8000/api/v1"
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Helper (migrates, then starts):

```bash
cd coach-assistant-backend
./scripts/start-local-qa.sh
```

### Terminal 2 — Frontend

```bash
cd coach-assistant-frontend
export VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
pnpm dev -- --host 127.0.0.1 --port 5173
```

Keep both terminals open while testing.

---

## 4. Exact browser URLs

| URL                                           | What you should see                            |
| --------------------------------------------- | ---------------------------------------------- |
| http://127.0.0.1:5173/                        | Redirects to Dashboard (if logged in) or Login |
| http://127.0.0.1:5173/login                   | Coach login form                               |
| http://127.0.0.1:5173/register                | Coach registration form                        |
| http://127.0.0.1:5173/dashboard               | Metrics, recent items, quick actions           |
| http://127.0.0.1:5173/students                | Student list                                   |
| http://127.0.0.1:5173/students/new            | Create student                                 |
| http://127.0.0.1:5173/students/{id}           | Student profile overview                       |
| http://127.0.0.1:5173/students/{id}/visits    | Visits tab                                     |
| http://127.0.0.1:5173/students/{id}/programs  | Programs tab                                   |
| http://127.0.0.1:5173/students/{id}/pdf-files | PDF history tab                                |
| http://127.0.0.1:5173/coach-rules             | Coach rules editor                             |
| http://127.0.0.1:5173/programs                | Programs list                                  |
| http://127.0.0.1:5173/programs/new            | Program generation wizard                      |
| http://127.0.0.1:5173/programs/{id}?tab=pdf   | Program preview / PDF settings                 |
| http://127.0.0.1:8000/api/v1/dashboard/       | API (expects 401 when anonymous)               |
| http://127.0.0.1:8000/admin/                  | Django admin (only if you created a superuser) |

Shared PDF links look like:

`http://127.0.0.1:8000/api/v1/shared/pdf/{token}/`

---

## 5. Accounts

### A) Fresh UI registration (recommended first pass)

1. Open http://127.0.0.1:5173/register
2. Enter full name, email, password (min 8 characters)
3. Click **ساخت حساب مربی**
4. You should land on **داشبورد مربی**

### B) Optional seeded Demo Coach A

After `seed_demo_data`:

| Account             | Email                 | Password          |
| ------------------- | --------------------- | ----------------- |
| Coach A (demo)      | `arman@example.com`   | `DevOnlyPass123!` |
| Coach B (isolation) | `coach-b@example.com` | `DevOnlyPass123!` |

Login: http://127.0.0.1:5173/login

Seeded Coach A includes:

- rules / templates / exercise bank
- student **محمد طاهری**
- one monthly visit
- a draft demo program titled **برنامه دمو محمد** (when generation succeeds)

### Coach B for ownership testing

Use the seeded Coach B account, or register a second coach from `/register` with a different email.

---

## 6. Main manual scenario

Use either a fresh Coach A registration **or** seeded Coach A.

Expected browser: Desktop Chrome/Chromium. Keep DevTools Console open.

### 1. Login / Dashboard

- Open `/login` (or land there after register)
- Enter credentials → **ورود به داشبورد**
- **Expected:** Dashboard metrics load (students, visits, programs, PDF count)
- **Failure:** red error alert, blank page, or Network 401/CORS

### 2. Create student (skip if using seed)

- Click **افزودن شاگرد** or go to `/students/new`
- Fill: نام کامل `محمد طاهری`, سن `27`, قد `182`, وزن `86`, gender male
- Save
- **Expected:** student profile opens
- **Failure:** validation errors stay; Network 400/500

### 3. Open student profile

- `/students` → click the student
- **Expected:** overview with name and summary cards

### 4. Create monthly visit (skip if seed already has one)

- Tab **ویزیت‌ها** → add/new visit
- Enter visit date, current/previous weight, energy/sleep/stress
- Save
- **Expected:** visit appears in list
- **Failure:** form stuck saving; 404 on student

### 5. Configure coach rules

- Open `/coach-rules`
- If empty, seed or add at least one active template + exercise bank group
- Save
- **Expected:** success feedback; reload keeps data
- **Failure:** save error banner; Network 400

### 6. Generate program

- Open `/programs/new` (optionally with `?studentId=...`)
- Select student + template + type کامل
- Generate
- **Expected:** navigate to program preview with Draft content
- **Failure:** generation error; empty training days

### 7. Inspect and edit Draft

- On program page, edit a training note or exercise name
- Click **ذخیره تغییرات**
- **Expected:** “تغییرات برنامه ذخیره شد” (or similar)
- Status badge still **پیش نویس**

### 8. Finalize

- Use the ready/finalize action already on the page (**آماده‌سازی / وضعیت ready** flow)
- Confirm if asked
- **Expected:** status becomes finalized/ready; editing becomes restricted
- **Failure:** still editable as draft; API 400

### 9. Confirm PDF blocked on draft (fresh path)

- Before finalizing, open tab **تنظیمات PDF** and click **ساخت PDF**
- **Expected:** Persian message that finalization is required + confirmation modal
- Do **not** expect silent finalize without confirmation

### 10. Generate PDF after finalization

- Finalize first, then **ساخت PDF**
- **Expected:** navigate to student PDF files; status **آماده**
- **Failure:** error feedback; status failed; empty list

### 11. PDF history / download / rename / regenerate

- On `/students/{id}/pdf-files`
- Open **عملیات** → **دانلود** → file begins with `%PDF` and size > 0
- **تغییر نام** → save `mohammad-renamed.pdf`
- **ساخت دوباره** → second historical row appears
- **Expected:** two rows after regenerate; old row remains

### 12. Share link

- **اشتراک گذاری لینک**
- **Expected:** success message + visible share URL (copy once)
- Open the URL in a private/incognito window **without login**
- **Expected:** PDF downloads
- **لغو لینک اشتراک**
- Reload the old URL in private window
- **Expected:** not found / failed download

### 13. Dashboard PDF count

- Open `/dashboard`
- **Expected:** **PDF آماده** > 0 after successful PDFs
- **Failure:** stuck at 0 while PDF list has ready files

### 14. Logout + Coach B isolation

- Logout (clear session / خروج)
- Login as Coach B
- Try Coach A student URL and program URL
- **Expected:** not found / empty — never Coach A data
- **Failure:** Coach A student visible to Coach B

### 15. Console / Network sanity

- No red fatal React errors during the flow
- No repeated 500 responses on main actions

---

## 7. Resetting local manual data

Safe reset (manual-QA only):

```bash
cd coach-assistant-backend
./scripts/reset-local-qa.sh
```

Or manually:

```bash
cd coach-assistant-backend
rm -f .local/manual-qa.sqlite3 .local/manual-qa.sqlite3-*
rm -rf .local/manual-media
mkdir -p .local/manual-media
export DJANGO_DB_NAME="$(pwd)/.local/manual-qa.sqlite3"
export DJANGO_MEDIA_ROOT="$(pwd)/.local/manual-media"
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py seed_demo_data   # optional
```

**Never** delete `db.sqlite3`.

---

## 8. Stopping the application

In each terminal running Backend/Frontend:

- Press `Ctrl+C`

If a port stays busy:

```bash
ss -ltnp | grep -E ':8000|:5173'
# then kill only the listed PID if it is your runserver/vite process
```

---

## 9. Common troubleshooting

| Symptom                       | What to check                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Port already in use           | Another `runserver`/`vite` on 8000/5173                                                            |
| Frontend cannot reach Backend | Backend running? `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1`? Restart Vite after changing env |
| CORS error                    | `CORS_ALLOWED_ORIGINS` includes `http://127.0.0.1:5173`                                            |
| Session lost after refresh    | Confirm login succeeded; check Application → Local Storage for `coach-assistant.auth.session.v2`   |
| Token / 401 loops             | Logout, clear site data, login again                                                               |
| Missing migration             | Run migrate with `DJANGO_DB_NAME` pointing at `.local/manual-qa.sqlite3`                           |
| WeasyPrint / PDF failure      | Install fonts + Cairo/Pango packages; check Backend terminal traceback                             |
| Missing Persian font          | Install `fonts-noto-core`; confirm Noto Naskh Arabic path exists                                   |
| Stale Frontend env            | Stop Vite, export `VITE_API_BASE_URL`, start again                                                 |
| Accidentally using wrong DB   | Confirm Backend startup prints/uses `.local/manual-qa.sqlite3`, not `db.sqlite3`                   |

Quick Backend reachability check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/api/v1/dashboard/
# expect 401
```

---

## 10. Bug-report template

```text
Page:
URL:
Account:
Action:
Expected:
Actual:
Console error:
Network request:
Backend log:
Screenshot:
Reproducible after refresh: yes/no
```

---

## Related docs

- Backend PDF details: `../coach-assistant-backend/docs/p3-pdf-artifacts-implementation.md`
- Frontend PDF/E2E: `./pdf-and-e2e-integration.md`
- API integration: `./api-integration.md`
