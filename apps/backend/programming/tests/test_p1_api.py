from __future__ import annotations

from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import ProgramTemplate
from accounts.rules_services import replace_coach_rules
from common.testing import auth_header, register
from students.models import Student

MIN_RULES = {
    "templates": [
        {
            "name": "۴ روزه حجم متوسط",
            "goal": "افزایش حجم",
            "main_goal": "حجم",
            "level": "intermediate",
            "days_per_week": 4,
            "intensity": "متوسط",
            "volume": "متوسط",
            "rest_time": "۹۰ ثانیه",
            "split": ["سینه و پشت بازو", "زیربغل و جلو بازو", "پا", "سرشانه و شکم"],
            "muscle_priority_order": ["سینه", "زیربغل", "پا", "سرشانه"],
            "special_rules": ["حجم عضله ضعیف بیشتر شود"],
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "levels": [
        {
            "id": "beginner",
            "intensity": "سبک",
            "volume": "۲ ست",
            "allowed_techniques": ["ساده"],
            "forbidden_exercises": ["حرکت تا ناتوانی"],
            "required_exercises": ["دستگاه"],
            "coach_notes": "",
        },
        {
            "id": "intermediate",
            "intensity": "متوسط رو به سنگین",
            "volume": "۳ تا ۴ ست",
            "allowed_techniques": ["سوپرست"],
            "forbidden_exercises": [],
            "required_exercises": ["پایه"],
            "coach_notes": "",
        },
        {
            "id": "advanced",
            "intensity": "سنگین",
            "volume": "۴ تا ۵ ست",
            "allowed_techniques": ["دراپ ست"],
            "forbidden_exercises": [],
            "required_exercises": ["چندمفصلی"],
            "coach_notes": "",
        },
    ],
    "injuries": [
        {
            "name": "گردن درد",
            "forbidden_exercises": ["پرس سرشانه سنگین", "شراگ سنگین"],
            "alternatives": ["نشر جانب سبک"],
            "notes": "",
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "muscle_priorities": [
        {
            "muscle": "سینه",
            "extra_exercises": 1,
            "extra_sets": 2,
            "order_change": "ابتدای جلسه",
            "notes": "",
            "sort_order": 0,
        }
    ],
    "exercise_bank": [
        {
            "group": "سینه",
            "favorite_exercises": ["پرس سینه هالتر", "پرس بالا سینه دمبل", "کراس اور"],
            "beginner_friendly": ["پرس سینه دستگاه"],
            "professional_friendly": ["پرس سینه هالتر"],
            "forbidden_exercises": [],
            "sort_order": 0,
        },
        {
            "group": "زیربغل",
            "favorite_exercises": ["لت سیم کش", "روئینگ هالتر"],
            "beginner_friendly": ["لت سیم کش"],
            "professional_friendly": ["بارفیکس"],
            "forbidden_exercises": ["شراگ سنگین برای گردن درد"],
            "sort_order": 1,
        },
        {
            "group": "پا",
            "favorite_exercises": ["اسکوات", "پرس پا"],
            "beginner_friendly": ["پرس پا"],
            "professional_friendly": ["اسکوات"],
            "forbidden_exercises": [],
            "sort_order": 2,
        },
        {
            "group": "سرشانه",
            "favorite_exercises": ["نشر جانب دمبل", "پرس سرشانه دستگاه"],
            "beginner_friendly": ["نشر جانب دمبل"],
            "professional_friendly": ["پرس سرشانه دستگاه"],
            "forbidden_exercises": [],
            "sort_order": 3,
        },
    ],
    "general_rules": {
        "extra_notes": "یادداشت عمومی",
        "items": [
            {
                "title": "حرکات اصلی اول برنامه باشند",
                "description": "چندمفصلی اول",
                "category": "ترتیب تمرین",
                "importance": "high",
                "is_active": True,
                "order": 1,
            },
            {
                "title": "شکم آخر جلسه",
                "description": "شکم آخر",
                "category": "ترتیب تمرین",
                "importance": "low",
                "is_active": True,
                "order": 2,
            },
        ],
    },
}


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class CoachRulesApiTests(APITestCase):
    def setUp(self):
        a = register(self.client, "coach-a@example.com", full_name="Coach A")
        b = register(self.client, "coach-b@example.com", full_name="Coach B")
        self.tokens_a = a.data["tokens"]
        self.tokens_b = b.data["tokens"]
        self.coach_a_id = a.data["coach"]["id"]

    def test_empty_rules_default(self):
        res = self.client.get("/api/v1/coach-rules/", **auth_header(self.tokens_a))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["templates"], [])
        self.assertEqual(res.data["levels"], [])
        self.assertIn("general_rules", res.data)

    def test_put_aggregate_idempotent(self):
        h = auth_header(self.tokens_a)
        first = self.client.put("/api/v1/coach-rules/", MIN_RULES, format="json", **h)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.data["templates"]), 1)
        self.assertEqual(len(first.data["injuries"]), 1)
        second = self.client.put("/api/v1/coach-rules/", MIN_RULES, format="json", **h)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len(second.data["templates"]), 1)
        self.assertEqual(first.data["templates"][0]["name"], second.data["templates"][0]["name"])

    def test_coach_isolation_rules(self):
        self.client.put(
            "/api/v1/coach-rules/", MIN_RULES, format="json", **auth_header(self.tokens_a)
        )
        res_b = self.client.get("/api/v1/coach-rules/", **auth_header(self.tokens_b))
        self.assertEqual(res_b.status_code, 200)
        self.assertEqual(res_b.data["templates"], [])

    def test_template_crud_and_validation(self):
        h = auth_header(self.tokens_a)
        bad = self.client.post(
            "/api/v1/program-templates/",
            {
                "name": "Bad",
                "level": "intermediate",
                "days_per_week": 3,
                "split": ["A", "B"],
            },
            format="json",
            **h,
        )
        self.assertEqual(bad.status_code, 400)

        ok = self.client.post(
            "/api/v1/program-templates/",
            {
                "name": "۳ روزه",
                "level": "beginner",
                "days_per_week": 3,
                "split": ["A", "B", "C"],
                "goal": "فرم",
            },
            format="json",
            **h,
        )
        self.assertEqual(ok.status_code, 201)
        tid = ok.data["id"]
        patch = self.client.patch(
            f"/api/v1/program-templates/{tid}/",
            {"name": "۳ روزه به‌روز"},
            format="json",
            **h,
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data["name"], "۳ روزه به‌روز")

        # Coach B cannot see
        other = self.client.get(f"/api/v1/program-templates/{tid}/", **auth_header(self.tokens_b))
        self.assertEqual(other.status_code, 404)

        delete = self.client.delete(f"/api/v1/program-templates/{tid}/", **h)
        self.assertEqual(delete.status_code, 204)
        archived = ProgramTemplate.objects.get(pk=tid)
        self.assertTrue(archived.is_archived)

    def test_exercise_crud_search_archive(self):
        h = auth_header(self.tokens_a)
        created = self.client.post(
            "/api/v1/exercises/",
            {
                "name": "پرس سینه هالتر",
                "primary_muscle": "سینه",
                "is_preferred": True,
            },
            format="json",
            **h,
        )
        self.assertEqual(created.status_code, 201)
        eid = created.data["id"]
        search = self.client.get("/api/v1/exercises/?search=سینه", **h)
        self.assertEqual(search.status_code, 200)
        self.assertGreaterEqual(search.data["count"], 1)
        delete = self.client.delete(f"/api/v1/exercises/{eid}/", **h)
        self.assertEqual(delete.status_code, 204)
        listed = self.client.get("/api/v1/exercises/", **h)
        ids = [x["id"] for x in listed.data["results"]]
        self.assertNotIn(eid, ids)
        with_arch = self.client.get("/api/v1/exercises/?include_archived=true", **h)
        ids2 = [x["id"] for x in with_arch.data["results"]]
        self.assertIn(eid, ids2)

    def test_unauthenticated_rules(self):
        res = self.client.get("/api/v1/coach-rules/")
        self.assertEqual(res.status_code, 401)


