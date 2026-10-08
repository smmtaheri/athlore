"""Supplement catalog, selection safety and isolation regression coverage."""

import copy
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import CoachProfile, CoachSupplementTemplate, ProgramTemplate
from accounts.rules_services import ensure_rule_set
from accounts.supplement_catalog import save_entry, snapshot_selection
from accounts.supplement_models import SupplementCatalogEntry, SupplementGoal
from delivery.services.render import build_pdf_context
from programming.services.generator import _build_supplements
from programming.services.programs import (
    finalize_version,
    generate_program,
    serialize_student_program_detail,
)
from students.models import Student


class SupplementCatalogTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="supp-a")
        self.other_user = get_user_model().objects.create_user(username="supp-b")
        self.coach = CoachProfile.objects.create(user=self.user, display_name="A")
        self.other = CoachProfile.objects.create(user=self.other_user, display_name="B")
        self.client.force_authenticate(self.user)
        self.student = Student.objects.create(
            coach=self.coach, full_name="Test", age=25, gender="male", height_cm=180, weight_kg=80
        )
        self.goal = SupplementGoal.objects.create(coach=self.coach, name="هدف تست")
        self.payload = {
            "name": "QA Supplement",
            "category": "QA Category",
            "goal_ids": [str(self.goal.id)],
            "reason": "Coach-defined reason",
            "priority": 5,
            "reviewed": True,
            "auto_eligible": True,
            "doses": [
                {"amount": "1", "unit": "scoop", "timing": "after_workout", "days": "training"},
                {"amount": "2", "unit": "gram", "timing": "custom", "custom_time": "Custom time"},
            ],
        }

    def create(self, **overrides):
        return save_entry(self.coach, {**self.payload, **overrides})

    def selection(self, entry, **overrides):
        return {
            "items": [{"entry_id": str(entry.id)}],
            "confirmed": True,
            "safety_reviewed": True,
            "goal_ids": [str(self.goal.id)],
            **overrides,
        }

    def test_create_edit_deactivate_archive(self):
        response = self.client.post("/api/v1/supplement-catalog/", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        path = f"/api/v1/supplement-catalog/{response.data['id']}/"
        self.assertEqual(len(response.data["doses"]), 2)
        updated = self.client.put(
            path, {**self.payload, "name": "Updated", "is_active": False}, format="json"
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertFalse(updated.data["is_active"])
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.assertEqual(self.client.get("/api/v1/supplement-catalog/").data["count"], 0)
        self.assertTrue(SupplementCatalogEntry.objects.get(id=response.data["id"]).is_archived)

    def test_list_filters_and_pagination(self):
        entry = self.create()
        self.create(name="Other", is_active=False)
        response = self.client.get(
            "/api/v1/supplement-catalog/",
            {"active": "true", "goal": str(self.goal.id), "search": "QA"},
        )
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(entry.id))
        self.assertEqual(
            self.client.get("/api/v1/supplement-catalog/", {"goal": "invalid"}).status_code, 400
        )

    def test_bidirectional_isolation_and_owner_spoof(self):
        entry = self.create()
        other_goal = SupplementGoal.objects.create(coach=self.other, name="Private")
        foreign = save_entry(self.other, {**self.payload, "goal_ids": [str(other_goal.id)]})
        self.assertEqual(
            self.client.get(f"/api/v1/supplement-catalog/{foreign.id}/").status_code, 404
        )
        self.assertEqual(
            self.client.put(
                f"/api/v1/supplement-catalog/{foreign.id}/", self.payload, format="json"
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/supplement-catalog/{foreign.id}/").status_code, 404
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/supplement-catalog/",
                {**self.payload, "name": "Foreign goal", "goal_ids": [str(other_goal.id)]},
                format="json",
            ).status_code,
            404,
        )
        created = self.client.post(
            "/api/v1/supplement-catalog/",
            {**self.payload, "name": "Owner test", "coach_id": str(self.other.id)},
            format="json",
        )
        self.assertEqual(
            SupplementCatalogEntry.objects.get(id=created.data["id"]).coach_id, self.coach.id
        )
        self.client.force_authenticate(self.other_user)
        self.assertEqual(
            self.client.get(f"/api/v1/supplement-catalog/{entry.id}/").status_code, 404
        )
        self.assertEqual(self.client.get("/api/v1/supplement-catalog/").data["count"], 1)

    def test_bad_doses_and_unreviewed_auto_are_rejected_atomically(self):
        for patch in [
            {"doses": []},
            {"doses": [{"amount": "0", "unit": "gram", "timing": "morning"}]},
            {"doses": [{"amount": "1", "unit": "unknown", "timing": "morning"}]},
            {"doses": [{"amount": "1", "unit": "gram", "timing": "custom"}]},
            {"reviewed": False},
        ]:
            response = self.client.post(
                "/api/v1/supplement-catalog/", {**self.payload, **patch}, format="json"
            )
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(SupplementCatalogEntry.objects.count(), 0)

    def test_goal_create_edit_delete_and_in_use_protection(self):
        response = self.client.post(
            "/api/v1/supplement-catalog/goals/", {"name": "New"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        path = f"/api/v1/supplement-catalog/goals/{response.data['id']}/"
        self.assertEqual(
            self.client.post(path, {"name": "Invalid"}, format="json").status_code, 405
        )
        self.assertEqual(
            self.client.patch(
                "/api/v1/supplement-catalog/goals/", {"name": "Invalid"}, format="json"
            ).status_code,
            405,
        )
        self.assertEqual(
            self.client.patch(path, {"name": "Renamed"}, format="json").status_code, 200
        )
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.create()
        self.assertEqual(
            self.client.delete(f"/api/v1/supplement-catalog/goals/{self.goal.id}/").status_code, 400
        )

    def test_proposals_follow_priority_and_replacement_groups(self):
        best = self.create(name="Best", priority=10, replacement_group="alternatives")
        self.create(name="Alternative", priority=9, replacement_group="alternatives")
        second = self.create(name="Second", priority=3)
        self.create(name="Inactive", is_active=False)
        self.create(name="Unreviewed", reviewed=False, auto_eligible=False)
        response = self.client.post(
            "/api/v1/supplement-catalog/propose/",
            {"student_id": str(self.student.id), "goal_ids": [str(self.goal.id)], "count": 2},
            format="json",
        )
        self.assertEqual(
            [item["id"] for item in response.data["items"]], [str(best.id), str(second.id)]
        )
        self.assertEqual(response.data["excluded"][0]["reason"], "same_replacement_group")

    def test_medical_notes_block_proposals_and_confirmation_is_required(self):
        entry = self.create()
        self.student.relevant_medical_notes = "Requires review"
        self.student.save()
        response = self.client.post(
            "/api/v1/supplement-catalog/propose/",
            {"student_id": str(self.student.id), "goal_ids": [str(self.goal.id)]},
            format="json",
        )
        self.assertEqual(response.data["items"], [])
        for patch in [{"confirmed": False}, {"safety_reviewed": False}]:
            response = self.client.post(
                "/api/v1/supplement-catalog/prescribe/",
                {"student_id": str(self.student.id), "selection": self.selection(entry, **patch)},
                format="json",
            )
            self.assertEqual(response.status_code, 400)

    def test_prescribe_rejects_cross_coach_student_and_entry(self):
        entry = self.create()
        self.client.force_authenticate(self.other_user)
        response = self.client.post(
            "/api/v1/supplement-catalog/prescribe/",
            {"student_id": str(self.student.id), "selection": self.selection(entry)},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        other_student = Student.objects.create(
            coach=self.other, full_name="Other", age=25, gender="male", height_cm=180, weight_kg=80
        )
        response = self.client.post(
            "/api/v1/supplement-catalog/prescribe/",
            {"student_id": str(other_student.id), "selection": self.selection(entry, goal_ids=[])},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_snapshot_keeps_multiple_doses_and_does_not_mutate_catalog(self):
        entry = self.create()
        items, evidence = snapshot_selection(
            self.coach,
            self.student,
            self.selection(
                entry,
                items=[
                    {
                        "entry_id": str(entry.id),
                        "doses": [{"amount": "3", "unit": "gram", "timing": "morning"}],
                        "reason": "Personal reason",
                    }
                ],
            ),
        )
        self.assertEqual(items[0]["amount"], "3 گرم")
        self.assertEqual(items[0]["notes"], "Personal reason")
        self.assertEqual(evidence["selected"][0]["source"], "coach_catalog")
        self.assertEqual(entry.doses.count(), 2)
        frozen = copy.deepcopy(items)
        save_entry(self.coach, {**self.payload, "name": "Changed"}, entry)
        self.assertEqual(items, frozen)

    def test_generator_and_generation_run_persist_catalog_snapshot(self):
        entry = self.create(warnings="QA warning", instructions="QA instruction")
        template = ProgramTemplate.objects.create(
            coach=self.coach,
            rule_set=ensure_rule_set(self.coach),
            name="Test",
            days_per_week=3,
            level="intermediate",
        )
        request = {
            "student_id": str(self.student.id),
            "template_id": str(template.id),
            "program_type": "supplement",
            "supplement_selection": self.selection(entry),
        }
        program, run = generate_program(self.coach, request)
        self.assertEqual(len(run.output_snapshot["supplements"]["items"]), 2)
        self.assertEqual(
            run.output_snapshot["generator"]["evidence"]["supplements"]["selected"][0]["id"],
            str(entry.id),
        )
        version = program.versions.first()
        self.assertEqual(version.supplements["items"][0]["name"], self.payload["name"])
        save_entry(self.coach, {**self.payload, "name": "Changed later"}, entry)
        version.refresh_from_db()
        self.assertEqual(version.supplements["items"][0]["name"], self.payload["name"])
        finalize_version(version, actor=self.user)
        program.refresh_from_db()
        projection = serialize_student_program_detail(program)
        self.assertEqual(projection["supplements"]["items"][0]["instructions"], "QA instruction")
        context = build_pdf_context(
            artifact=SimpleNamespace(id="test"),
            program=program,
            version=version,
            student=self.student,
            coach=self.coach,
        )
        self.assertEqual(len(context["supplement_items"]), 2)
        self.assertEqual(context["supplement_items"][0]["warnings"], "QA warning")

    def test_invalid_suggested_selection_and_inactive_entries_are_rejected(self):
        entry = self.create(auto_eligible=False)
        response = self.client.post(
            "/api/v1/supplement-catalog/prescribe/",
            {
                "student_id": str(self.student.id),
                "selection": self.selection(entry, mode="suggested"),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        entry.is_active = False
        entry.save()
        response = self.client.post(
            "/api/v1/supplement-catalog/prescribe/",
            {"student_id": str(self.student.id), "selection": self.selection(entry)},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_legacy_templates_remain_unchanged(self):
        legacy = CoachSupplementTemplate.objects.create(coach=self.coach, name="Legacy")
        self.create()
        legacy.refresh_from_db()
        self.assertTrue(legacy.needs_coach_review)
        result, warnings, evidence = _build_supplements(
            coach=self.coach, student=self.student, request={}
        )
        self.assertFalse(result["enabled"])
        self.assertEqual(evidence["reason"], "opt_in_required")
