from __future__ import annotations

from django.contrib.auth import get_user_model
from django.conf import settings
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CoachProfile
from accounts.services import REFRESH_SESSION_STARTED_AT_CLAIM
from common.testing import auth_header, register
from students.models import Student, Visit

User = get_user_model()


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class AuthTests(APITestCase):
    def test_register_success(self):
        res = register(self.client, "arman@example.com", full_name="آرمان واعظی")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("tokens", res.data)
        self.assertIn("access", res.data["tokens"])
        self.assertIn("refresh", res.data["tokens"])
        self.assertEqual(res.data["user"]["email"], "arman@example.com")
        self.assertEqual(res.data["coach"]["display_name"], "آرمان واعظی")
        user = User.objects.get(email="arman@example.com")
        self.assertTrue(user.check_password("SecurePass123!"))
        self.assertFalse(user.has_usable_password() and user.password == "SecurePass123!")
        self.assertTrue(hasattr(user, "coach_profile"))
        self.assertTrue(hasattr(user.coach_profile, "rule_set"))

    def test_duplicate_registration(self):
        register(self.client, "dup@example.com")
        res = register(self.client, "Dup@example.com")
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data["error"]["code"], "conflict")

    def test_login_success_and_failure(self):
        register(self.client, "login@example.com", password="SecurePass123!")
        ok = self.client.post(
            "/api/v1/auth/login/",
            {"email": "login@example.com", "password": "SecurePass123!"},
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertIn("tokens", ok.data)

        bad = self.client.post(
            "/api/v1/auth/login/",
            {"email": "login@example.com", "password": "WrongPass999!"},
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_authenticated_and_anonymous(self):
        res = register(self.client, "me@example.com", full_name="Me Coach")
        tokens = res.data["tokens"]
        me = self.client.get("/api/v1/me/", **auth_header(tokens))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data["user"]["email"], "me@example.com")
        self.assertEqual(me.data["coach"]["display_name"], "Me Coach")

        anon = self.client.get("/api/v1/me/")
        self.assertEqual(anon.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("error", anon.data)

    def test_refresh_and_logout(self):
        res = register(self.client, "refresh@example.com")
        refresh = res.data["tokens"]["refresh"]

        refreshed = self.client.post("/api/v1/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        self.assertIn("access", refreshed.data)
        self.assertIn("refresh", refreshed.data)
        new_refresh = refreshed.data["refresh"]

        # Old refresh should be blacklisted after rotation
        reuse = self.client.post("/api/v1/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(reuse.status_code, status.HTTP_401_UNAUTHORIZED)

        logout = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": new_refresh},
            format="json",
            **{"HTTP_AUTHORIZATION": f"Bearer {refreshed.data['access']}"},
        )
        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)

        after = self.client.post("/api/v1/auth/refresh/", {"refresh": new_refresh}, format="json")
        self.assertEqual(after.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_rotation_preserves_absolute_session_start(self):
        res = register(self.client, "absolute@example.com")
        refresh = res.data["tokens"]["refresh"]
        from rest_framework_simplejwt.tokens import RefreshToken

        initial = RefreshToken(refresh)
        refreshed = self.client.post("/api/v1/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        rotated = RefreshToken(refreshed.data["refresh"])
        self.assertEqual(
            rotated[REFRESH_SESSION_STARTED_AT_CLAIM],
            initial[REFRESH_SESSION_STARTED_AT_CLAIM],
        )

    def test_refresh_requires_login_after_absolute_seven_day_window(self):
        res = register(self.client, "expired-session@example.com")
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken(res.data["tokens"]["refresh"])
        started_at = int(refresh["iat"] - settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
        refresh[REFRESH_SESSION_STARTED_AT_CLAIM] = started_at
        expired = self.client.post(
            "/api/v1/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(expired.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(expired.data["error"]["code"], "token_expired")

    def test_deactivated_user_cannot_login(self):
        register(self.client, "dead@example.com", password="SecurePass123!")
        user = User.objects.get(email="dead@example.com")
        user.is_active = False
        user.save(update_fields=["is_active"])
        res = self.client.post(
            "/api/v1/auth/login/",
            {"email": "dead@example.com", "password": "SecurePass123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class OwnershipTests(APITestCase):
    def setUp(self):
        a = register(self.client, "a@example.com", full_name="Coach A")
        b = register(self.client, "b@example.com", full_name="Coach B")
        self.tokens_a = a.data["tokens"]
        self.tokens_b = b.data["tokens"]
        self.coach_a = CoachProfile.objects.get(user__email="a@example.com")
        created = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "Student A",
                "age": 27,
                "gender": "male",
                "height_cm": "180.0",
                "weight_kg": "80.0",
                "phone_number": "09121110001",
                "status": "active",
                "goals": {"primary_goal": "hypertrophy"},
                "training_background": {"level": "intermediate"},
            },
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.student_a_id = created.data["id"]

    def test_coach_b_cannot_see_or_mutate_student_a(self):
        listed = self.client.get("/api/v1/students/", **auth_header(self.tokens_b))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 0)

        detail = self.client.get(
            f"/api/v1/students/{self.student_a_id}/",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

        patch = self.client.patch(
            f"/api/v1/students/{self.student_a_id}/",
            {"full_name": "Hacked"},
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(patch.status_code, status.HTTP_404_NOT_FOUND)

        archive = self.client.post(
            f"/api/v1/students/{self.student_a_id}/archive/",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(archive.status_code, status.HTTP_404_NOT_FOUND)

    def test_coach_b_cannot_access_visits(self):
        visit = self.client.post(
            f"/api/v1/students/{self.student_a_id}/visits/",
            {
                "visit_date": "2026-07-01",
                "current_weight_kg": "79.0",
                "previous_weight_kg": "80.0",
                "daily_energy_level": "good",
                "sleep_quality": "medium",
                "stress_level": "low",
            },
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(visit.status_code, status.HTTP_201_CREATED)
        visit_id = visit.data["id"]

        listed = self.client.get(
            f"/api/v1/students/{self.student_a_id}/visits/",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(listed.status_code, status.HTTP_404_NOT_FOUND)

        create = self.client.post(
            f"/api/v1/students/{self.student_a_id}/visits/",
            {
                "visit_date": "2026-07-02",
                "current_weight_kg": "79.0",
                "previous_weight_kg": "80.0",
                "daily_energy_level": "good",
                "sleep_quality": "medium",
                "stress_level": "low",
            },
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(create.status_code, status.HTTP_404_NOT_FOUND)

        detail = self.client.get(
            f"/api/v1/students/{self.student_a_id}/visits/{visit_id}/",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

        patch = self.client.patch(
            f"/api/v1/students/{self.student_a_id}/visits/{visit_id}/",
            {"coach_notes": "nope"},
            format="json",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(patch.status_code, status.HTTP_404_NOT_FOUND)

        delete = self.client.delete(
            f"/api/v1/students/{self.student_a_id}/visits/{visit_id}/",
            **auth_header(self.tokens_b),
        )
        self.assertEqual(delete.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Visit.objects.filter(id=visit_id).exists())

    def test_client_cannot_assign_other_coach(self):
        other_coach_id = str(CoachProfile.objects.get(user__email="b@example.com").id)
        res = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "Owned By A",
                "age": 25,
                "gender": "female",
                "height_cm": "165.0",
                "weight_kg": "60.0",
                "phone_number": "09121110002",
                "coach": other_coach_id,
                "coach_id": other_coach_id,
                "goals": {"primary_goal": "fat_loss"},
                "training_background": {"level": "beginner"},
            },
            format="json",
            **auth_header(self.tokens_a),
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        student = Student.objects.get(id=res.data["id"])
        self.assertEqual(student.coach_id, self.coach_a.id)


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class StudentAPITests(APITestCase):
    def setUp(self):
        res = register(self.client, "stu@example.com")
        self.tokens = res.data["tokens"]
        self.auth = auth_header(self.tokens)

    def _payload(self, **overrides):
        data = {
            "full_name": "محمد طاهری",
            "age": 27,
            "gender": "male",
            "height_cm": "182.0",
            "weight_kg": "86.0",
            "phone_number": "09120000000",
            "status": "active",
            "coach_notes": "گردن درد خفیف",
            "goals": {
                "primary_goal": "hypertrophy",
                "secondary_goal": "recomp",
                "muscle_priorities": ["chest"],
                "weak_muscles": ["upper_chest"],
                "strong_muscles": ["legs"],
            },
            "injuries": {
                "has_injury": True,
                "injury_type": "mild_neck",
                "aggravating_movements": ["heavy_shoulder_press"],
                "disallowed_exercises": ["heavy_shrug"],
            },
            "equipment": {
                "has_barbell": True,
                "has_dumbbell": True,
                "has_machines": True,
                "has_cable": True,
                "has_full_gym": True,
            },
            "lifestyle": {
                "occupation": "desk",
                "sleep_quality": "ok",
                "stress_level": "medium",
                "daily_activity_level": "low",
            },
            "preferences": {
                "favorite_exercises": "bench",
                "intensity_preference": "moderate",
                "disliked_training_styles": "crossfit",
                "variety_preference": "high",
            },
            "training_background": {
                "level": "intermediate",
                "training_experience": "3y",
                "basic_movement_familiarity": "good",
                "has_free_weight_experience": True,
            },
            "training_conditions": {
                "training_days_per_week": 4,
                "session_duration_minutes": 75,
                "training_preference": "gym",
                "cardio_interest": "low",
                "heavy_training_interest": "medium",
            },
            "summary": {
                "current_program_title": "",
                "last_visit_date": None,
                "medical_note": "گردن درد خفیف",
            },
        }
        data.update(overrides)
        return data

    def test_create_retrieve_update_archive(self):
        created = self.client.post("/api/v1/students/", self._payload(), format="json", **self.auth)
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        sid = created.data["id"]
        self.assertEqual(created.data["full_name"], "محمد طاهری")
        self.assertEqual(created.data["goals"]["primary_goal"], "hypertrophy")

        detail = self.client.get(f"/api/v1/students/{sid}/", **self.auth)
        self.assertEqual(detail.status_code, status.HTTP_200_OK)

        patched = self.client.patch(
            f"/api/v1/students/{sid}/",
            {"coach_notes": "updated"},
            format="json",
            **self.auth,
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["coach_notes"], "updated")

        archived = self.client.post(f"/api/v1/students/{sid}/archive/", **self.auth)
        self.assertEqual(archived.status_code, status.HTTP_200_OK)
        self.assertEqual(archived.data["status"], "inactive")
        self.assertIsNotNone(archived.data["archived_at"])

    def test_validation_and_filters_and_pagination(self):
        bad = self.client.post(
            "/api/v1/students/",
            {"full_name": "", "age": 5, "gender": "other"},
            format="json",
            **self.auth,
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad.data["error"]["code"], "validation_error")

        self.client.post(
            "/api/v1/students/",
            self._payload(full_name="Ali", phone_number="09121110005"),
            format="json",
            **self.auth,
        )
        self.client.post(
            "/api/v1/students/",
            self._payload(
                full_name="Sara",
                phone_number="09121110006",
                goals={"primary_goal": "fat_loss"},
                training_background={"level": "beginner"},
                status="inactive",
            ),
            format="json",
            **self.auth,
        )

        search = self.client.get("/api/v1/students/?search=Ali", **self.auth)
        self.assertEqual(search.data["count"], 1)

        level = self.client.get("/api/v1/students/?level=beginner", **self.auth)
        self.assertEqual(level.data["count"], 1)

        goal = self.client.get("/api/v1/students/?goal=fat_loss", **self.auth)
        self.assertEqual(goal.data["count"], 1)

        active = self.client.get("/api/v1/students/?status=active", **self.auth)
        self.assertEqual(active.data["count"], 1)

        page = self.client.get("/api/v1/students/?limit=1&offset=0", **self.auth)
        self.assertEqual(len(page.data["results"]), 1)
        self.assertIn("count", page.data)

        empty = self.client.get("/api/v1/students/?search=nomatch", **self.auth)
        self.assertEqual(empty.data["count"], 0)

        malformed = self.client.get("/api/v1/students/not-a-uuid/", **self.auth)
        self.assertEqual(malformed.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class VisitAPITests(APITestCase):
    def setUp(self):
        res = register(self.client, "visit@example.com")
        self.tokens = res.data["tokens"]
        self.auth = auth_header(self.tokens)
        student = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "Mohammad",
                "age": 27,
                "gender": "male",
                "height_cm": "182.0",
                "weight_kg": "86.0",
                "phone_number": "09121110003",
                "goals": {"primary_goal": "hypertrophy"},
                "training_background": {"level": "intermediate"},
            },
            format="json",
            **self.auth,
        )
        self.student_id = student.data["id"]

    def _visit(self, date: str, **extra):
        payload = {
            "visit_date": date,
            "current_weight_kg": "85.5",
            "previous_weight_kg": "86.0",
            "body_fat_percentage": "18.5",
            "measurements": {"waist_cm": "84.0", "chest_cm": "102.0"},
            "adherence": {
                "overall_percent": "80",
                "training_percent": "85",
                "nutrition_percent": "75",
                "supplements_percent": "70",
            },
            "daily_energy_level": "good",
            "sleep_quality": "medium",
            "stress_level": "medium",
            "coach_notes": "ok",
        }
        payload.update(extra)
        return self.client.post(
            f"/api/v1/students/{self.student_id}/visits/",
            payload,
            format="json",
            **self.auth,
        )

    def test_visit_crud_latest_and_ordering(self):
        v1 = self._visit("2026-06-01")
        v2 = self._visit("2026-07-01")
        self.assertEqual(v1.status_code, status.HTTP_201_CREATED, v1.data)
        self.assertEqual(v2.status_code, status.HTTP_201_CREATED, v2.data)

        listed = self.client.get(f"/api/v1/students/{self.student_id}/visits/", **self.auth)
        self.assertEqual(listed.data["count"], 2)
        self.assertEqual(listed.data["results"][0]["visit_date"], "2026-07-01")

        latest = self.client.get(f"/api/v1/students/{self.student_id}/visits/latest/", **self.auth)
        self.assertEqual(latest.status_code, status.HTTP_200_OK)
        self.assertEqual(latest.data["visit_date"], "2026-07-01")

        vid = v1.data["id"]
        detail = self.client.get(f"/api/v1/students/{self.student_id}/visits/{vid}/", **self.auth)
        self.assertEqual(detail.status_code, status.HTTP_200_OK)

        patched = self.client.patch(
            f"/api/v1/students/{self.student_id}/visits/{vid}/",
            {"coach_notes": "updated visit"},
            format="json",
            **self.auth,
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["coach_notes"], "updated visit")

        deleted = self.client.delete(
            f"/api/v1/students/{self.student_id}/visits/{vid}/", **self.auth
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_duplicate_date_and_invalid_measurements(self):
        self.assertEqual(self._visit("2026-07-15").status_code, status.HTTP_201_CREATED)
        dup = self._visit("2026-07-15")
        self.assertEqual(dup.status_code, status.HTTP_409_CONFLICT)

        bad = self._visit("2026-08-01", body_fat_percentage="150")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_latest_when_empty_and_mismatch(self):
        empty = self.client.get(f"/api/v1/students/{self.student_id}/visits/latest/", **self.auth)
        self.assertEqual(empty.status_code, status.HTTP_404_NOT_FOUND)

        other = register(self.client, "other-visit@example.com")
        other_auth = auth_header(other.data["tokens"])
        other_student = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "Other",
                "age": 30,
                "gender": "male",
                "height_cm": "175.0",
                "weight_kg": "75.0",
                "phone_number": "09121110004",
                "goals": {"primary_goal": "strength"},
                "training_background": {"level": "advanced"},
            },
            format="json",
            **other_auth,
        ).data["id"]
        visit = self._visit("2026-07-20")
        mismatch = self.client.get(
            f"/api/v1/students/{other_student}/visits/{visit.data['id']}/",
            **other_auth,
        )
        self.assertEqual(mismatch.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class ErrorContractTests(APITestCase):
    def test_unauthenticated_error_shape(self):
        res = self.client.get("/api/v1/students/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("error", res.data)
        self.assertIn("code", res.data["error"])
        self.assertIn("message", res.data["error"])

    def test_malformed_json(self):
        register(self.client, "json@example.com")
        from rest_framework.test import APIClient

        client = APIClient()
        login = client.post(
            "/api/v1/auth/login/",
            {"email": "json@example.com", "password": "SecurePass123!"},
            format="json",
        )
        token = login.data["tokens"]["access"]
        res = client.generic(
            "POST",
            "/api/v1/students/",
            data="{bad",
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_not_found_error_shape(self):
        res = register(self.client, "nf@example.com")
        tokens = res.data["tokens"]
        missing = self.client.get(
            "/api/v1/students/11111111-1111-1111-1111-111111111111/",
            **auth_header(tokens),
        )
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(missing.data["error"]["code"], "not_found")

    def test_legacy_anonymous_api_unmounted(self):
        """Prototype /api/ product CRUD must not be publicly reachable."""
        for path in (
            "/api/coaches/",
            "/api/students/",
            "/api/programs/",
            "/api/programs/generate/",
        ):
            res = self.client.get(path)
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND, path)

    def test_cors_allows_configured_frontend_origin(self):
        """django-cors-headers must be configured for the Vite SPA origin."""
        res = self.client.options(
            "/api/v1/me/",
            HTTP_ORIGIN="http://localhost:5173",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        )
        self.assertIn(res.status_code, {200, 204})
        self.assertEqual(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173")

        denied = self.client.options(
            "/api/v1/me/",
            HTTP_ORIGIN="http://evil.example",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        )
        self.assertNotEqual(
            denied.headers.get("Access-Control-Allow-Origin"), "http://evil.example"
        )