@override_settings(PUBLIC_REGISTRATION_ENABLED=True)
class ProgramAndGeneratorTests(APITestCase):
    def setUp(self):
        a = register(self.client, "gen-a@example.com", full_name="Gen A")
        b = register(self.client, "gen-b@example.com", full_name="Gen B")
        self.tokens_a = a.data["tokens"]
        self.tokens_b = b.data["tokens"]
        self.h = auth_header(self.tokens_a)
        self.hb = auth_header(self.tokens_b)

        from accounts.models import CoachProfile

        self.coach_a = CoachProfile.objects.get(id=a.data["coach"]["id"])
        replace_coach_rules(self.coach_a, MIN_RULES, partial=False)
        self.template = ProgramTemplate.objects.filter(coach=self.coach_a).first()

        stu = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "محمد طاهری",
                "age": 27,
                "gender": "male",
                "height_cm": "182.0",
                "weight_kg": "86.0",
                "phone_number": "09123110001",
                "goals": {
                    "primary_goal": "hypertrophy",
                    "muscle_priorities": ["chest"],
                    "weak_muscles": ["chest"],
                },
                "injuries": {
                    "has_injury": True,
                    "injury_type": "mild_neck",
                    "aggravating_movements": ["heavy_shoulder_press"],
                    "disallowed_exercises": ["heavy_shrug"],
                },
                "training_background": {"level": "intermediate"},
                "training_conditions": {"training_days_per_week": 4},
            },
            format="json",
            **self.h,
        )
        self.assertEqual(stu.status_code, 201)
        self.student_id = stu.data["id"]
        visit = self.client.post(
            f"/api/v1/students/{self.student_id}/visits/",
            {
                "visit_date": "2026-07-15",
                "current_weight_kg": "85.5",
                "previous_weight_kg": "86.0",
                "daily_energy_level": "good",
                "sleep_quality": "medium",
                "stress_level": "medium",
            },
            format="json",
            **self.h,
        )
        self.assertEqual(visit.status_code, 201)

    def test_generate_draft_and_deterministic(self):
        payload = {
            "student_id": self.student_id,
            "template_id": str(self.template.id),
            "program_type": "complete",
            "level": "intermediate",
            "days_per_week": 4,
            "title": "برنامه تست",
        }
        r1 = self.client.post("/api/v1/programs/generate/", payload, format="json", **self.h)
        self.assertEqual(r1.status_code, 201, r1.data)
        r2 = self.client.post("/api/v1/programs/generate/", payload, format="json", **self.h)
        self.assertEqual(r2.status_code, 201)
        days1 = r1.data["program"]["training"]["days"]
        days2 = r2.data["program"]["training"]["days"]
        names1 = [[e["name"] for e in d["exercises"]] for d in days1]
        names2 = [[e["name"] for e in d["exercises"]] for d in days2]
        self.assertEqual(names1, names2)
        self.assertEqual(len(days1), 4)
        self.assertEqual(days1[0]["title"], "سینه و پشت بازو")
        # Neck injury exclusions
        all_names = [e["name"] for d in days1 for e in d["exercises"]]
        self.assertNotIn("پرس سرشانه سنگین", all_names)
        self.assertNotIn("شراگ سنگین", all_names)
        # Weak chest receives additional volume (base intermediate 3 + priority bonus)
        chest_exercises = [
            e for d in days1 for e in d["exercises"] if e.get("targetMuscle") == "سینه"
        ]
        self.assertTrue(chest_exercises)
        self.assertTrue(any(e["sets"] >= 4 for e in chest_exercises))
        self.assertEqual(r1.data["generator_version"], "rules_v1")
        self.assertTrue(r1.data["generation_run_id"])
        # Snapshot stored
        from programming.models import GenerationRun

        run = GenerationRun.objects.get(pk=r1.data["generation_run_id"])
        self.assertEqual(run.status, "succeeded")
        self.assertIn("rules_digest", run.input_snapshot)
        self.assertEqual(run.engine, "rules_v1")

    def test_draft_update_finalize_immutable_new_version_duplicate(self):
        gen = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": self.student_id,
                "template_id": str(self.template.id),
                "program_type": "complete",
                "title": "نسخه‌بندی",
            },
            format="json",
            **self.h,
        )
        program_id = gen.data["program"]["id"]
        draft_id = gen.data["program"]["current_draft"]["id"]

        patch = self.client.patch(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/",
            {"training": {"summary": "ویرایش", "days": gen.data["program"]["training"]["days"]}},
            format="json",
            **self.h,
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data["training"]["summary"], "ویرایش")

        fin = self.client.post(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/finalize/",
            {},
            format="json",
            **self.h,
        )
        self.assertEqual(fin.status_code, 200)
        self.assertEqual(fin.data["status"], "finalized")
        # Idempotent finalize
        fin2 = self.client.post(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/finalize/",
            {},
            format="json",
            **self.h,
        )
        self.assertEqual(fin2.status_code, 200)

        # Cannot mutate finalized training content
        bad = self.client.patch(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/",
            {"training": {"summary": "hack", "days": []}},
            format="json",
            **self.h,
        )
        self.assertEqual(bad.status_code, 400)
        self.assertIn(bad.data["error"]["code"], {"invalid_state_transition", "immutable_version"})

        # PDF include flags remain editable on finalized versions
        pdf_patch = self.client.patch(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/",
            {"pdf_settings": {"includeNutrition": False, "includeSupplements": False}},
            format="json",
            **self.h,
        )
        self.assertEqual(pdf_patch.status_code, 200)
        self.assertFalse(pdf_patch.data["pdf_settings"]["includeNutrition"])
        self.assertFalse(pdf_patch.data["pdf_settings"]["includeSupplements"])

        # Historical detail immutable content
        hist = self.client.get(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/",
            **self.h,
        )
        self.assertEqual(hist.data["training"]["summary"], "ویرایش")

        # New version same lineage
        nv = self.client.post(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/new-version/",
            {},
            format="json",
            **self.h,
        )
        self.assertEqual(nv.status_code, 201)
        self.assertEqual(nv.data["id"], program_id)
        self.assertEqual(nv.data["current_draft"]["version_number"], 2)
        self.assertEqual(nv.data["current_draft"]["status"], "draft")
        new_draft_id = nv.data["current_draft"]["id"]

        # Duplicate new lineage
        dup = self.client.post(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/duplicate/",
            {},
            format="json",
            **self.h,
        )
        self.assertEqual(dup.status_code, 201)
        self.assertNotEqual(dup.data["id"], program_id)
        self.assertEqual(dup.data["current_draft"]["version_number"], 1)
        self.assertEqual(
            dup.data["provenance"]["copied_from_program_id"],
            program_id,
        )
        # Deep copy: mutate duplicate does not change original finalized
        self.client.patch(
            f"/api/v1/programs/{dup.data['id']}/versions/{dup.data['current_draft']['id']}/",
            {"training": {"summary": "dup-only", "days": []}},
            format="json",
            **self.h,
        )
        orig = self.client.get(
            f"/api/v1/programs/{program_id}/versions/{draft_id}/",
            **self.h,
        )
        self.assertEqual(orig.data["training"]["summary"], "ویرایش")

        # Archive + list filters + student history
        arch = self.client.post(
            f"/api/v1/programs/{program_id}/archive/", {}, format="json", **self.h
        )
        self.assertEqual(arch.status_code, 200)
        self.assertEqual(arch.data["status"], "archived")
        listed = self.client.get("/api/v1/programs/?search=نسخه", **self.h)
        self.assertEqual(listed.status_code, 200)
        hist_list = self.client.get(f"/api/v1/students/{self.student_id}/programs/", **self.h)
        self.assertGreaterEqual(hist_list.data["count"], 2)

        # Empty list for coach B
        empty = self.client.get("/api/v1/programs/", **self.hb)
        self.assertEqual(empty.data["count"], 0)

        # Malformed id
        bad_id = self.client.get("/api/v1/programs/not-a-uuid/", **self.h)
        self.assertIn(bad_id.status_code, {404, 400})

        # Versions list
        versions = self.client.get(f"/api/v1/programs/{dup.data['id']}/versions/", **self.h)
        self.assertEqual(versions.status_code, 200)
        self.assertGreaterEqual(len(versions.data), 1)

        # Touch new_draft_id to ensure accessible
        self.assertTrue(new_draft_id)

    def test_ownership_matrix(self):
        gen = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": self.student_id,
                "template_id": str(self.template.id),
                "title": "مالکیت",
            },
            format="json",
            **self.h,
        )
        program_id = gen.data["program"]["id"]
        version_id = gen.data["program"]["current_draft"]["id"]

        # Coach B cannot access rules content of A via templates
        t = self.client.get(f"/api/v1/program-templates/{self.template.id}/", **self.hb)
        self.assertEqual(t.status_code, 404)

        for method, url in [
            ("get", f"/api/v1/programs/{program_id}/"),
            ("patch", f"/api/v1/programs/{program_id}/"),
            ("post", f"/api/v1/programs/{program_id}/versions/{version_id}/finalize/"),
            ("post", f"/api/v1/programs/{program_id}/versions/{version_id}/duplicate/"),
            ("post", f"/api/v1/programs/{program_id}/versions/{version_id}/new-version/"),
            ("get", f"/api/v1/programs/{program_id}/versions/{version_id}/"),
            ("get", f"/api/v1/students/{self.student_id}/programs/"),
        ]:
            if method == "get":
                res = self.client.get(url, **self.hb)
            elif method == "patch":
                res = self.client.patch(url, {"title": "x"}, format="json", **self.hb)
            else:
                res = self.client.post(url, {}, format="json", **self.hb)
            self.assertEqual(res.status_code, 404, url)

        # Generate with cross-coach student/template
        cross = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": self.student_id,
                "template_id": str(self.template.id),
            },
            format="json",
            **self.hb,
        )
        self.assertEqual(cross.status_code, 404)

    def test_archived_student_and_template_rejected(self):
        self.client.post(
            f"/api/v1/students/{self.student_id}/archive/", {}, format="json", **self.h
        )
        res = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": self.student_id,
                "template_id": str(self.template.id),
            },
            format="json",
            **self.h,
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"]["code"], "archived_student")

        # Restore student for template test via ORM
        Student.objects.filter(pk=self.student_id).update(archived_at=None, status="active")
        self.template.is_archived = True
        self.template.is_active = False
        self.template.save()
        res2 = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": self.student_id,
                "template_id": str(self.template.id),
            },
            format="json",
            **self.h,
        )
        self.assertEqual(res2.status_code, 400)
        self.assertEqual(res2.data["error"]["code"], "archived_template")

    def test_incompatible_template_and_missing_visit_warning(self):
        # Create student without visit
        stu = self.client.post(
            "/api/v1/students/",
            {
                "full_name": "بدون ویزیت",
                "age": 25,
                "gender": "male",
                "height_cm": "175.0",
                "weight_kg": "70.0",
                "phone_number": "09123110002",
                "goals": {
                    "primary_goal": "hypertrophy",
                    "weak_muscles": [],
                    "muscle_priorities": [],
                },
                "injuries": {"has_injury": False},
                "training_background": {"level": "beginner"},
            },
            format="json",
            **self.h,
        )
        res = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": stu.data["id"],
                "template_id": str(self.template.id),
                "title": "بدون ویزیت",
            },
            format="json",
            **self.h,
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn("missing_latest_visit", res.data["warnings"])

        # require_level_match incompatibility
        res2 = self.client.post(
            "/api/v1/programs/generate/",
            {
                "student_id": stu.data["id"],
                "template_id": str(self.template.id),
                "level": "beginner",
                "require_level_match": True,
            },
            format="json",
            **self.h,
        )
        self.assertEqual(res2.status_code, 400)

    def test_legacy_anonymous_api_still_gone(self):
        res = self.client.get("/api/")
        self.assertEqual(res.status_code, 404)
        res2 = self.client.get("/api/students/")
        self.assertEqual(res2.status_code, 404)

    def test_malformed_json(self):
        res = self.client.generic(
            "POST",
            "/api/v1/programs/generate/",
            data="{not-json",
            content_type="application/json",
            **self.h,
        )
        self.assertEqual(res.status_code, 400)
