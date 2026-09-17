"""Structured training-technique handlers used by the deterministic generator."""

from __future__ import annotations

from typing import Any

from accounts.models import CoachProfile, CoachTechnique, TrainingTechnique


def enabled_techniques_for_level(
    coach: CoachProfile,
    level: str,
    allowed_names: set[str] | None = None,
) -> list[CoachTechnique]:
    configs = list(
        CoachTechnique.objects.filter(coach=coach, enabled=True)
        .select_related("base_technique")
        .order_by("name")
    )
    enabled = [
        config
        for config in configs
        if not config.allowed_levels or level in (config.allowed_levels or [])
    ]
    configured_base_ids = {config.base_technique_id for config in configs if config.base_technique_id}
    normalized_names = {_technique_text(value) for value in (allowed_names or set())}
    for base in TrainingTechnique.objects.filter(is_active=True).order_by("sort_order", "name"):
        if base.id in configured_base_ids:
            continue
        allowed_by_level_default = base.handler_key == "superset" and level == "intermediate"
        allowed_by_rule = (
            _technique_text(base.key) in normalized_names
            or _technique_text(base.name) in normalized_names
        )
        if not (allowed_by_level_default or allowed_by_rule):
            continue
        enabled.append(
            CoachTechnique(
                coach=coach,
                base_technique=base,
                key=base.key,
                name=base.name,
                description=base.description,
                execution_method=base.execution_method,
                allowed_levels=[level],
                max_per_session=0,
                parameters={},
                enabled=True,
            )
        )
    return enabled


def _parameters(config: CoachTechnique) -> dict[str, Any]:
    return dict(config.parameters or {})


def _technique_text(value: str) -> str:
    return str(value or "").replace("‌", " ").strip().lower()


def _append_technique(exercise: dict, payload: dict) -> None:
    techniques = exercise.setdefault("techniques", [])
    techniques.append(payload)


def _apply_superset(days: list[dict], config: CoachTechnique) -> int:
    from programming.services.training_selection import _apply_real_supersets

    params = _parameters(config)
    max_pairs = int(params.get("max_pairs") or config.max_per_session or 1)
    applied = 0
    for day in days:
        before = sum(1 for exercise in day.get("exercises", []) if exercise.get("supersetGroupId"))
        _apply_real_supersets(day.get("exercises", []), allow=True, max_pairs=max_pairs)
        for exercise in day.get("exercises", []):
            if exercise.get("supersetGroupId"):
                _append_technique(
                    exercise,
                    {
                        "key": config.key,
                        "name": config.name,
                        "handler": "superset",
                        "config_id": str(config.id) if config.id else None,
                        "parameters": params,
                    },
                )
        after = sum(1 for exercise in day.get("exercises", []) if exercise.get("supersetGroupId"))
        applied += max(0, (after - before) // 2)
    return applied


def _apply_drop_set(days: list[dict], config: CoachTechnique) -> int:
    params = _parameters(config)
    drops = max(1, min(3, int(params.get("drops") or 1)))
    reduction_percent = max(1, min(80, int(params.get("reduction_percent") or 20)))
    limit = config.max_per_session
    applied = 0
    for day in days:
        day_applied = 0
        for exercise in reversed(day.get("exercises", [])):
            if limit and day_applied >= limit:
                break
            if exercise.get("supersetGroupId") or exercise.get("techniques"):
                continue
            if int(exercise.get("sets") or 0) < 1:
                continue
            payload = {
                "key": config.key,
                "name": config.name,
                "handler": "drop_set",
                "config_id": str(config.id) if config.id else None,
                "parameters": {"drops": drops, "reduction_percent": reduction_percent},
            }
            _append_technique(exercise, payload)
            exercise["dropSet"] = payload["parameters"]
            exercise["raw_prescription"] = (
                f"{exercise.get('raw_prescription') or ''} + {drops} دراپ‌ست با کاهش "
                f"{reduction_percent}%"
            ).strip()
            exercise.setdefault("notes", "")
            exercise["notes"] = f"{exercise['notes']} {config.name}: {drops} دراپ‌ست با کاهش {reduction_percent}%".strip()
            applied += 1
            day_applied += 1
            if limit and day_applied >= limit:
                break
    return applied


def apply_structured_techniques(
    days: list[dict],
    coach: CoachProfile,
    level: str,
    allowed_names: set[str] | None = None,
) -> tuple[list[dict], list[dict], set[str]]:
    """Apply known handlers and report custom techniques without pretending to execute them."""

    evidence: list[dict] = []
    handled_keys: set[str] = set()
    for config in enabled_techniques_for_level(coach, level, allowed_names=allowed_names):
        base = config.base_technique
        handler = base.handler_key if base else ""
        parameters = _parameters(config)
        if handler == "superset":
            count = _apply_superset(days, config)
            handled_keys.add(config.key)
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": handler,
                    "config_id": str(config.id) if config.id else None,
                    "source": "coach" if config.id else "platform_default",
                    "parameters": parameters,
                    "applied_count": count,
                    "status": "applied" if count else "no_eligible_pair",
                }
            )
        elif handler == "drop_set":
            count = _apply_drop_set(days, config)
            handled_keys.add(config.key)
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": handler,
                    "config_id": str(config.id) if config.id else None,
                    "source": "coach" if config.id else "platform_default",
                    "parameters": parameters,
                    "applied_count": count,
                    "status": "applied" if count else "no_eligible_exercise",
                }
            )
        else:
            evidence.append(
                {
                    "key": config.key,
                    "name": config.name,
                    "handler": None,
                    "config_id": str(config.id) if config.id else None,
                    "source": "coach" if config.id else "platform_default",
                    "parameters": parameters,
                    "applied_count": 0,
                    "status": "saved_manual_only",
                }
            )
    return days, evidence, handled_keys
