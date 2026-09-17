"""Print a Mohammad Taheri acceptance program for manual review.

Usage (from backend root, does not touch protected db.sqlite3):

  DJANGO_DB_NAME=/tmp/coach_mohammad_gen_review.sqlite3 \\
    uv run python scripts/print_mohammad_program.py
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "coach_copilot.settings")
os.environ.setdefault("DJANGO_DB_NAME", "/tmp/coach_mohammad_gen_review.sqlite3")
Path(os.environ["DJANGO_DB_NAME"]).unlink(missing_ok=True)

import django

django.setup()

from django.contrib.auth import get_user_model
from django.core.management import call_command

from accounts.models import CoachProfile, Exercise, ProgramTemplate
from accounts.rules_services import replace_coach_rules
from programming.services import generator as gen
from programming.tests.test_generator_quality import ARMAN_4DAY_RULES
from students.models import Student

call_command("migrate", run_syncdb=True, verbosity=0)

User = get_user_model()
user = User.objects.create_user(
    username="arman-review",
    email="arman@example.com",
    password="SecurePass123!",
)
coach = CoachProfile.objects.create(user=user, display_name="آرمان واعظی")
replace_coach_rules(coach, ARMAN_4DAY_RULES, partial=False)
template = ProgramTemplate.objects.filter(coach=coach, days_per_week=4).first()

for name, muscle, eq in [
    ("پرس سینه هالتر", "سینه", "هالتر"),
    ("پرس بالا سینه دمبل", "سینه", "دمبل"),
    ("کراس اور", "سینه", "کابل"),
    ("قفسه سینه دستگاه", "سینه", "دستگاه"),
    ("لت سیم کش", "زیربغل", "کابل"),
    ("روئینگ هالتر", "زیربغل", "هالتر"),
    ("بارفیکس کمکی", "زیربغل", "وزن بدن"),
    ("پول اور", "زیربغل", "کابل"),
    ("اسکوات", "پا", "هالتر"),
    ("پرس پا", "پا", "دستگاه"),
    ("ددلیفت رومانیایی", "پا", "هالتر"),
    ("جلوپا دستگاه", "پا", "دستگاه"),
    ("ساق ایستاده", "پا", "دستگاه"),
    ("پرس سرشانه دستگاه", "سرشانه", "دستگاه"),
    ("نشر جانب دمبل", "سرشانه", "دمبل"),
    ("فیس پول", "سرشانه", "کابل"),
    ("پرس سرشانه سنگین", "سرشانه", "هالتر"),
    ("شراگ سنگین", "سرشانه", "هالتر"),
    ("پشت بازو سیم‌کش", "پشت بازو", "کابل"),
    ("دیپ نیمکت", "پشت بازو", "وزن بدن"),
    ("پشت بازو دمبل", "پشت بازو", "دمبل"),
    ("جلو بازو دمبل", "جلو بازو", "دمبل"),
    ("جلو بازو هالتر", "جلو بازو", "هالتر"),
    ("چکش دمبل", "جلو بازو", "دمبل"),
    ("کرانچ", "شکم", "وزن بدن"),
    ("پلانک", "شکم", "وزن بدن"),
    ("زیرشکم پا آویزان", "شکم", "وزن بدن"),
]:
    Exercise.objects.update_or_create(
        coach=coach,
        name=name,
        defaults={
            "primary_muscle": muscle,
            "equipment": eq,
            "level": Exercise.Level.ALL,
            "is_active": True,
        },
    )

student = Student.objects.create(
    coach=coach,
    full_name="محمد طاهری",
    age=27,
    gender=Student.Gender.MALE,
    height_cm=Decimal("182.0"),
    weight_kg=Decimal("86.0"),
    goals={
        "primary_goal": "hypertrophy",
        "muscle_priorities": ["chest", "shoulders", "triceps"],
        "weak_muscles": ["chest", "upper_chest", "triceps"],
        "strong_muscles": ["legs"],
    },
    injuries={
        "has_injury": True,
        "injury_type": "mild_neck",
        "aggravating_movements": ["heavy_shoulder_press"],
        "disallowed_exercises": ["heavy_shrug"],
    },
    equipment={
        "has_barbell": True,
        "has_dumbbell": True,
        "has_machines": True,
        "has_cable": True,
        "has_full_gym": True,
    },
    training_background={"level": "intermediate"},
    training_conditions={"training_days_per_week": 4, "session_duration_minutes": 75},
)

document, warnings = gen.generate_document(
    coach=coach,
    student=student,
    visit=None,
    template=template,
    request={
        "program_type": "workout",
        "level": "intermediate",
        "days_per_week": 4,
        "title": "برنامه محمد طاهری — پذیرش Generator",
    },
)

print("=" * 72)
print(document["title"])
print(document["training"]["summary"])
print("warnings:", warnings)
print("=" * 72)

evidence = document["generator"]["evidence"]
for day in document["training"]["days"]:
    print()
    print(f"روز {day['order']}: {day['title']}")
    print(f"  target muscles: {', '.join(day['targetMuscles'])}")
    exercises = day["exercises"]
    total_sets = sum(int(e.get("sets") or 0) for e in exercises)
    print(f"  total exercises: {len(exercises)}")
    print(f"  total working sets: {total_sets}")
    by_muscle: Counter[str] = Counter()
    for e in exercises:
        by_muscle[e["targetMuscle"]] += int(e.get("sets") or 0)
    print(f"  sets per muscle: {dict(by_muscle)}")
    pairs = []
    seen_groups: set[str] = set()
    for e in exercises:
        gid = e.get("supersetGroupId")
        if gid and gid not in seen_groups and e.get("supersetPartnerName"):
            seen_groups.add(gid)
            if e.get("supersetWithPrevious"):
                pairs.append(f"{e['supersetPartnerName']} + {e['name']}")
            else:
                pairs.append(f"{e['name']} + {e['supersetPartnerName']}")
    print(f"  superset pairs: {pairs or '—'}")
    rest_dist = Counter(e.get("rest") for e in exercises)
    print(f"  rest distribution: {dict(rest_dist)}")
    bank = [e["name"] for e in exercises if e.get("selection_source") == "coach_bank"]
    print(f"  selected_from_coach_bank: {', '.join(bank) or '—'}")
    print(
        "  injury exclusions (global):",
        [x.get("name") for x in evidence.get("excluded_injury") or []],
    )
    skip_next = False
    for ex in exercises:
        if skip_next:
            skip_next = False
            continue
        partner = ex.get("supersetPartnerName")
        gid = ex.get("supersetGroupId")
        if gid and partner and not ex.get("supersetWithPrevious"):
            partner_ex = next(
                (p for p in exercises if p.get("supersetGroupId") == gid and p is not ex),
                None,
            )
            print(f"  - {ex['name']}")
            print(f"    + {partner}")
            print(
                f"      {ex['sets']}×{ex['reps']} | rest {ex['rest']} | {ex['targetMuscle']}"
                + (
                    f"  ||  {partner_ex['sets']}×{partner_ex['reps']} | rest {partner_ex['rest']}"
                    if partner_ex
                    else ""
                )
            )
            skip_next = True
            continue
        print(
            f"  - {ex['name']} — {ex['sets']}×{ex['reps']} | rest {ex['rest']} | {ex['targetMuscle']}"
        )

print()
print("=" * 72)
print("Evidence summary")
print("  selected_from_coach_bank:", evidence.get("selected_from_coach_bank"))
print(
    "  excluded_injury:",
    [x.get("name") for x in evidence.get("excluded_injury") or []],
)
print("  strong_muscles:", evidence.get("strong_muscles"))
print("  weak_muscles:", evidence.get("weak_muscles"))
print("  priority_muscles:", evidence.get("priority_muscles"))
print("  split_resolved:", json.dumps(evidence.get("split_resolved"), ensure_ascii=False))
