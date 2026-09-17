# Operations milestone — phones, registration, commands, export PDFs, PostgreSQL

## Phone normalization

Shared module: `common/phone.py` → `normalize_iran_mobile()`.

Canonical form: `+989XXXXXXXXX`

Accepted inputs include `09…`, `98…`, `+98…`, Persian/Arabic digits, spaces and hyphens.

Uniqueness always compares canonical values.

Stable API codes:

- `coach_phone_already_exists`
- `student_phone_already_exists`

Coach phone: `CoachProfile.phone_number` with partial unique constraint `uniq_coach_phone_number`.

Student phone: `Student.phone_number` globally unique via `uniq_student_phone_number` (includes archived).

Migrations:

- `accounts/migrations/0003_phone_uniqueness.py`
- `students/migrations/0002_phone_uniqueness.py`

Legacy null phones are allowed in DB; new creates require phone. Use:

```bash
python manage.py list_coaches --missing-phone
python manage.py set_coach_phone --coach-email … --phone …
python manage.py list_students --missing-phone
python manage.py set_student_phone --student-id … --phone …
```

## Public registration

`PUBLIC_REGISTRATION_ENABLED` (default `false`).

When disabled, `POST /api/v1/auth/register/` returns `403` with `registration_disabled`.

Create coaches with `create_coach` (or temporarily enable registration in isolated tests).

## Management commands

`create_coach`, `list_coaches`, `activate_coach`, `deactivate_coach`, `set_coach_phone`,
`create_student`, `list_students`, `archive_student`, `restore_student`, `transfer_student`,
`set_student_phone`, plus existing `seed_demo_data`.

## PDF exports (on-demand, no PdfArtifact)

- `GET /api/v1/me/coach-rules/pdf/`
- `GET /api/v1/students/{id}/profile.pdf`

## Health

`GET /api/v1/health/` → `{ "status": "ok", "database": "ok" }`

## Databases

| Use | Engine |
|-----|--------|
| Protected legacy local file `db.sqlite3` | SQLite — do not migrate/delete in automation |
| Isolated unit tests | Temporary SQLite via Django |
| Compose deployment | PostgreSQL via `DB_ENGINE=postgresql` + `POSTGRES_*` |

## Docker

Backend `Dockerfile` + `docker/entrypoint.sh` (wait for Postgres, migrate, collectstatic, gunicorn).

Never copies `db.sqlite3`, `.venv`, or `.env` into the image.
