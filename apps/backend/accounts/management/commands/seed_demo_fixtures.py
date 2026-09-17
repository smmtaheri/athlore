"""Idempotent demo fixtures for Arman + Mohammad (version-controlled).

Create-only / leave-existing for production bootstrap:
- Missing records are inserted by stable natural keys.
- Existing coach edits are NOT force-updated from fixtures.
- Safe to run more than once (entrypoint + deploy.sh both may invoke it).

Local/dev: may auto-run when DEBUG=true (entrypoint) or via explicit command.
Production: requires LOAD_DEMO_FIXTURES=true; never sets a fixed demo password
unless --allow-demo-password is passed.
"""

from __future__ import annotations

import copy
import os
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.demo_fixtures import ARMAN_RULES, DEMO_SUPPLEMENT_ITEMS, EXTRA_STANDARD_EXERCISES
from accounts.models import (
    CoachExercisePreference,
    CoachNutritionTemplate,
    CoachProfile,
    CoachRuleSet,
    CoachSupplementTemplate,
    Exercise,
    ExerciseAlias,
    ExerciseBankGroup,
    GeneralRule,
    InjuryRule,
    LevelRule,
    MusclePriority,
    ProgramTemplate,
    SupplementTemplateItem,
)
from accounts.rules_services import ensure_rule_set, replace_coach_rules
from accounts.services import normalize_email
from accounts.visit_form_fixtures import ARMAN_STYLE_PROFILE, ARMAN_VISIT_FORM_TEMPLATE
from common.phone import normalize_iran_mobile
from students.models import Student, Visit
from students.visit_form_services import ensure_visit_form_from_fixture

User = get_user_model()

DEFAULT_EMAIL = "arman@example.com"
DEFAULT_PASSWORD = "Arman1234!"
COACH_PHONE = normalize_iran_mobile("09121111111")
STUDENT_PHONE = normalize_iran_mobile("09386579479")  # +989386579479
LEGACY_DEMO_STUDENT_PHONES = {
    normalize_iran_mobile("09123456789"),
}
FOUR_DAY_TEMPLATE = "۴ روزه حجم متوسط"
DEMO_PROGRAM_TITLE = "برنامه دمو محمد — ۴ روزه حجم متوسط"


