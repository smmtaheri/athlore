# Arman reference data, generation evidence, and production hardening

## Import

```bash
python manage.py import_coach_reference_data --coach-email arman@example.com --dataset arman
python manage.py import_coach_reference_data --coach-email arman@example.com --dataset arman --dry-run
```

Dataset path: `reference_data/arman/`.

## Generation priority (`rules_v1`)

Documented in `programming/services/generator.py` as `PRIORITY_ORDER` and returned in `document.generator.evidence`.

## Nutrition / supplements

- Templates require coach review (`needs_coach_review=false`, `status=active`, `is_eligible_for_auto_select=true`) before auto-selection.
- Supplements additionally require `supplement_opt_in: true` on generate.
- Student safety fields gate nutrition selection.

## Auth cookies

- Refresh: HttpOnly cookie `coach_assistant_refresh` (path `/api/v1/auth/`)
- Access: Authorization Bearer (SPA holds in sessionStorage/memory)

## PDF security

- WeasyPrint URL fetcher restricted to local fonts (`delivery/services/pdf_security.py`)

## Tooling

```bash
uv run ruff check .
uv run ruff format --check .
uv run python -m compileall -q .
uv run pip-audit
uv run coverage run manage.py test
```
