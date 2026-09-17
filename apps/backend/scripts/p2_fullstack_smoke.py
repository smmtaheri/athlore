#!/usr/bin/env python3
"""Bounded full-stack HTTP smoke for P2 (temporary Backend DB)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8765/api/v1"


def req(method: str, path: str, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            raw = resp.read().decode() or "{}"
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return exc.code, payload


def main() -> int:
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
    tmp.close()
    env = os.environ.copy()
    env["DJANGO_DB_NAME"] = tmp.name
    env["DJANGO_DEBUG"] = "true"
    migrate = subprocess.run(
        [str(ROOT / ".venv/bin/python"), "manage.py", "migrate", "--noinput"],
        cwd=ROOT,
        env=env,
        check=False,
    )
    if migrate.returncode != 0:
        print("migrate failed")
        return 1

    server = subprocess.Popen(
        [str(ROOT / ".venv/bin/python"), "manage.py", "runserver", "127.0.0.1:8765", "--noreload"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(40):
            try:
                status, _ = req("GET", "/dashboard/")
                if status in {401, 403}:
                    break
            except Exception:
                time.sleep(0.25)
        else:
            print("server did not start")
            return 1

        # Coach A
        status, payload = req(
            "POST",
            "/auth/register/",
            {
                "email": "p2-a@example.com",
                "password": "SecurePass123!",
                "full_name": "Coach A",
            },
        )
        assert status == 201, payload
        token_a = payload["tokens"]["access"]
        refresh_a = payload["tokens"]["refresh"]

        status, me = req("GET", "/me/", token=token_a)
        assert status == 200 and me["coach"]["display_name"] == "Coach A", me

        status, dash0 = req("GET", "/dashboard/", token=token_a)
        assert status == 200 and dash0["total_students"] == 0, dash0
        assert dash0["pdf_files_ready"] == 0 and dash0["pdf_generation_available"] is False

        status, student = req(
            "POST",
            "/students/",
            {
                "full_name": "محمد طاهری",
                "age": 27,
                "gender": "male",
                "height_cm": "182.0",
                "weight_kg": "86.0",
                "goals": {
                    "primary_goal": "hypertrophy",
                    "weak_muscles": ["chest"],
                    "muscle_priorities": ["chest"],
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
            token=token_a,
        )
        assert status == 201, student
        sid = student["id"]

        status, _ = req(
            "POST",
            f"/students/{sid}/visits/",
            {
                "visit_date": "2026-08-01",
                "current_weight_kg": "85.5",
                "previous_weight_kg": "86.0",
                "daily_energy_level": "good",
                "sleep_quality": "medium",
                "stress_level": "medium",
            },
            token=token_a,
        )
        assert status == 201

        rules = {
            "templates": [
                {
                    "name": "۴ روزه حجم متوسط",
                    "goal": "حجم",
                    "main_goal": "حجم",
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
            "levels": [],
            "injuries": [
                {
                    "name": "گردن درد",
                    "forbidden_exercises": ["پرس سرشانه سنگین", "شراگ سنگین"],
                    "alternatives": [],
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
                    "order_change": "",
                    "notes": "",
                    "sort_order": 0,
                }
            ],
            "exercise_bank": [
                {
                    "group": "سینه",
                    "favorite_exercises": ["پرس سینه هالتر"],
                    "beginner_friendly": [],
                    "professional_friendly": [],
                    "forbidden_exercises": [],
                    "sort_order": 0,
                },
                {
                    "group": "زیربغل",
                    "favorite_exercises": ["لت سیم کش"],
                    "beginner_friendly": [],
                    "professional_friendly": [],
                    "forbidden_exercises": [],
                    "sort_order": 1,
                },
                {
                    "group": "پا",
                    "favorite_exercises": ["پرس پا"],
                    "beginner_friendly": [],
                    "professional_friendly": [],
                    "forbidden_exercises": [],
                    "sort_order": 2,
                },
                {
                    "group": "سرشانه",
                    "favorite_exercises": ["نشر جانب دمبل"],
                    "beginner_friendly": [],
                    "professional_friendly": [],
                    "forbidden_exercises": [],
                    "sort_order": 3,
                },
            ],
            "general_rules": {"extra_notes": "", "items": []},
        }
        status, saved_rules = req("PUT", "/coach-rules/", rules, token=token_a)
        assert status == 200 and len(saved_rules["templates"]) == 1, saved_rules
        tid = saved_rules["templates"][0]["id"]

        status, gen = req(
            "POST",
            "/programs/generate/",
            {
                "student_id": sid,
                "template_id": tid,
                "program_type": "complete",
                "title": "P2 Smoke",
                "level": "intermediate",
                "days_per_week": 4,
            },
            token=token_a,
        )
        assert status == 201, gen
        pid = gen["program"]["id"]
        vid = gen["program"]["current_draft"]["id"]

        status, patched = req(
            "PATCH",
            f"/programs/{pid}/versions/{vid}/",
            {"training": {**gen["program"]["training"], "summary": "edited"}},
            token=token_a,
        )
        assert status == 200 and patched["training"]["summary"] == "edited", patched

        status, fin = req("POST", f"/programs/{pid}/versions/{vid}/finalize/", {}, token=token_a)
        assert status == 200 and fin["status"] == "finalized", fin

        status, nv = req(
            "POST", f"/programs/{pid}/versions/{vid}/new-version/", {}, token=token_a
        )
        assert status == 201 and nv["current_draft"]["version_number"] == 2, nv

        status, dup = req(
            "POST", f"/programs/{pid}/versions/{vid}/duplicate/", {}, token=token_a
        )
        assert status == 201 and dup["id"] != pid, dup

        status, programs = req("GET", "/programs/", token=token_a)
        assert status == 200 and programs["count"] >= 2, programs

        status, history = req("GET", f"/students/{sid}/programs/", token=token_a)
        assert status == 200 and history["count"] >= 2, history

        status, dash1 = req("GET", "/dashboard/", token=token_a)
        assert status == 200 and dash1["total_students"] == 1, dash1
        assert dash1["draft_programs"] >= 1

        # Refresh
        status, refreshed = req("POST", "/auth/refresh/", {"refresh": refresh_a})
        assert status == 200 and refreshed.get("access"), refreshed

        status, _ = req("POST", "/auth/logout/", {"refresh": refreshed.get("refresh", refresh_a)}, token=token_a)
        assert status == 204

        # Coach B isolation
        status, payload_b = req(
            "POST",
            "/auth/register/",
            {
                "email": "p2-b@example.com",
                "password": "SecurePass123!",
                "full_name": "Coach B",
            },
        )
        assert status == 201, payload_b
        token_b = payload_b["tokens"]["access"]
        status, _ = req("GET", f"/students/{sid}/", token=token_b)
        assert status == 404
        status, _ = req("GET", f"/programs/{pid}/", token=token_b)
        assert status == 404
        status, rules_b = req("GET", "/coach-rules/", token=token_b)
        assert status == 200 and rules_b["templates"] == []

        # Legacy anonymous API
        try:
            urllib.request.urlopen("http://127.0.0.1:8765/api/", timeout=5)
            print("legacy /api/ unexpectedly available")
            return 1
        except urllib.error.HTTPError as exc:
            assert exc.code == 404

        print("FULL-STACK SMOKE OK")
        return 0
    finally:
        server.terminate()
        server.wait(timeout=10)
        os.unlink(tmp.name)


if __name__ == "__main__":
    sys.exit(main())
