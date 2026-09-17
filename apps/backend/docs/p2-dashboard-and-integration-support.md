# P2 — Dashboard API & Integration Support

**Status:** Implemented  
**Date:** 2026-08-06  
**Depends on:** P0 + P1

---

## Dashboard endpoint

`GET /api/v1/dashboard/`

- **Auth:** Bearer JWT + `IsAuthenticatedCoach`
- **Ownership:** all aggregates filtered by `request.coach`
- **Cross-tenant:** impossible by construction (no ID parameters)

### Response shape

```json
{
  "total_students": 0,
  "active_students": 0,
  "inactive_students": 0,
  "archived_students": 0,
  "this_month_visits": 0,
  "draft_programs": 0,
  "final_programs": 0,
  "active_programs": 0,
  "archived_programs": 0,
  "pdf_files_ready": 0,
  "ready_pdf_files": 0,
  "pdf_generation_available": false,
  "overdue_visit_days": 35,
  "latest_visits": [],
  "latest_programs": [],
  "overdue_visits": [],
  "follow_up_students": [],
  "today_tasks": ["هیچ کار فوری ثبت نشده است"],
  "as_of": "2026-08-06"
}
```

### Behavior notes

| Field | Rule |
|---|---|
| Student totals | Non-archived only for total/active/inactive; `archived_students` separate |
| `this_month_visits` | Visits with `visit_date` in current calendar month (`timezone.localdate()`) |
| Overdue | Active students with no `summary_last_visit_date` or date older than **35 days** |
| Follow-up | Inactive, non-empty medical note (≠ «بدون محدودیت»), or `injuries.has_injury` |
| Draft/final programs | Distinct live (non-archived) programs with matching version status |
| Recent lists | Max **5** items, newest first |
| PDF | Live coach-scoped counts; `pdf_generation_available: true` — see P3 |

### Tests

`accounts/tests/test_dashboard.py` covers anonymous access, empty/populated payloads, month counts, overdue/follow-up, draft/final counts, recent bounds, archived exclusion, two-coach isolation.

### PDF capability status

Real PDF generation remains deferred. Dashboard must not invent file counts.

### Contract clarification

`ready_pdf_files` is retained as an alias of `pdf_files_ready` for Frontend compatibility; both are always `0` until a PDF milestone lands.
