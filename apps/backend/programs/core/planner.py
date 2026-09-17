import hashlib
import random
from collections import Counter
from typing import Any

from programs.models import CoachRule, CoachTemplate, Exercise, GeneratedProgram, StudentProfile

LEVEL_RANK = {"beginner": 1, "intermediate": 2, "advanced": 3}


def stable_seed(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def template_score(template: CoachTemplate, student: StudentProfile) -> tuple[int, list[str]]:
    score = template.priority
    reasons = [f"base priority {template.priority}"]
    if template.goal == student.goal:
        score += 30
        reasons.append("goal matches")
    if template.level == student.level:
        score += 20
        reasons.append("level matches")
    if template.days_per_week == student.days_per_week:
        score += 30
        reasons.append("days_per_week matches")
    else:
        score -= abs(template.days_per_week - student.days_per_week) * 15
        reasons.append("days_per_week is close but not exact")
    split_muscles = {m for day in template.split for m in day.get("muscles", [])}
    focus_hits = set(student.focus_muscles or []) & split_muscles
    if focus_hits:
        score += len(focus_hits) * 8
        reasons.append(f"focus muscles covered: {sorted(focus_hits)}")
    excluded_injuries = template.rules.get("excluded_injuries", []) if template.rules else []
    if set(student.injuries or []) & set(excluded_injuries):
        score -= 1000
        reasons.append("template excluded because of injury conflict")
    return score, reasons


def match_template(student: StudentProfile) -> dict[str, Any]:
    candidates = CoachTemplate.objects.filter(coach=student.coach, is_active=True)
    scored = []
    for template in candidates:
        score, reasons = template_score(template, student)
        scored.append({"template": template, "score": score, "reasons": reasons})
    if not scored:
        raise ValueError("No active template exists for this coach.")
    scored.sort(key=lambda x: x["score"], reverse=True)
    best = scored[0]
    return {
        "template": best["template"],
        "score": best["score"],
        "reasons": best["reasons"],
        "alternatives": [
            {"template_id": x["template"].id, "template_name": x["template"].name, "score": x["score"]}
            for x in scored[1:5]
        ],
    }


def active_rules(student: StudentProfile) -> list[CoachRule]:
    return list(CoachRule.objects.filter(coach=student.coach, is_active=True).order_by("priority", "id"))


def rule_state(student: StudentProfile) -> dict[str, Any]:
    state = {
        "excluded_names": {x.lower() for x in student.disliked_exercises or []},
        "blocked_risk_tags": set(),
        "extra_sets": Counter(),
        "cap_sets": None,
        "preferred_equipment": set(student.available_equipment or []),
        "notes": [],
    }
    for rule in active_rules(student):
        p = rule.params or {}
        if rule.kind == "exclude_exercises":
            state["excluded_names"].update(x.lower() for x in p.get("names", []))
        elif rule.kind == "block_risk_tags":
            state["blocked_risk_tags"].update(p.get("risk_tags", []))
        elif rule.kind == "extra_sets_for_muscles":
            for muscle in p.get("muscles", []):
                state["extra_sets"][muscle] += int(p.get("sets", 1))
        elif rule.kind == "cap_sets":
            state["cap_sets"] = int(p.get("max_sets", 3))
        elif rule.kind == "prefer_equipment":
            state["preferred_equipment"].update(p.get("equipment", []))
        elif rule.kind == "note":
            state["notes"].append(p.get("text", rule.name))
    for injury in student.injuries or []:
        if injury in ["neck_pain", "shoulder_pain"]:
            state["blocked_risk_tags"].add("overhead")
        if injury in ["low_back_pain"]:
            state["blocked_risk_tags"].add("spine_load")
    return state


def exercise_weight(exercise: Exercise, student: StudentProfile, state: dict[str, Any], preferences: dict[int, Any]) -> int:
    weight = 50
    pref = preferences.get(exercise.id)
    if pref:
        weight = pref.weight
        if pref.allowed_levels and student.level not in pref.allowed_levels:
            return 0
        if set(student.injuries or []) & set(pref.blocked_for_injuries or []):
            return 0
    if exercise.name.lower() in state["excluded_names"]:
        return 0
    if set(exercise.risk_tags or []) & state["blocked_risk_tags"]:
        return 0
    if LEVEL_RANK.get(exercise.level, 1) > LEVEL_RANK.get(student.level, 1):
        return 0
    if state["preferred_equipment"] and exercise.equipment in state["preferred_equipment"]:
        weight += 15
    if exercise.primary_muscle in (student.focus_muscles or []):
        weight += 10
    return max(0, weight)


def recent_exercise_penalty(student: StudentProfile) -> Counter:
    recent = GeneratedProgram.objects.filter(student=student).order_by("-created_at")[:5]
    counter = Counter()
    for program in recent:
        for day in program.payload.get("days", []):
            for item in day.get("exercises", []):
                counter[item.get("exercise_id")] += 1
    return counter


def choose_exercises(student: StudentProfile, muscle: str, count: int, rng: random.Random, state: dict[str, Any], used_ids: set[int]) -> list[Exercise]:
    prefs = {p.exercise_id: p for p in student.coach.exercise_preferences.select_related("exercise")}
    penalties = recent_exercise_penalty(student)
    candidates = list(Exercise.objects.filter(primary_muscle=muscle, is_active=True))
    weighted = []
    for ex in candidates:
        if ex.id in used_ids:
            continue
        w = exercise_weight(ex, student, state, prefs)
        if w <= 0:
            continue
        w = max(1, w - penalties[ex.id] * 20)
        weighted.append((ex, w))
    if not weighted:
        return []
    selected = []
    pool = weighted[:]
    for _ in range(min(count, len(pool))):
        total = sum(w for _, w in pool)
        pick = rng.randint(1, total)
        upto = 0
        for idx, (ex, w) in enumerate(pool):
            upto += w
            if upto >= pick:
                selected.append(ex)
                used_ids.add(ex.id)
                pool.pop(idx)
                break
    return selected


def build_program(student: StudentProfile, template: CoachTemplate | None = None, seed: str | None = None, save: bool = True) -> dict[str, Any]:
    match = None
    if template is None:
        match = match_template(student)
        template = match["template"]
    seed = seed or stable_seed(student.id, template.id, GeneratedProgram.objects.filter(student=student).count() + 1)
    rng = random.Random(seed)
    state = rule_state(student)
    base_volume = {"sets": 3, "reps": "8-12", "rest_seconds": 90}
    base_volume.update(template.volume or {})
    mode_multiplier = {"strict": 1, "balanced": 2, "creative": 3}.get(student.coach.control_mode, 2)
    days = []
    used_ids: set[int] = set()
    for idx, day in enumerate(template.split, start=1):
        muscles = day.get("muscles", [])
        slots = int(day.get("slots", max(3, len(muscles))))
        per_muscle = max(1, slots // max(1, len(muscles)))
        day_items = []
        for muscle in muscles:
            count = per_muscle
            if muscle in (student.focus_muscles or []):
                count += 1 if student.coach.control_mode != "strict" else 0
            exercises = choose_exercises(student, muscle, count, rng, state, used_ids)
            for ex in exercises:
                sets = int(base_volume.get("sets", 3)) + state["extra_sets"].get(muscle, 0)
                if state["cap_sets"] is not None:
                    sets = min(sets, state["cap_sets"])
                day_items.append({
                    "exercise_id": ex.id,
                    "name": ex.name,
                    "muscle": ex.primary_muscle,
                    "equipment": ex.equipment,
                    "sets": sets,
                    "reps": base_volume.get("reps", "8-12"),
                    "rest_seconds": base_volume.get("rest_seconds", 90),
                })
        rng.shuffle(day_items)
        days.append({"day": idx, "name": day.get("name", f"Day {idx}"), "muscles": muscles, "exercises": day_items})
    exercise_ids = [str(item["exercise_id"]) for day in days for item in day["exercises"]]
    signature = hashlib.sha256(",".join(sorted(exercise_ids)).encode()).hexdigest()[:20]
    payload = {
        "coach": {"id": student.coach.id, "name": student.coach.name, "control_mode": student.coach.control_mode},
        "student": {"id": student.id, "name": student.name, "goal": student.goal, "level": student.level},
        "template": {"id": template.id, "name": template.name},
        "template_selection": match and {"score": match["score"], "reasons": match["reasons"], "alternatives": match["alternatives"]},
        "seed": seed,
        "signature": signature,
        "notes": state["notes"],
        "days": days,
        "debug": {"active_rules": [r.code for r in active_rules(student)], "variation_mode": student.coach.control_mode, "variation_strength": mode_multiplier},
    }
    if save:
        GeneratedProgram.objects.create(coach=student.coach, student=student, template=template, seed=seed, signature=signature, payload=payload)
    return payload
