#!/usr/bin/env python3
"""Bounded full-stack HTTP smoke for P3 PDF artifacts (temporary DB + media)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8766/api/v1"
PYTHON = str(ROOT / ".venv/bin/python")


def req(method: str, path: str, body=None, token=None, raw=False):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            raw_bytes = resp.read()
            if raw:
                return resp.status, raw_bytes, dict(resp.headers)
            text = raw_bytes.decode() or "{}"
            return resp.status, json.loads(text) if text.strip() else {}, dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw_bytes = exc.read()
        if raw:
            return exc.code, raw_bytes, dict(exc.headers)
        try:
            payload = json.loads(raw_bytes.decode()) if raw_bytes else {}
        except json.JSONDecodeError:
            payload = {"raw": raw_bytes.decode(errors="replace")}
        return exc.code, payload, dict(exc.headers)


def main() -> int:
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
    tmp.close()
    media = tempfile.mkdtemp(prefix="ca-p3-media-")
    env = os.environ.copy()
    env["DJANGO_DB_NAME"] = tmp.name
    env["DJANGO_MEDIA_ROOT"] = media
    env["DJANGO_DEBUG"] = "true"
    env["PUBLIC_API_BASE_URL"] = "http://127.0.0.1:8766/api/v1"

    migrate = subprocess.run(
        [PYTHON, "manage.py", "migrate", "--noinput"],
        cwd=ROOT,
        env=env,
        check=False,
    )
    if migrate.returncode != 0:
        print("migrate failed")
        return 1

    server = subprocess.Popen(
        [PYTHON, "manage.py", "runserver", "127.0.0.1:8766", "--noreload"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(50):
            try:
                status, _, _ = req("GET", "/dashboard/")
                if status in {401, 403}:
                    break
            except Exception:
                time.sleep(0.25)
        else:
            print("server did not start")
            return 1

        status, payload, _ = req(
            "POST",
            "/auth/register/",
            {
                "email": "p3-a@example.com",
                "password": "SecurePass123!",
                "full_name": "آرمان مربی",
            },
        )
        assert status == 201, payload
        token_a = payload["tokens"]["access"]

        status, student, _ = req(
            "POST",
            "/students/",
            {
                "full_name": "محمد طاهری",
                "age": 27,
                "gender": "male",
                "height_cm": "182.0",
                "weight_kg": "86.0",
                "goals": {"primary_goal": "hypertrophy", "weak_muscles": ["chest"]},
                "injuries": {"has_injury": False},
                "training_background": {"level": "intermediate"},
                "training_conditions": {"training_days_per_week": 4},
            },
            token=token_a,
        )
        assert status == 201, student
        sid = student["id"]

        status, _, _ = req(
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
                    "name": "۴ روزه حجم",
                    "goal": "حجم",
                    "main_goal": "حجم",
                    "level": "intermediate",
                    "days_per_week": 4,
                    "intensity": "متوسط",
                    "volume": "متوسط",
                    "rest_time": "۹۰",
                    "split": ["سینه", "زیربغل", "پا", "سرشانه"],
                    "muscle_priority_order": ["سینه", "زیربغل", "پا", "سرشانه"],
                    "special_rules": [],
                    "is_active": True,
                    "sort_order": 0,
                }
            ],
            "levels": [],
            "injuries": [],
            "muscle_priorities": [],
            "exercise_bank": [
                {
                    "group": "سینه",
                    "favorite_exercises": ["پرس سینه هالتر", "Deadlift"],
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
                    "favorite_exercises": ["نشر جانب"],
                    "beginner_friendly": [],
                    "professional_friendly": [],
                    "forbidden_exercises": [],
                    "sort_order": 3,
                },
            ],
            "general_rules": {"extra_notes": "", "items": []},
        }
        status, saved_rules, _ = req("PUT", "/coach-rules/", rules, token=token_a)
        assert status == 200, saved_rules
        tid = saved_rules["templates"][0]["id"]

        status, gen, _ = req(
            "POST",
            "/programs/generate/",
            {
                "student_id": sid,
                "template_id": tid,
                "program_type": "complete",
                "title": "برنامه P3 محمد",
                "level": "intermediate",
                "days_per_week": 4,
            },
            token=token_a,
        )
        assert status == 201, gen
        pid = gen["program"]["id"]
        vid = gen["program"]["current_draft"]["id"]

        status, patched, _ = req(
            "PATCH",
            f"/programs/{pid}/versions/{vid}/",
            {"training": {**gen["program"]["training"], "summary": "edited-p3"}},
            token=token_a,
        )
        assert status == 200, patched

        # Draft PDF must fail
        status, draft_pdf, _ = req(
            "POST",
            f"/programs/{pid}/pdf-files/",
            {"program_version_id": vid},
            token=token_a,
        )
        assert status == 400 and draft_pdf["error"]["code"] == "version_not_finalized", draft_pdf

        status, fin, _ = req(
            "POST", f"/programs/{pid}/versions/{vid}/finalize/", {}, token=token_a
        )
        assert status == 200 and fin["status"] == "finalized", fin
        finalized_id = fin["id"]

        status, pdf, _ = req(
            "POST",
            f"/programs/{pid}/pdf-files/",
            {
                "program_version_id": finalized_id,
                "file_name": "mohammad-p3.pdf",
            },
            token=token_a,
        )
        assert status == 201 and pdf["status"] == "ready", pdf
        assert pdf["size_bytes"] and pdf["size_bytes"] > 0
        assert pdf["checksum_sha256"] and len(pdf["checksum_sha256"]) == 64
        pdf_id = pdf["id"]

        status, body, headers = req(
            "GET", f"/pdf-files/{pdf_id}/download/", token=token_a, raw=True
        )
        assert status == 200 and body.startswith(b"%PDF"), (status, body[:20])
        assert len(body) == pdf["size_bytes"]

        status, renamed, _ = req(
            "PATCH",
            f"/pdf-files/{pdf_id}/",
            {"file_name": "mohammad-renamed.pdf"},
            token=token_a,
        )
        assert status == 200 and renamed["file_name"] == "mohammad-renamed.pdf"

        status, share, _ = req(
            "POST",
            f"/pdf-files/{pdf_id}/share/",
            {"expires_in_days": 2},
            token=token_a,
        )
        assert status == 201 and share.get("token") and share.get("share_url"), share
        token = share["token"]

        status, shared_body, _ = req(
            "GET", f"/shared/pdf/{token}/", raw=True
        )
        assert status == 200 and shared_body.startswith(b"%PDF")

        status, _, _ = req("DELETE", f"/pdf-files/{pdf_id}/share/", token=token_a)
        assert status == 204
        status, _, _ = req("GET", f"/shared/pdf/{token}/", raw=True)
        assert status == 404

        status, regen, _ = req(
            "POST", f"/pdf-files/{pdf_id}/regenerate/", {}, token=token_a
        )
        assert status == 201 and regen["id"] != pdf_id, regen
        assert regen["regenerated_from_id"] == pdf_id

        status, listed, _ = req(f"GET", f"/students/{sid}/pdf-files/", token=token_a)
        assert status == 200 and listed["count"] == 2, listed

        status, dash, _ = req("GET", "/dashboard/", token=token_a)
        assert status == 200
        assert dash["pdf_generation_available"] is True
        assert dash["pdf_files_ready"] == 2
        assert dash["ready_pdf_files"] == 2

        status, payload_b, _ = req(
            "POST",
            "/auth/register/",
            {
                "email": "p3-b@example.com",
                "password": "SecurePass123!",
                "full_name": "Coach B",
            },
        )
        assert status == 201, payload_b
        token_b = payload_b["tokens"]["access"]
        for path in (
            f"/students/{sid}/",
            f"/programs/{pid}/",
            f"/pdf-files/{pdf_id}/",
            f"/pdf-files/{pdf_id}/download/",
            f"/students/{sid}/pdf-files/",
        ):
            status, _, _ = req("GET", path, token=token_b)
            assert status == 404, path

        try:
            urllib.request.urlopen("http://127.0.0.1:8766/api/", timeout=5)
            print("legacy /api/ unexpectedly available")
            return 1
        except urllib.error.HTTPError as exc:
            assert exc.code == 404

        print("PDF FULL-STACK SMOKE OK")
        return 0
    finally:
        server.terminate()
        server.wait(timeout=10)
        os.unlink(tmp.name)
        shutil.rmtree(media, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