def _truthy(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def demo_fixtures_allowed(*, force: bool = False) -> bool:
    if force:
        return True
    if settings.DEBUG:
        return True
    return _truthy("LOAD_DEMO_FIXTURES")


class Command(BaseCommand):
    help = (
        "Seed Arman demo fixtures create-only (coach, rules, bank, assessment, "
        "Mohammad, visit, optional program)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", default=DEFAULT_EMAIL)
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument(
            "--allow-demo-password",
            action="store_true",
            help="Allow setting fixed demo password outside DEBUG (still needs LOAD_DEMO_FIXTURES).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Bypass env gate (explicit operator action).",
        )
        parser.add_argument(
            "--skip-generate",
            action="store_true",
            help="Skip fresh program generation / PDF render.",
        )
        parser.add_argument(
            "--with-pdf",
            action="store_true",
            help="Finalize demo program and render Training PDF.",
        )
        parser.add_argument(
            "--replace-rules",
            action="store_true",
            help="DANGEROUS: wipe and reload coach rules from fixture (dev only).",
        )
        parser.add_argument(
            "--replace-demo-program",
            action="store_true",
            help="Delete and regenerate the Mohammad demo program title.",
        )

    def handle(self, *args, **options):
        if not demo_fixtures_allowed(force=bool(options["force"])):
            raise CommandError(
                "Demo fixtures blocked: set DEBUG=true (local) or LOAD_DEMO_FIXTURES=true "
                "(production explicit), or pass --force."
            )

        email = normalize_email(options["email"])
        password = options["password"]
        set_password = (
            settings.DEBUG or bool(options["allow_demo_password"]) or _truthy("LOAD_DEMO_FIXTURES")
        )
        if not set_password:
            self.stdout.write(
                self.style.WARNING(
                    "Production-safe mode: demo password will NOT be set "
                    "(pass --allow-demo-password or set LOAD_DEMO_FIXTURES=true)."
                )
            )

        with transaction.atomic():
            coach, student, visit, counts = self._seed_core(
                email=email,
                password=password,
                set_password=set_password,
                replace_rules=bool(options["replace_rules"]),
            )

        self.stdout.write(self.style.SUCCESS("Core fixtures ensured (create-only)"))
        self._print_counts(coach, student, visit, counts)

        if options["skip_generate"]:
            return

        program, artifact = self._generate_demo_program(
            coach,
            student,
            with_pdf=bool(options["with_pdf"]),
            replace_demo=bool(options["replace_demo_program"]),
        )
        if program is None:
            self.stdout.write(
                self.style.WARNING(
                    "Demo program already present; skipped generation "
                    "(pass --replace-demo-program to recreate)."
                )
            )
            return
        self.stdout.write(self.style.SUCCESS(f"Demo program id={program.id}"))
        if artifact is not None:
            self.stdout.write(
                self.style.SUCCESS(f"PDF artifact id={artifact.id} status={artifact.status}")
            )

    def _seed_core(self, *, email: str, password: str, set_password: bool, replace_rules: bool):
        user, created_user = User.objects.get_or_create(
            username=email,
            defaults={"email": email, "first_name": "آرمان واعظی", "is_active": True},
        )
        if created_user and set_password:
            user.set_password(password)
            user.email = email
            user.first_name = "آرمان واعظی"
            user.is_active = True
            user.save()
        elif created_user:
            user.set_unusable_password()
            user.save()
        elif set_password and settings.DEBUG:
            # Local convenience only — do not reset production passwords on re-seed.
            if not user.has_usable_password():
                user.set_password(password)
                user.save(update_fields=["password"])

        coach, created_coach = CoachProfile.objects.get_or_create(
            user=user,
            defaults={
                "display_name": "آرمان واعظی",
                "phone_number": COACH_PHONE,
                "style_notes": "بدنسازی علمی + هایپرتروفی کلاسیک",
                "control_mode": CoachProfile.ControlMode.BALANCED,
                "default_session_minutes": 75,
            },
        )
        # Fill blank phone only; never overwrite coach-edited profile fields.
        if not created_coach and not coach.phone_number:
            coach.phone_number = COACH_PHONE
            coach.save(update_fields=["phone_number", "updated_at"])

        rule_set = ensure_rule_set(coach)
        if replace_rules or not self._coach_has_rules(rule_set):
            # First-time bootstrap OR explicit --replace-rules: load full pack once.
            replace_coach_rules(coach, ARMAN_RULES, partial=False)
            rule_set.refresh_from_db()
        # Always create-only fill gaps (safe when already complete; needed for V1
        # fixture expansions on existing coaches without --replace-rules).
        self._ensure_missing_rule_rows(coach, rule_set)
        rule_set.refresh_from_db()

        # Style profile: create-only when empty.
        if not rule_set.style_profile:
            rule_set.style_profile = copy.deepcopy(ARMAN_STYLE_PROFILE)
            rule_set.save(update_fields=["style_profile", "updated_at"])

        # Visit form template: create-only by natural key (Arman detailed form).
        visit_form_tpl, visit_form_created = ensure_visit_form_from_fixture(
            coach, ARMAN_VISIT_FORM_TEMPLATE, create_only=True
        )
        # Import historical bank (create-or-skip for most entities).
        call_command(
            "import_coach_reference_data",
            coach_email=email,
            dataset="arman",
            verbosity=1,
        )
        self._ensure_extra_exercises(coach)
        self._ensure_demo_nutrition_supplement(coach)
        self._ensure_named_template(coach, rule_set, FOUR_DAY_TEMPLATE, create_only=True)

        student = self._ensure_mohammad(coach)
        self._ensure_mohammad_portal_ready(student)
        self._ensure_mohammad_body_check(coach, student)
        visit = self._ensure_visit(coach, student)
        self._ensure_lifecycle_test_visit(coach, student)
        counts = {
            "exercises": Exercise.objects.filter(coach=coach, is_archived=False).count(),
            "aliases": ExerciseAlias.objects.filter(coach=coach).count(),
            "templates": list(
                ProgramTemplate.objects.filter(coach=coach, is_archived=False).values_list(
                    "name", "days_per_week"
                )
            ),
            "visit_form_template": visit_form_tpl.key,
            "visit_form_created": visit_form_created,
            "injuries": list(
                rule_set.injury_rules.filter(is_active=True).values_list("name", flat=True)
            ),
            "levels": list(rule_set.level_rules.values_list("level_key", flat=True)),
            "style_profile_source": (rule_set.style_profile or {}).get("source"),
        }
        return coach, student, visit, counts

    def _coach_has_rules(self, rule_set: CoachRuleSet) -> bool:
        return (
            rule_set.templates.exists()
            or rule_set.level_rules.exists()
            or rule_set.injury_rules.exists()
            or rule_set.muscle_priorities.exists()
            or rule_set.exercise_bank_groups.exists()
            or rule_set.general_rules.exists()
        )

    def _ensure_missing_rule_rows(self, coach: CoachProfile, rule_set: CoachRuleSet) -> None:
        """Insert fixture rows missing by natural key; never update or delete existing."""
        # ProgramTemplate natural key: (coach, name)
        existing_tpl = set(
            ProgramTemplate.objects.filter(coach=coach).values_list("name", flat=True)
        )
        for item in ARMAN_RULES.get("templates") or []:
            name = item.get("name")
            if not name or name in existing_tpl:
                continue
            ProgramTemplate.objects.create(
                rule_set=rule_set,
                coach=coach,
                name=name,
                goal=item.get("goal") or "",
                main_goal=item.get("main_goal") or "",
                level=item.get("level") or ProgramTemplate.Level.INTERMEDIATE,
                days_per_week=int(item.get("days_per_week") or 4),
                intensity=item.get("intensity") or "",
                volume=item.get("volume") or "",
                rest_time=item.get("rest_time") or "",
                split=list(item.get("split") or []),
                muscle_priority_order=list(item.get("muscle_priority_order") or []),
                special_rules=list(item.get("special_rules") or []),
                is_active=bool(item.get("is_active", True)),
                sort_order=int(item.get("sort_order") or 0),
            )

        # LevelRule natural key: (rule_set, level_key)
        existing_levels = set(
            LevelRule.objects.filter(coach=coach).values_list("level_key", flat=True)
        )
        for item in ARMAN_RULES.get("levels") or []:
            key = item.get("id") or item.get("level_key")
            if not key or key in existing_levels:
                continue
            LevelRule.objects.create(
                rule_set=rule_set,
                coach=coach,
                level_key=key,
                intensity=item.get("intensity") or "",
                volume=item.get("volume") or "",
                allowed_techniques=list(item.get("allowed_techniques") or []),
                forbidden_exercises=list(item.get("forbidden_exercises") or []),
                required_exercises=list(item.get("required_exercises") or []),
                coach_notes=item.get("coach_notes") or "",
            )

        # InjuryRule natural key: (coach, name)
        existing_injuries = set(
            InjuryRule.objects.filter(coach=coach).values_list("name", flat=True)
        )
        for item in ARMAN_RULES.get("injuries") or []:
            name = item.get("name")
            if not name or name in existing_injuries:
                continue
            InjuryRule.objects.create(
                rule_set=rule_set,
                coach=coach,
                name=name,
                forbidden_exercises=list(item.get("forbidden_exercises") or []),
                alternatives=list(item.get("alternatives") or []),
                notes=item.get("notes") or "",
                is_active=bool(item.get("is_active", True)),
                sort_order=int(item.get("sort_order") or 0),
            )

        # MusclePriority natural key: (coach, muscle)
        existing_muscles = set(
            MusclePriority.objects.filter(coach=coach).values_list("muscle", flat=True)
        )
        for item in ARMAN_RULES.get("muscle_priorities") or []:
            muscle = str(item.get("muscle") or "").strip()
            if not muscle or muscle in existing_muscles:
                continue
            MusclePriority.objects.create(
                rule_set=rule_set,
                coach=coach,
                muscle=muscle,
                extra_exercises=max(0, int(item.get("extra_exercises") or 0)),
                extra_sets=max(0, int(item.get("extra_sets") or 0)),
                order_change=str(item.get("order_change") or ""),
                notes=str(item.get("notes") or ""),
                sort_order=int(item.get("sort_order") or 0),
            )

        # ExerciseBankGroup natural key: (coach, group_name)
        existing_bank = set(
            ExerciseBankGroup.objects.filter(coach=coach).values_list("group_name", flat=True)
        )
        for item in ARMAN_RULES.get("exercise_bank") or []:
            group_name = str(item.get("group") or item.get("group_name") or "").strip()
            if not group_name or group_name in existing_bank:
                continue
            ExerciseBankGroup.objects.create(
                rule_set=rule_set,
                coach=coach,
                group_name=group_name,
                favorite_exercises=list(item.get("favorite_exercises") or []),
                beginner_friendly=list(item.get("beginner_friendly") or []),
                professional_friendly=list(item.get("professional_friendly") or []),
                forbidden_exercises=list(item.get("forbidden_exercises") or []),
                sort_order=int(item.get("sort_order") or 0),
            )

        # GeneralRule natural key: (coach, title)
        general = ARMAN_RULES.get("general_rules") or {}
        if isinstance(general, dict):
            # Extra notes: fill only when blank (do not overwrite coach edits).
            if not (rule_set.general_extra_notes or "").strip():
                notes = str(general.get("extra_notes") or "").strip()
                if notes:
                    rule_set.general_extra_notes = notes
                    rule_set.save(update_fields=["general_extra_notes", "updated_at"])
            existing_titles = set(
                GeneralRule.objects.filter(coach=coach).values_list("title", flat=True)
            )
            for idx, item in enumerate(general.get("items") or []):
                title = str(item.get("title") or "").strip()
                if not title or title in existing_titles:
                    continue
                GeneralRule.objects.create(
                    rule_set=rule_set,
                    coach=coach,
                    title=title,
                    description=str(item.get("description") or ""),
                    category=str(item.get("category") or ""),
                    importance=str(item.get("importance") or "medium"),
                    is_active=bool(item.get("is_active", True)),
                    sort_order=int(item.get("order") or item.get("sort_order") or idx),
                )

    def _ensure_extra_exercises(self, coach: CoachProfile) -> None:
        for entry in EXTRA_STANDARD_EXERCISES:
            name = entry["name"]
            muscle = entry["primary_muscle"]
            existing = Exercise.objects.filter(coach=coach, name=name).first()
            if existing is None:
                ex = Exercise.objects.create(
                    coach=coach,
                    name=name,
                    primary_muscle=muscle,
                    secondary_muscles=list(entry.get("secondary_muscles") or []),
                    equipment=entry.get("equipment") or "",
                    movement_pattern=entry.get("movement_pattern") or "",
                    laterality=entry.get("laterality") or "",
                    level=Exercise.Level.ALL,
                    is_active=True,
                    is_archived=False,
                )
            else:
                ex = existing
            CoachExercisePreference.objects.get_or_create(
                coach=coach,
                exercise=ex,
                defaults={
                    "is_preferred": not bool(entry.get("prohibited")),
                    "is_prohibited": bool(entry.get("prohibited")),
                    "suitable_levels": ["beginner", "intermediate", "advanced"],
                },
            )

    def _ensure_demo_nutrition_supplement(self, coach: CoachProfile) -> None:
        nutrition = CoachNutritionTemplate.objects.filter(coach=coach).order_by("name").first()
        if nutrition is not None and nutrition.status != CoachNutritionTemplate.Status.ACTIVE:
            # Only activate if still in review defaults from import — don't fight coach edits
            # unless never activated.
            if nutrition.needs_coach_review and not nutrition.is_eligible_for_auto_select:
                nutrition.status = CoachNutritionTemplate.Status.ACTIVE
                nutrition.needs_coach_review = False
                nutrition.is_eligible_for_auto_select = True
                nutrition.save(
                    update_fields=[
                        "status",
                        "needs_coach_review",
                        "is_eligible_for_auto_select",
                        "updated_at",
                    ]
                )

        supp, created = CoachSupplementTemplate.objects.get_or_create(
            coach=coach,
            name="مکمل دمو آرمان",
            defaults={
                "status": CoachSupplementTemplate.Status.ACTIVE,
                "needs_coach_review": False,
                "is_eligible_for_auto_select": True,
                "source_documents": ["demo-seed"],
            },
        )
        if created or not supp.items.exists():
            if not supp.items.exists():
                for idx, item in enumerate(DEMO_SUPPLEMENT_ITEMS):
                    SupplementTemplateItem.objects.create(
                        template=supp,
                        sort_order=idx,
                        name=item["name"],
                        quantity_text=item["quantity_text"],
                        timing=item["timing"],
                        instructions=item.get("instructions") or "",
                        warnings=item.get("warnings") or "",
                    )

    def _ensure_named_template(
        self, coach: CoachProfile, rule_set: CoachRuleSet, name: str, *, create_only: bool
    ) -> ProgramTemplate | None:
        existing = ProgramTemplate.objects.filter(coach=coach, name=name).first()
        if existing is not None:
            return existing
        fixture = next(
            (t for t in (ARMAN_RULES.get("templates") or []) if t.get("name") == name),
            None,
        )
        if fixture is None:
            return None
        return ProgramTemplate.objects.create(
            rule_set=rule_set,
            coach=coach,
            name=name,
            goal=fixture.get("goal") or "",
            main_goal=fixture.get("main_goal") or "",
            level=fixture.get("level") or ProgramTemplate.Level.INTERMEDIATE,
            days_per_week=int(fixture.get("days_per_week") or 4),
            intensity=fixture.get("intensity") or "",
            volume=fixture.get("volume") or "",
            rest_time=fixture.get("rest_time") or "",
            split=list(fixture.get("split") or []),
            muscle_priority_order=list(fixture.get("muscle_priority_order") or []),
            special_rules=list(fixture.get("special_rules") or []),
            is_active=True,
            is_archived=False,
            sort_order=int(fixture.get("sort_order") or 0),
        )

    def _ensure_mohammad(self, coach: CoachProfile) -> Student:
        payload = {
            "age": 27,
            "gender": Student.Gender.MALE,
            "height_cm": Decimal("182.0"),
            "weight_kg": Decimal("86.0"),
            "phone_number": STUDENT_PHONE,
            "status": Student.Status.ACTIVE,
            "coach_notes": "دمو: گردن درد خفیف؛ برنامه‌نویس؛ علاقه به سینه و بازو.",
            "goals": {
                "primary_goal": "hypertrophy",
                "secondary_goal": "بهبود upper chest و بازو",
                "muscle_priorities": ["chest", "shoulders", "triceps"],
                "weak_muscles": ["chest", "upper_chest", "triceps"],
                "strong_muscles": ["legs"],
            },
            "injuries": {
                "has_injury": True,
                "injury_type": "mild_neck",
                "aggravating_movements": ["heavy_shoulder_press", "heavy_shrug"],
                "disallowed_exercises": ["heavy_shrug", "behind_neck_press"],
            },
            "equipment": {
                "has_barbell": True,
                "has_dumbbell": True,
                "has_machines": True,
                "has_cable": True,
                "has_full_gym": True,
            },
            "lifestyle": {
                "occupation": "programmer",
                "sleep_quality": "متوسط",
                "stress_level": "متوسط رو به زیاد",
                "daily_activity_level": "کم",
            },
            "preferences": {
                "favorite_exercises": "سینه، جلوبازو، پشت بازو",
                "intensity_preference": "متوسط تا بالا",
                "disliked_training_styles": "کاردیو طولانی",
                "variety_preference": "متوسط",
                "liked_muscles": ["chest", "arms"],
                "cardio_interest": "low",
            },
            "training_background": {
                "level": "intermediate",
                "training_experience": "حدود ۲ سال",
                "years_training": 2,
                "basic_movement_familiarity": "خوب",
                "has_free_weight_experience": True,
            },
            "training_conditions": {
                "training_days_per_week": 4,
                "session_duration_minutes": 75,
                "training_preference": "باشگاه کامل",
                "cardio_interest": "کم",
                "heavy_training_interest": "متوسط",
            },
            "summary_medical_note": "mild neck pain",
            "food_allergies": [],
            "food_intolerances": [],
            "dietary_restrictions": ["none_recorded_demo"],
            "dietary_preferences": ["high_protein"],
            "supplement_restrictions": [],
            "nutrition_notes": "دمو: حساسیت غذایی ثبت‌شده ندارد؛ مربی تأیید کرده nutrition فعال شود.",
            "relevant_medical_notes": "mild neck pain; avoid heavy overhead and shrug.",
        }
        student, _created = Student.objects.get_or_create(
            coach=coach,
            full_name="محمد طاهری",
            defaults=payload,
        )
        # Keep the canonical demo mobile in sync for portal activation testing,
        # without overwriting an intentionally different production phone.
        if student.phone_number != STUDENT_PHONE and (
            not student.phone_number or student.phone_number in LEGACY_DEMO_STUDENT_PHONES
        ):
            student.phone_number = STUDENT_PHONE
            student.save(update_fields=["phone_number", "updated_at"])
        return student

    def _ensure_mohammad_portal_ready(self, student: Student) -> None:
        """Portal enabled shell, not completed; coach must set initial password live."""
        from students.services import _ensure_portal_user

        profile = _ensure_portal_user(student)
        if profile.is_account_activated:
            return
        updates = []
        if not profile.portal_enabled:
            profile.portal_enabled = True
            updates.append("portal_enabled")
        if profile.must_change_password:
            profile.must_change_password = False
            updates.append("must_change_password")
        if updates:
            updates.append("updated_at")
            profile.save(update_fields=updates)
        user = profile.user
        # No seeded password — coach sets initial password (e.g. 123456) in UI.
        if user.has_usable_password():
            user.set_unusable_password()
            user.save(update_fields=["password"])
        if user.is_active:
            user.is_active = False
            user.save(update_fields=["is_active"])

    def _ensure_mohammad_body_check(self, coach: CoachProfile, student: Student) -> None:
        """Idempotent sample Body Check cycle with a few logged days (no fake zeros)."""
        from students.body_check_models import BodyCheckCycle, BodyCheckDailyEntry
        from students.body_check_services import create_cycle, local_today, suggest_daily_targets_kg

        if BodyCheckCycle.objects.filter(student=student).exists():
            return
        today = local_today()
        start = today - timedelta(days=4)
        cycle = create_cycle(
            coach,
            student,
            start_date=start,
            starting_weight_kg=student.weight_kg or Decimal("86.0"),
            goal_weight_kg=Decimal("82.0"),
            meal_detail_enabled=False,
            daily_targets_kg=suggest_daily_targets_kg(
                student.weight_kg or Decimal("86.0"), Decimal("82.0")
            ),
        )
        # Only create real logged days — leave the rest missing on purpose.
        BodyCheckDailyEntry.objects.create(
            cycle=cycle,
            local_date=start,
            target_weight_kg=Decimal(str(cycle.daily_targets_kg[0])),
            actual_weight_kg=Decimal("85.8"),
            sleep_start_time="23:15:00",
            wake_time="07:00:00",
            sleep_duration_minutes=465,
            sleep_quality_score=7,
            nutrition_adherence_score=8,
        )
        BodyCheckDailyEntry.objects.create(
            cycle=cycle,
            local_date=start + timedelta(days=2),
            target_weight_kg=Decimal(str(cycle.daily_targets_kg[2])),
            actual_weight_kg=Decimal("85.4"),
            nutrition_adherence_score=6,
        )

    def _ensure_visit(self, coach: CoachProfile, student: Student) -> Visit:
        visit, created = Visit.objects.get_or_create(
            student=student,
            visit_date=date(2026, 8, 1),
            defaults={
                "coach": coach,
                "current_weight_kg": Decimal("86.0"),
                "previous_weight_kg": Decimal("86.4"),
                "body_fat_percentage": Decimal("17.80"),
                "waist_cm": Decimal("83.50"),
                "chest_cm": Decimal("103.00"),
                "arm_cm": Decimal("36.50"),
                "thigh_cm": Decimal("58.50"),
                "hip_cm": Decimal("95.50"),
                "adherence_overall": Decimal("82.00"),
                "adherence_training": Decimal("88.00"),
                "adherence_nutrition": Decimal("75.00"),
                "adherence_supplements": Decimal("70.00"),
                "daily_energy_level": Visit.Level.GOOD,
                "sleep_quality": Visit.Level.MEDIUM,
                "stress_level": Visit.Level.HIGH,
                "coach_assessment": "آماده سیکل ۴روزه حجم؛ گردن همچنان محدودیت overhead.",
                "coach_notes": "آخرین ویزیت دمو برای Generator.",
                "next_cycle_goal": "بالاسینه و پشت بازو",
                "status": Visit.Status.FINALIZED,
                "finalized_at": timezone.now(),
            },
        )
        if created:
            student.summary_last_visit_date = visit.visit_date
            student.weight_kg = visit.current_weight_kg
            student.save(update_fields=["summary_last_visit_date", "weight_kg", "updated_at"])
        return visit

    def _ensure_lifecycle_test_visit(self, coach: CoachProfile, student: Student) -> Visit:
        """Idempotent draft Visit for manual send → submit → coach_review → finalize tests."""
        from students import visit_form_services as vfs
        from students.visit_form_models import CoachVisitFormTemplate

        visit, created = Visit.objects.get_or_create(
            student=student,
            visit_date=date(2026, 9, 15),
            defaults={
                "coach": coach,
                "current_weight_kg": Decimal("86.2"),
                "previous_weight_kg": Decimal("86.0"),
                "body_fat_percentage": Decimal("17.50"),
                "daily_energy_level": Visit.Level.MEDIUM,
                "sleep_quality": Visit.Level.MEDIUM,
                "stress_level": Visit.Level.MEDIUM,
                "coach_assessment": "",
                "coach_notes": "ویزیت آزمایشی چرخهٔ فرم شاگرد (ارسال/ثبت/بررسی/نهایی).",
                "next_cycle_goal": "",
                "status": Visit.Status.DRAFT,
            },
        )
        if created or not visit.form_template_snapshot:
            template = (
                CoachVisitFormTemplate.objects.filter(coach=coach, is_default=True, is_active=True)
                .order_by("-version")
                .first()
            )
            if template is None:
                template = (
                    CoachVisitFormTemplate.objects.filter(coach=coach, is_active=True)
                    .order_by("-is_default", "-version")
                    .first()
                )
            if template is not None:
                vfs.apply_form_template_to_visit(visit, template, set_answers=True)
                visit.save()
        return visit

    def _generate_demo_program(self, coach, student, *, with_pdf: bool, replace_demo: bool):
        from programming.models import Program
        from programming.services import programs as program_services

        template = ProgramTemplate.objects.filter(coach=coach, name=FOUR_DAY_TEMPLATE).first()
        if template is None:
            raise CommandError(f"Missing template {FOUR_DAY_TEMPLATE}")

        existing = Program.objects.filter(
            coach=coach, student=student, title=DEMO_PROGRAM_TITLE
        ).first()
        if existing is not None and not replace_demo:
            return None, None

        if replace_demo and existing is not None:
            from delivery.models import PdfArtifact
            from programming.models import ProgramVersion

            for old in Program.objects.filter(
                coach=coach, student=student, title=DEMO_PROGRAM_TITLE
            ):
                PdfArtifact.objects.filter(program=old).delete()
                ProgramVersion.objects.filter(program=old).delete()
                old.delete()

        program, run = program_services.generate_program(
            coach,
            {
                "student_id": str(student.id),
                "template_id": str(template.id),
                "program_type": "complete",
                "title": DEMO_PROGRAM_TITLE,
                "level": "intermediate",
                "days_per_week": 4,
                "duration_weeks": 4,
                "apply_exercise_bank": True,
                "apply_injury_rules": True,
                "apply_general_rules": True,
                "apply_level_rules": True,
                "apply_muscle_priority_rules": True,
                "supplement_opt_in": True,
            },
        )
        self.stdout.write(f"generation_run={run.id} status={run.status}")
        version = run.resulting_version
        if version is None:
            raise CommandError("Generation succeeded but no version was attached.")
        program.active_version = version
        program.save(update_fields=["active_version", "updated_at"])
        days = (version.training or {}).get("days") or []
        self.stdout.write(
            f"training_days={len(days)} summary={(version.training or {}).get('summary')}"
        )

        artifact = None
        if with_pdf:
            from delivery.services.artifacts import create_and_render

            version = program_services.finalize_version(version, actor=coach.user)
            artifact = create_and_render(
                coach,
                program,
                version_id=version.id,
                display_name=f"{DEMO_PROGRAM_TITLE}.pdf",
                user=coach.user,
            )
        return program, artifact

    def _print_counts(self, coach, student, visit, counts) -> None:
        self.stdout.write(f"coach_id={coach.id} email={coach.user.email}")
        self.stdout.write(f"student_id={student.id} name={student.full_name}")
        self.stdout.write(f"visit_id={visit.id} date={visit.visit_date}")
        self.stdout.write(f"exercises={counts['exercises']} aliases={counts['aliases']}")
        self.stdout.write(f"templates={counts['templates']}")
        self.stdout.write(f"injury_rules={counts['injuries']}")
        self.stdout.write(f"level_rules={counts['levels']}")
        self.stdout.write(
            f"visit_form_template={counts['visit_form_template']} "
            f"created={counts['visit_form_created']}"
        )
        self.stdout.write(f"style_profile_source={counts['style_profile_source']}")
        if settings.DEBUG:
            self.stdout.write(
                self.style.WARNING(f"local demo login: {DEFAULT_EMAIL} / {DEFAULT_PASSWORD}")
            )
