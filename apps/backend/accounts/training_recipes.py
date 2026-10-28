"""Validation for coach-authored, declarative training-system recipes."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from rest_framework.exceptions import ValidationError

RECIPE_VERSION = 1
MAX_STEPS = 24
MAX_REPEAT = 10
STEP_FIELDS = {
    "prescribe": {"sets", "reps", "seconds", "rest_seconds", "rpe"},
    "rest": {"seconds"},
    "load_change": {"direction", "percent"},
    "partial_range": {"mode", "count", "range"},
    "tempo": {"pattern", "hold_seconds"},
    "instruction": {"title", "text"},
    "repeat": {"count", "steps"},
}
TARGETS = {"all", "last_exercise", "last_isolation", "last_set", "first_compound"}
GROUP_MODES = {"same_muscle", "same_muscle_isolation", "antagonist", "any_eligible", "alternating"}


def _integer(value: Any, field: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or (isinstance(value, float) and not value.is_integer()):
        raise ValidationError({"recipe": [f"{field} must be an integer."]})
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"recipe": [f"{field} must be an integer."]}) from exc
    if number < minimum or number > maximum:
        raise ValidationError({"recipe": [f"{field} must be between {minimum} and {maximum}."]})
    return number


def tempo_seconds(pattern: str, hold_seconds=0) -> int:
    """Four phases: eccentric, bottom pause, concentric, top pause; legacy three phases remain valid."""
    phases = re.split(r"\s*[-:–]\s*", str(pattern).strip())
    if len(phases) not in {3, 4}:
        raise ValidationError({"recipe": ["Tempo needs three or four numeric phases."]})
    values = []
    for index, phase in enumerate(phases):
        values.append(
            1 if phase.upper() == "X" and index == 2 else _integer(phase, "tempo phase", 0, 30)
        )
    if not sum(values):
        raise ValidationError({"recipe": ["Tempo duration must be positive."]})
    return sum(values) + max(0, int(hold_seconds or 0) - values[1])


def _steps(value: Any, depth: int = 0) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value or len(value) > MAX_STEPS or depth > 2:
        raise ValidationError({"recipe": ["Steps must be a non-empty list with at most 24 items."]})
    result: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValidationError({"recipe": [f"Step {index + 1} must be an object."]})
        operation = str(item.get("op") or "")
        allowed = STEP_FIELDS.get(operation)
        if not allowed:
            raise ValidationError({"recipe": [f"Unsupported operation: {operation}."]})
        extra = set(item) - (allowed | {"op"})
        if extra:
            raise ValidationError(
                {"recipe": [f"Unsupported fields in {operation}: {sorted(extra)}"]}
            )
        step: dict[str, Any] = {"op": operation}
        if operation == "prescribe":
            if "sets" in item:
                step["sets"] = _integer(item["sets"], "sets", 1, 30)
            if "reps" in item:
                reps = str(item["reps"]).strip()
                if not reps or len(reps) > 40:
                    raise ValidationError({"recipe": ["reps must contain 1-40 characters."]})
                bounds = re.fullmatch(r"(\d+)(?:\s*[-–]\s*(\d+))?", reps)
                if bounds:
                    low = _integer(bounds[1], "minimum reps", 1, 100)
                    high = _integer(bounds[2] or bounds[1], "maximum reps", 1, 100)
                    if low > high:
                        raise ValidationError(
                            {"recipe": ["Minimum reps cannot exceed maximum reps."]}
                        )
                step["reps"] = reps
            if "seconds" in item:
                step["seconds"] = _integer(item["seconds"], "seconds", 1, 900)
            if "rest_seconds" in item:
                step["rest_seconds"] = _integer(item["rest_seconds"], "rest_seconds", 0, 900)
            if "rpe" in item:
                step["rpe"] = str(item["rpe"]).strip()[:40]
        elif operation == "rest":
            step["seconds"] = _integer(item.get("seconds"), "seconds", 0, 900)
        elif operation == "load_change":
            direction = str(item.get("direction") or "down")
            if direction not in {"up", "down"}:
                raise ValidationError({"recipe": ["load_change direction must be up or down."]})
            step["direction"] = direction
            step["percent"] = _integer(item.get("percent"), "percent", 1, 80)
        elif operation == "partial_range":
            mode = str(item.get("mode") or "")
            if mode not in {"one_and_half", "after_failure", "partial_only"}:
                raise ValidationError({"recipe": ["Unsupported partial range mode."]})
            step["mode"] = mode
            if "count" in item:
                step["count"] = _integer(item["count"], "count", 1, 30)
            if "range" in item:
                step["range"] = str(item["range"]).strip()[:80]
        elif operation == "tempo":
            pattern = str(item.get("pattern") or "").strip()
            if not pattern or len(pattern) > 24:
                raise ValidationError({"recipe": ["tempo pattern must contain 1-24 characters."]})
            step["pattern"] = pattern
            if "hold_seconds" in item:
                step["hold_seconds"] = _integer(item["hold_seconds"], "hold_seconds", 1, 120)
            tempo_seconds(step["pattern"], step.get("hold_seconds", 0))
        elif operation == "instruction":
            title = str(item.get("title") or "").strip()
            text = str(item.get("text") or "").strip()
            if not title or len(title) > 80 or not text or len(text) > 500:
                raise ValidationError(
                    {"recipe": ["Instruction title/text is missing or too long."]}
                )
            step["title"] = title
            step["text"] = text
        else:
            step["count"] = _integer(item.get("count"), "count", 1, MAX_REPEAT)
            step["steps"] = _steps(item.get("steps"), depth + 1)
        result.append(step)
    return result


def validate_training_recipe(value: Any, *, allow_empty: bool = True) -> dict[str, Any]:
    if value in (None, {}) and allow_empty:
        return {}
    if not isinstance(value, dict) or value.get("version") != RECIPE_VERSION:
        raise ValidationError({"recipe": ["A recipe with version 1 is required."]})
    allowed = {"version", "target", "grouping", "steps"}
    extra = set(value) - allowed
    if extra:
        raise ValidationError({"recipe": [f"Unsupported recipe fields: {sorted(extra)}"]})
    target = str(value.get("target") or "all")
    if target not in TARGETS:
        raise ValidationError({"recipe": [f"Unsupported target: {target}."]})
    result: dict[str, Any] = {"version": RECIPE_VERSION, "target": target}
    if "grouping" in value:
        if target == "first_compound":
            raise ValidationError(
                {
                    "recipe": [
                        "First-compound targeting cannot be combined with a multi-exercise group."
                    ]
                }
            )
        grouping = value["grouping"]
        if not isinstance(grouping, dict) or set(grouping) - {
            "size",
            "mode",
            "max_groups_per_session",
            "rest_between_seconds",
            "rest_after_seconds",
            "exercise_order",
            "exercise_prescriptions",
            "allow_compound",
        }:
            raise ValidationError({"recipe": ["grouping has unsupported fields."]})
        mode = str(grouping.get("mode") or "same_muscle")
        if mode not in GROUP_MODES:
            raise ValidationError({"recipe": [f"Unsupported grouping mode: {mode}."]})
        group_result = {
            "size": _integer(grouping.get("size", 2), "grouping.size", 2, 8),
            "mode": mode,
            "max_groups_per_session": _integer(
                grouping.get("max_groups_per_session", 1), "grouping.max_groups_per_session", 1, 10
            ),
            "rest_between_seconds": _integer(
                grouping.get("rest_between_seconds", 0), "grouping.rest_between_seconds", 0, 900
            ),
            "rest_after_seconds": _integer(
                grouping.get("rest_after_seconds", 90), "grouping.rest_after_seconds", 0, 900
            ),
            "allow_compound": bool(grouping.get("allow_compound", False)),
        }
        exercise_order = str(grouping.get("exercise_order") or "generated")
        if exercise_order not in {"generated", "isolation_first", "compound_first"}:
            raise ValidationError({"recipe": ["Unsupported grouping exercise_order."]})
        group_result["exercise_order"] = exercise_order
        if "exercise_prescriptions" in grouping:
            prescriptions = grouping["exercise_prescriptions"]
            if not isinstance(prescriptions, list) or len(prescriptions) != group_result["size"]:
                raise ValidationError(
                    {"recipe": ["Provide one prescription for each group exercise."]}
                )
            normalized_prescriptions = []
            for index, prescription in enumerate(prescriptions):
                if not isinstance(prescription, dict) or set(prescription) - {
                    "sets",
                    "reps",
                    "seconds",
                    "rest_seconds",
                    "rpe",
                }:
                    raise ValidationError(
                        {"recipe": [f"Group prescription {index + 1} is invalid."]}
                    )
                normalized = {}
                if "sets" in prescription:
                    normalized["sets"] = _integer(
                        prescription["sets"], f"group.prescription[{index}].sets", 1, 30
                    )
                if "reps" in prescription:
                    reps = str(prescription["reps"]).strip()
                    if not reps or len(reps) > 40:
                        raise ValidationError(
                            {"recipe": ["Group reps must contain 1-40 characters."]}
                        )
                    normalized["reps"] = reps
                if "seconds" in prescription:
                    normalized["seconds"] = _integer(
                        prescription["seconds"], f"group.prescription[{index}].seconds", 1, 900
                    )
                if "rest_seconds" in prescription:
                    normalized["rest_seconds"] = _integer(
                        prescription["rest_seconds"],
                        f"group.prescription[{index}].rest_seconds",
                        0,
                        900,
                    )
                if "rpe" in prescription:
                    normalized["rpe"] = str(prescription["rpe"]).strip()[:40]
                normalized_prescriptions.append(normalized)
            group_result["exercise_prescriptions"] = normalized_prescriptions
        result["grouping"] = group_result
    result["steps"] = _steps(value.get("steps"))
    return deepcopy(result)
