"""Tests for coach visit form templates and unified Visit + generator integration."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import CoachProfile, ProgramTemplate
from accounts.rules_services import ensure_rule_set, replace_coach_rules
from accounts.visit_form_fixtures import ARMAN_VISIT_FORM_TEMPLATE, MINIMAL_VISIT_FORM_TEMPLATE
from programming.services.assessment_context import (
    build_generation_context_from_visit,
    extract_semantic_answers,
    merge_student_with_assessment,
)
from programming.services.generator import generate_document
from programming.services.style_calibration import load_style_profile
from students.models import Student, Visit
from students.services import create_visit, update_visit
from students.visit_form_models import CoachVisitFormTemplate
from students.visit_form_services import (
    create_template,
    duplicate_template,
    ensure_visit_form_from_fixture,
    send_visit_to_student,
    serialize_visit_for_student,
    set_default_template,
)

User = get_user_model()

MIN_RULES = {
    "templates": [
        {
            "name": "۴ روزه حجم متوسط",
            "goal": "hypertrophy",
            "main_goal": "hypertrophy",
            "level": "intermediate",
            "days_per_week": 4,
            "intensity": "متوسط",
            "volume": "متوسط",
            "rest_time": "۹۰",
            "split": ["سینه و پشت بازو", "زیربغل و جلو بازو", "پا", "سرشانه و شکم"],
            "muscle_priority_order": ["سینه", "زیربغل", "پا", "سرشانه"],
            "special_rules": [],
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "levels": [
        {
            "id": "intermediate",
            "intensity": "متوسط",
            "volume": "۳ ست",
            "allowed_techniques": ["سوپرست محدود"],
            "forbidden_exercises": [],
            "required_exercises": [],
            "coach_notes": "",
        }
    ],
    "injuries": [
        {
            "name": "گردن درد",
            "forbidden_exercises": ["پرس سرشانه سنگین", "شراگ سنگین"],
            "alternatives": ["نشر جانب دمبل"],
            "notes": "",
            "is_active": True,
            "sort_order": 0,
        }
    ],
    "muscle_priorities": [],
    "exercise_bank": [],
    "general_rules": {"extra_notes": "", "items": []},
}


def _make_coach(email: str, name: str) -> CoachProfile:
    user = User.objects.create_user(username=email, email=email, password="Test1234!")
    return CoachProfile.objects.create(user=user, display_name=name)


def _make_student(coach: CoachProfile, name: str = "Test Athlete") -> Student:
    return Student.objects.create(
        coach=coach,
        full_name=name,
        age=25,
        gender=Student.Gender.MALE,
        height_cm=Decimal("175.0"),
        weight_kg=Decimal("75.0"),
        goals={"primary_goal": "hypertrophy", "weak_muscles": [], "strong_muscles": []},
        injuries={"has_injury": False},
        training_background={"level": "intermediate"},
        training_conditions={"training_days_per_week": 4},
        equipment={"has_full_gym": True},
    )


def _core_visit_payload(**extra):
    base = {
        "visit_date": "2026-08-01",
        "current_weight_kg": "75.0",
        "previous_weight_kg": "74.0",
        "daily_energy_level": "good",
        "sleep_quality": "good",
        "stress_level": "medium",
    }
    base.update(extra)
    return base


class VisitFormTemplateTests(TestCase):
    def setUp(self):
        self.coach_a = _make_coach("a@example.com", "Coach A")
        self.coach_b = _make_coach("b@example.com", "Coach B")
        self.tpl_a, _ = ensure_visit_form_from_fixture(self.coach_a, ARMAN_VISIT_FORM_TEMPLATE)
        self.tpl_b, _ = ensure_visit_form_from_fixture(self.coach_b, MINIMAL_VISIT_FORM_TEMPLATE)
        self.client = APIClient()

    def test_multiple_templates_and_single_default(self):
        second = create_template(
            self.coach_a,
            {
                "key": "followup",
                "name": "ویزیت کوتاه",
                "sections": MINIMAL_VISIT_FORM_TEMPLATE["sections"],
                "is_default": True,
            },
        )
        self.tpl_a.refresh_from_db()
        self.assertTrue(second.is_default)
        self.assertFalse(self.tpl_a.is_default)
        set_default_template(self.coach_a, self.tpl_a)
        second.refresh_from_db()
        self.tpl_a.refresh_from_db()
        self.assertTrue(self.tpl_a.is_default)
        self.assertFalse(second.is_default)
        self.assertEqual(
            CoachVisitFormTemplate.objects.filter(coach=self.coach_a, is_default=True).count(),
            1,
        )

    def test_coaches_have_different_templates(self):
        keys_a = {f["key"] for s in self.tpl_a.sections for f in s.get("fields") or []}
        keys_b = {f["key"] for s in self.tpl_b.sections for f in s.get("fields") or []}
        self.assertIn("muscle_detail.chest.upper", keys_a)
        self.assertNotIn("muscle_detail.chest.upper", keys_b)
        self.assertLess(len(keys_b), len(keys_a) // 2)

    def test_coach_cannot_edit_other_coach_template(self):
        self.client.force_authenticate(user=self.coach_b.user)
        resp = self.client.patch(
            f"/api/v1/visit-form-templates/{self.tpl_a.id}/",
            {"name": "hijacked"},
            format="json",
        )
        self.assertIn(resp.status_code, {403, 404})
        self.tpl_a.refresh_from_db()
        self.assertNotEqual(self.tpl_a.name, "hijacked")

    def test_duplicate_template(self):
        dup = duplicate_template(self.coach_a, self.tpl_a)
        self.assertNotEqual(dup.id, self.tpl_a.id)
        self.assertEqual(dup.coach_id, self.coach_a.id)
        self.assertFalse(dup.is_default)


class VisitCreateWithTemplateTests(TestCase):
    def setUp(self):
        self.coach = _make_coach("visit@example.com", "Visit Coach")
        self.student = _make_student(self.coach)
        self.default, _ = ensure_visit_form_from_fixture(self.coach, ARMAN_VISIT_FORM_TEMPLATE)
        self.other = create_template(
            self.coach,
            {
                "key": "short",
                "name": "Short",
                "sections": MINIMAL_VISIT_FORM_TEMPLATE["sections"],
                "is_default": False,
            },
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach.user)

    def test_new_visit_selects_default_template(self):
        visit = create_visit(self.coach, self.student, _core_visit_payload())
        self.assertEqual(str(visit.form_template_id), str(self.default.id))
        self.assertEqual(visit.form_template_key, "arman_visit_v1")
        self.assertEqual(visit.status, Visit.Status.DRAFT)
        self.assertTrue(visit.form_template_snapshot.get("sections"))

    def test_coach_can_select_non_default_template(self):
        visit = create_visit(
            self.coach,
            self.student,
            _core_visit_payload(form_template_id=str(self.other.id), answers={"goal": "fat_loss"}),
        )
        self.assertEqual(str(visit.form_template_id), str(self.other.id))
        self.assertEqual(visit.answers.get("goal"), "fat_loss")

    def test_answers_persist_and_snapshot_stable(self):
        visit = create_visit(
            self.coach,
            self.student,
            _core_visit_payload(
                answers={"goal": "hypertrophy", "weak_muscles": ["chest"]},
                coach_private_notes="secret",
            ),
        )
        old_version = visit.form_template_version
        old_snap_name = (visit.form_template_snapshot or {}).get("name")
        self.default.name = "Renamed Live Template"
        self.default.version = old_version + 5
        self.default.save(update_fields=["name", "version", "updated_at"])
        visit.refresh_from_db()
        self.assertEqual(visit.form_template_version, old_version)
        self.assertEqual((visit.form_template_snapshot or {}).get("name"), old_snap_name)
        self.assertEqual(visit.coach_private_notes, "secret")

    def test_status_student_submitted_then_finalized(self):
        from students import visit_form_services as vfs

        visit = create_visit(self.coach, self.student, _core_visit_payload())
        visit = vfs.send_visit_to_student(visit)
        self.assertEqual(visit.status, Visit.Status.WAITING_FOR_STUDENT)
        self.assertIsNotNone(visit.sent_at)
        self.assertIsNotNone(visit.expires_at)
        visit = vfs.student_submit_visit(visit, actor=None)
        self.assertEqual(visit.status, Visit.Status.STUDENT_SUBMITTED)
        self.assertIsNotNone(visit.submitted_by_student_at)
        with self.assertRaises(Exception):
            update_visit(visit, {"answers": {"goal": "ok"}}, actor=self.coach.user)
        visit = vfs.start_coach_review(visit, actor=self.coach.user)
        self.assertEqual(visit.status, Visit.Status.COACH_REVIEW)
        visit = update_visit(visit, {"answers": {"goal": "ok"}}, actor=self.coach.user)
        visit = vfs.finalize_visit(visit, actor=self.coach.user)
        self.assertEqual(visit.status, Visit.Status.FINALIZED)
        self.assertIsNotNone(visit.finalized_at)

    def test_core_only_visit_without_template(self):
        visit = create_visit(
            self.coach,
            self.student,
            _core_visit_payload(visit_date="2026-08-02", skip_form_template=True),
        )
        self.assertIsNone(visit.form_template_id)
        self.assertEqual(visit.answers, {})


class StudentVisibilityTests(TestCase):
    def test_coach_only_fields_hidden_from_student_serializer(self):
        coach = _make_coach("vis@example.com", "Vis")
        student = _make_student(coach)
        tpl, _ = ensure_visit_form_from_fixture(coach, ARMAN_VISIT_FORM_TEMPLATE)
        visit = create_visit(
            coach,
            student,
            _core_visit_payload(
                form_template_id=str(tpl.id),
                answers={
                    "weight_kg": 76,
                    "goal": "hypertrophy",
                    "muscle_detail.chest.upper": "weak",
                    "coach_notes_general": "private observation",
                },
                coach_private_notes="do not show student",
                coach_notes="legacy private",
                coach_assessment="internal",
            ),
        )
        data = serialize_visit_for_student(visit)
        self.assertNotIn("coach_private_notes", data)
        self.assertNotIn("coach_notes", data)
        self.assertNotIn("coach_assessment", data)
        self.assertIn("weight_kg", data["answers"])
        self.assertIn("goal", data["answers"])
        self.assertNotIn("muscle_detail.chest.upper", data["answers"])
        self.assertNotIn("coach_notes_general", data["answers"])
        # Draft visits are not open for student edits.
        self.assertEqual(data.get("student_editable_fields"), [])

        send_visit_to_student(visit)
        open_data = serialize_visit_for_student(visit)
        self.assertTrue(open_data.get("student_editable_fields"))
        self.assertIn("weight_kg", open_data["student_editable_fields"])


class VisitFormGeneratorTests(TestCase):
    def setUp(self):
        self.coach = _make_coach("gen@example.com", "Gen Coach")
        ensure_rule_set(self.coach)
        replace_coach_rules(self.coach, MIN_RULES, partial=False)
        self.template = ProgramTemplate.objects.filter(coach=self.coach).first()
        self.student = _make_student(self.coach)
        self.tpl, _ = ensure_visit_form_from_fixture(self.coach, ARMAN_VISIT_FORM_TEMPLATE)

    def test_generator_works_without_visit_answers(self):
        doc, warnings = generate_document(
            coach=self.coach,
            student=self.student,
            visit=None,
            template=self.template,
            request={"level": "intermediate", "program_type": "workout"},
        )
        self.assertEqual(doc["generator"]["version"], "rules_v1")
        self.assertFalse(doc["generator"]["evidence"]["assessment"]["applied"])
        self.assertTrue(doc["training"]["days"])

    def test_generator_uses_unified_visit_context(self):
        visit = create_visit(
            self.coach,
            self.student,
            _core_visit_payload(
                answers={"goal": "hypertrophy", "weak_muscles": ["chest"]},
            ),
        )
        doc, _ = generate_document(
            coach=self.coach,
            student=self.student,
            visit=visit,
            template=self.template,
            request={"level": "intermediate", "program_type": "workout"},
        )
        evidence = doc["generator"]["evidence"]
        self.assertTrue(evidence["visit_form"]["applied"])
        self.assertEqual(evidence["visit_form"]["template_key"], "arman_visit_v1")
        self.assertIn("goal", evidence["visit_form"]["overrides"])

    def test_detailed_weak_muscle_reaches_evidence(self):
        visit = create_visit(
            self.coach,
            self.student,
            _core_visit_payload(
                answers={
                    "weak_muscles": ["chest"],
                    "muscle_detail.chest.upper": "weak",
                    "muscle_detail.chest.inner": "average",
                },
            ),
        )
        doc, _ = generate_document(
            coach=self.coach,
            student=self.student,
            visit=visit,
            template=self.template,
            request={"program_type": "workout"},
        )
        evidence = doc["generator"]["evidence"]
        weak = " ".join(str(x) for x in (evidence["weak_muscles"] or []))
        self.assertTrue("chest" in weak or "سینه" in weak)
        detail = evidence["visit_form"]["muscle_detail"]
        self.assertEqual(detail["chest"]["upper"], "weak")

    def test_custom_fields_do_not_alter_generation(self):
        visit = create_visit(
            self.coach,
            self.student,
            _core_visit_payload(
                answers={
                    "goal": "hypertrophy",
                    "coach_secret_note": "blood test weird — ignore for engine",
                    "current_medications": "something medical",
                },
            ),
        )
        ctx = build_generation_context_from_visit(visit)
        self.assertNotIn("coach_secret_note", ctx["executable"])
        self.assertIn("medications", ctx["advisory"] or {"medications": True})
        doc = generate_document(
            coach=self.coach,
            student=self.student,
            visit=visit,
            template=self.template,
            request={"program_type": "workout", "level": "intermediate"},
        )[0]
        self.assertIn("medications", doc["generator"]["evidence"]["visit_form"]["advisory_keys"])


class StyleProfileIsolationTests(TestCase):
    def test_same_capability_different_coaches(self):
        coach_a = _make_coach("style-a@example.com", "Style A")
        coach_b = _make_coach("style-b@example.com", "Style B")
        for coach in (coach_a, coach_b):
            ensure_rule_set(coach)
            replace_coach_rules(coach, MIN_RULES, partial=False)
        ra = ensure_rule_set(coach_a)
        rb = ensure_rule_set(coach_b)
        ra.style_profile = {
            "session_sets": {"کم": 10, "متوسط": 12, "زیاد": 14},
            "source": "coach_a_config",
        }
        ra.save(update_fields=["style_profile", "updated_at"])
        rb.style_profile = {
            "session_sets": {"کم": 20, "متوسط": 24, "زیاد": 28},
            "source": "coach_b_config",
        }
        rb.save(update_fields=["style_profile", "updated_at"])

        self.assertEqual(load_style_profile(coach_a)["session_sets"]["متوسط"], 12)
        self.assertEqual(load_style_profile(coach_b)["session_sets"]["متوسط"], 24)

        student_a = _make_student(coach_a)
        student_a.injuries = {"has_injury": True, "injury_type": "mild_neck"}
        student_a.save()
        student_b = _make_student(coach_b, "Athlete B")
        student_b.injuries = {"has_injury": True, "injury_type": "mild_neck"}
        student_b.save()

        tpl_a = ProgramTemplate.objects.filter(coach=coach_a).first()
        tpl_b = ProgramTemplate.objects.filter(coach=coach_b).first()
        doc_a, _ = generate_document(
            coach=coach_a,
            student=student_a,
            visit=None,
            template=tpl_a,
            request={"program_type": "workout"},
        )
        doc_b, _ = generate_document(
            coach=coach_b,
            student=student_b,
            visit=None,
            template=tpl_b,
            request={"program_type": "workout"},
        )
        names_a = {r["name"] for r in doc_a["generator"]["evidence"]["injury_rules_applied"]}
        names_b = {r["name"] for r in doc_b["generator"]["evidence"]["injury_rules_applied"]}
        self.assertEqual(names_a, names_b)
        self.assertIn("گردن درد", names_a)


class SeedVisitFormCreateOnlyTests(TestCase):
    def test_seed_twice_does_not_duplicate_or_overwrite(self):
        call_command("seed_demo_fixtures", skip_generate=True, force=True, verbosity=0)
        coach = CoachProfile.objects.get(user__email="arman@example.com")
        tpl = CoachVisitFormTemplate.objects.get(coach=coach, key="arman_visit_v1")
        tpl.name = "Coach Edited Name"
        tpl.save(update_fields=["name", "updated_at"])
        rule_set = ensure_rule_set(coach)
        rule_set.style_profile = {"session_sets": {"متوسط": 99}, "source": "coach_edit"}
        rule_set.save(update_fields=["style_profile", "updated_at"])
        student = Student.objects.get(coach=coach, full_name="محمد طاهری")
        student.coach_notes = "live edit"
        student.save(update_fields=["coach_notes", "updated_at"])

        count_tpl = CoachVisitFormTemplate.objects.filter(coach=coach).count()
        call_command("seed_demo_fixtures", skip_generate=True, force=True, verbosity=0)

        self.assertEqual(CoachVisitFormTemplate.objects.filter(coach=coach).count(), count_tpl)
        tpl.refresh_from_db()
        self.assertEqual(tpl.name, "Coach Edited Name")
        rule_set.refresh_from_db()
        self.assertEqual(rule_set.style_profile.get("session_sets", {}).get("متوسط"), 99)
        student.refresh_from_db()
        self.assertEqual(student.coach_notes, "live edit")


class SemanticExtractionTests(TestCase):
    def test_missing_means_not_assessed(self):
        extracted = extract_semantic_answers(
            answers={"goal": "hypertrophy"},
            sections=MINIMAL_VISIT_FORM_TEMPLATE["sections"],
        )
        self.assertIn("goal", extracted["executable"])
        self.assertNotIn("weak_muscles", extracted["executable"])
        merged = merge_student_with_assessment(
            student_goals={"weak_muscles": ["legs"]},
            student_injuries={},
            student_training_background={},
            student_training_conditions={},
            assessment_ctx={
                "applied": True,
                "executable": extracted["executable"],
                "advisory": {},
                "custom_keys": [],
            },
        )
        self.assertEqual(merged["goals"]["weak_muscles"], ["legs"])
