from importlib import import_module
from types import SimpleNamespace

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase

from accounts.models import CoachProfile, Exercise


class TutorialSourceMigrationTests(TestCase):
    def test_normalized_exact_match_preserves_custom_sources_and_variants(self):
        user = get_user_model().objects.create_user(username="tutorial-source-coach")
        coach = CoachProfile.objects.create(user=user, display_name="Coach")
        common = {"coach": coach, "primary_muscle": "پشت بازو"}
        exact = Exercise.objects.create(name="پشت بازو سیم‌کش طناب بالای سر خم", **common)
        custom = Exercise.objects.create(
            name="پشت بازو هالتر پرسی",
            tutorial_source_url="https://coach.example/own-video",
            **common,
        )
        other_variant = Exercise.objects.create(name="پشت بازو سیم کش طناب تک دست", **common)
        module = import_module("accounts.migrations.0022_complete_student_tutorial_sources")
        module.complete_sources(apps, SimpleNamespace(connection=connection))
        exact.refresh_from_db()
        custom.refresh_from_db()
        other_variant.refresh_from_db()
        self.assertIn("fittr.com", exact.tutorial_source_url)
        self.assertEqual(custom.tutorial_source_url, "https://coach.example/own-video")
        self.assertEqual(other_variant.tutorial_source_url, "")
