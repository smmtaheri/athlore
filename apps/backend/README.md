# Coach Copilot Custom

A fresh Django + DRF MVP for coach-specific workout program generation.

The core idea:

- Each coach has a profile and their own style.
- Each coach can define very simple templates: days, muscles, slots, volume.
- Each coach can add/update rules from the API without changing code.
- Each coach can control exercise preferences.
- Generated programs are saved in history.
- The generator uses controlled variation so two similar students do not always get identical programs.

## Main concepts

### Coach
The owner of templates, rules, exercise preferences, students, and generated programs.

### Template
Kept intentionally simple. A coach only needs to describe days like this:

```json
[
  {"name": "Day 1", "muscles": ["chest", "back", "legs"], "slots": 5},
  {"name": "Day 2", "muscles": ["back", "shoulders", "legs"], "slots": 5},
  {"name": "Day 3", "muscles": ["chest", "back", "shoulders"], "slots": 5}
]
```

The system chooses actual exercises from the coach's allowed/preferred exercise pool.

### Rule
A coach can add rules from API. Supported rule kinds in this MVP:

- `exclude_exercises`
- `block_risk_tags`
- `extra_sets_for_muscles`
- `cap_sets`
- `prefer_equipment`
- `note`

### Exercise preference
A coach can say which exercises they like, dislike, block for injuries, or allow only for certain levels.

### Program history
Every generated program is saved with:

- coach
- student
- selected template
- seed
- signature
- full payload

This lets the system reduce repetition for future programs.

---

## Setup

Requires **Python 3.12** and [uv](https://docs.astral.sh/uv/).

```bash
cd coach-assistant-backend
uv sync --frozen
uv run python manage.py migrate
uv run python manage.py runserver 0.0.0.0:8000
```

Dev tools (ruff, pytest, pip-audit, coverage) install with the default `dev` dependency group:

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run pip-audit
uv run python manage.py check
```

Health check:

```bash
curl http://127.0.0.1:8000/api/coaches/
```

---

## Useful API calls

### 1. List coaches

```bash
curl http://127.0.0.1:8000/api/coaches/
```

### 2. Create a coach

```bash
curl -X POST http://127.0.0.1:8000/api/coaches/ \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Coach Mohammad",
    "email": "coach@example.com",
    "style_notes": "I like simple beginner-safe hypertrophy plans.",
    "control_mode": "balanced",
    "default_session_minutes": 60
  }'
```

`control_mode` can be:

- `strict`: less variation, closer to exact coach rules
- `balanced`: good default
- `creative`: more variation from allowed movements

### 3. Create a simple coach template

```bash
curl -X POST http://127.0.0.1:8000/api/templates/ \
  -H 'Content-Type: application/json' \
  -d '{
    "coach": 1,
    "name": "My Simple 3 Day Full Body",
    "goal": "hypertrophy",
    "level": "beginner",
    "days_per_week": 3,
    "priority": 80,
    "is_active": true,
    "split": [
      {"name": "Day 1", "muscles": ["chest", "back", "legs"], "slots": 5},
      {"name": "Day 2", "muscles": ["back", "shoulders", "legs"], "slots": 5},
      {"name": "Day 3", "muscles": ["chest", "back", "shoulders"], "slots": 5}
    ],
    "volume": {"sets": 3, "reps": "8-12", "rest_seconds": 90},
    "rules": {},
    "notes": "Simple template for beginner hypertrophy."
  }'
```

### 4. Create a coach rule

Example: block overhead exercises.

```bash
curl -X POST http://127.0.0.1:8000/api/rules/ \
  -H 'Content-Type: application/json' \
  -d '{
    "coach": 1,
    "code": "no-overhead-for-neck",
    "name": "No overhead work for neck pain",
    "kind": "block_risk_tags",
    "params": {"risk_tags": ["overhead"]},
    "priority": 10,
    "is_active": true
  }'
```

Example: add one extra set for chest and back.

```bash
curl -X POST http://127.0.0.1:8000/api/rules/ \
  -H 'Content-Type: application/json' \
  -d '{
    "coach": 1,
    "code": "extra-chest-back",
    "name": "Extra volume for chest and back",
    "kind": "extra_sets_for_muscles",
    "params": {"muscles": ["chest", "back"], "sets": 1},
    "priority": 20,
    "is_active": true
  }'
```

### 5. Create a student

```bash
curl -X POST http://127.0.0.1:8000/api/students/ \
  -H 'Content-Type: application/json' \
  -d '{
    "coach": 1,
    "name": "New Beginner Student",
    "goal": "hypertrophy",
    "level": "beginner",
    "days_per_week": 3,
    "session_minutes": 60,
    "focus_muscles": ["chest", "back"],
    "injuries": ["neck_pain"],
    "available_equipment": ["machine", "cable", "dumbbell"],
    "disliked_exercises": [],
    "notes": "Wants muscle gain but has neck pain."
  }'
```

### 6. Check which template the student matches

```bash
curl -X POST http://127.0.0.1:8000/api/templates/match/ \
  -H 'Content-Type: application/json' \
  -d '{"student_id": 1}'
```

The response includes:

- `template_id`
- `template_name`
- `score`
- `reasons`
- `alternatives`

### 7. Generate a program automatically

```bash
curl -X POST http://127.0.0.1:8000/api/programs/generate/ \
  -H 'Content-Type: application/json' \
  -d '{"student_id": 1}'
```

The response includes the selected template, seed, signature, days, exercises, notes, and debug info.

### 8. Generate using a specific template

```bash
curl -X POST http://127.0.0.1:8000/api/programs/generate/ \
  -H 'Content-Type: application/json' \
  -d '{"student_id": 1, "template_id": 1}'
```

### 9. Generate with a fixed seed

Use this when you want repeatable output.

```bash
curl -X POST http://127.0.0.1:8000/api/programs/generate/ \
  -H 'Content-Type: application/json' \
  -d '{"student_id": 1, "seed": "demo-seed-123"}'
```

### 10. See generated program history

```bash
curl 'http://127.0.0.1:8000/api/programs/?student_id=1'
```

### 11. Update a rule

```bash
curl -X PATCH http://127.0.0.1:8000/api/rules/1/ \
  -H 'Content-Type: application/json' \
  -d '{"is_active": false}'
```

### 12. Update coach variation mode

```bash
curl -X PATCH http://127.0.0.1:8000/api/coaches/1/ \
  -H 'Content-Type: application/json' \
  -d '{"control_mode": "creative"}'
```

---

## What to ask a coach for

Ask the coach these simple questions:

1. For beginner/intermediate/advanced students, how many days per week do you usually program?
2. For each day, which muscles do you usually combine?
3. For each goal, how many sets/reps/rest do you prefer?
4. Which exercises are your favorites?
5. Which exercises do you never want to use?
6. Which exercises are blocked for injuries?
7. Do you want strict, balanced, or creative variation?

That is enough to build their system without making templates too hard.
