# Athlore host configuration

The production deployment has three explicit browser surfaces:

| Surface | Host | Browser responsibility |
| --- | --- | --- |
| Public | `athlore.ir` | Public Home and public share artifacts |
| Coach | `coach.athlore.ir` | Coach login and coach panel |
| Student | `student.athlore.ir` | Student login and student panel |

The values are environment-driven through `PUBLIC_DOMAIN`, `COACH_DOMAIN`, and
`STUDENT_DOMAIN`. Django accepts these three hosts through `DJANGO_ALLOWED_HOSTS`
and accepts their HTTPS origins through `CSRF_TRUSTED_ORIGINS` and
`CORS_ALLOWED_ORIGINS`.

The role-specific browser route split is enforced by the frontend host-aware
router. Backend API endpoints remain under `/api/v1/`; authorization and
ownership permissions are enforced by the API independently of the browser
surface.
