# P3 — PDF Artifacts Implementation

## Summary

Persistent PDF artifacts are generated synchronously from **finalized** `ProgramVersion` snapshots using WeasyPrint + Django HTML templates. Authenticated downloads and hashed public share links are ownership-scoped. Dashboard PDF counts are real.

## Models

App: `delivery`

- **PdfArtifact** — UUID PK; coach/student/program/`ProgramVersion` FKs; display name; `FileField`; status `pending|rendering|ready|failed`; MIME; size; SHA-256; template/engine versions; error code/summary; soft-delete via `deleted_at`; optional `regenerated_from`.
- **PdfShareLink** — UUID PK; artifact + coach; **token_hash only** (SHA-256 of raw bearer); expires/revoked/last_accessed; download_count.

Migration: `delivery/migrations/0001_p3_pdf_artifacts.py` (additive).

## Storage

- Django `FileField` under `MEDIA_ROOT/pdfs/{coach_id}/{artifact_id}/…`
- `DJANGO_MEDIA_ROOT` / `MEDIA_ROOT` configurable; gitignored `media/`
- Private files are **not** served via public media URLs in product flows
- Future S3-compatible storage can replace the default filesystem backend without changing services

## Rendering

- Engine: **WeasyPrint 66** (uv)
- Template: `delivery/templates/delivery/program_pdf.html`
- Template version: `1.0.0` (`RENDER_TEMPLATE_VERSION`)
- Font: system **Noto Naskh Arabic** (`/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf`), fallbacks Noto Sans Arabic / DejaVu
- No CDN / network fetches at render time
- User content HTML-escaped in the render context builder

## Artifact lifecycle

1. Create metadata (`pending`) from finalized version  
2. Render (`rendering` → `ready` or `failed`) outside long DB locks where practical  
3. Ready artifacts store checksum, size, generated_at  
4. **Regenerate** creates a **new** artifact linked via `regenerated_from` (history preserved)  
5. Soft-delete: revoke shares, delete file, set `deleted_at`, hide from lists  

## Finalized-version rule

Draft / non-finalized versions are rejected with `version_not_finalized` / `program_not_finalized`. Frontend must finalize explicitly before PDF create.

## Endpoints (`/api/v1/`)

| Method | Path |
|--------|------|
| GET | `/students/{id}/pdf-files/` |
| GET/POST | `/programs/{id}/pdf-files/` |
| POST | `/programs/{id}/versions/{version_id}/pdf-files/` |
| GET/PATCH/DELETE | `/pdf-files/{id}/` |
| GET | `/pdf-files/{id}/download/` |
| POST | `/pdf-files/{id}/regenerate/` |
| POST/DELETE | `/pdf-files/{id}/share/` |
| GET | `/shared/pdf/{token}/` (anonymous; token auth only) |

Share create returns raw `token` + `share_url` **once**. Lists expose `share.has_active_link` only.

## Ownership & share security

- Authenticated ops: coach-scoped; cross-coach → **404**
- Public share: hashed token lookup; expired/revoked/deleted/non-ready → generic **404**
- Rate limiting deferred to production infra (document only)

## Dashboard

`pdf_files_ready` / `ready_pdf_files` / `pdf_files_pending` / `pdf_files_failed` / `pdf_generation_available: true` — excludes deleted and other coaches.

## Tests & smoke

- `delivery/tests/test_pdf_artifacts.py` — models, render, API, share, ownership, dashboard
- `scripts/p3_pdf_fullstack_smoke.py` → prints `PDF FULL-STACK SMOKE OK`

## Local setup

```bash
uv sync --frozen   # or .venv/bin/pip sync via uv.lock
export DJANGO_DB_NAME=/tmp/dev.sqlite3
export DJANGO_MEDIA_ROOT=/tmp/dev-media
.venv/bin/python manage.py migrate
.venv/bin/python scripts/p3_pdf_fullstack_smoke.py
```

Do **not** migrate or touch the demo `db.sqlite3`.

## Production requirements (deferred)

- Async rendering (Celery/Redis)
- Object storage (S3)
- Share download rate limits
- Antivirus scanning
- Hardened `DEBUG=false` media policy

## Known limitations

- Synchronous render only (request may take seconds)
- Raw share URL cannot be retrieved after creation (hash-only storage)
- No watermark/branding designer / email delivery
