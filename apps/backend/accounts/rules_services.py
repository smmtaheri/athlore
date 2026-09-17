"""Coach rules aggregate load/save and template/exercise helpers."""

from __future__ import annotations

import copy
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import (
    CoachExercisePreference,
    CoachNutritionTemplate,
    CoachProfile,
    CoachRuleSet,
    CoachSupplementTemplate,
    Exercise,
    ExerciseBankGroup,
    GeneralRule,
    InjuryRule,
    LevelRule,
    MusclePriority,
    ProgramTemplate,
)

VALID_LEVELS = {"beginner", "intermediate", "advanced"}
VALID_IMPORTANCE = {"high", "medium", "low"}


def ensure_rule_set(coach: CoachProfile) -> CoachRuleSet:
    rule_set, _ = CoachRuleSet.objects.get_or_create(coach=coach)
    return rule_set


def _as_list(value: Any) -> list:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValidationError({"detail": "Expected a list."})
    return value


def _as_str_list(value: Any, field: str) -> list[str]:
    items = _as_list(value)
    out = []
    for item in items:
        if not isinstance(item, str):
            raise ValidationError({field: ["All items must be strings."]})
        text = item.strip()
        if text:
            out.append(text)
    return out


def serialize_template(t: ProgramTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "goal": t.goal,
        "main_goal": t.main_goal,
        "level": t.level,
        "days_per_week": t.days_per_week,
        "intensity": t.intensity,
        "volume": t.volume,
        "rest_time": t.rest_time,
        "split": list(t.split or []),
        "muscle_priority_order": list(t.muscle_priority_order or []),
        "special_rules": list(t.special_rules or []),
        "is_active": t.is_active,
        "is_archived": t.is_archived,
        "sort_order": t.sort_order,
        "created_at": t.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": t.updated_at.isoformat().replace("+00:00", "Z"),
    }


def serialize_level(r: LevelRule) -> dict:
    return {
        "id": r.level_key,
        "level_key": r.level_key,
        "intensity": r.intensity,
        "volume": r.volume,
        "allowed_techniques": list(r.allowed_techniques or []),
        "forbidden_exercises": list(r.forbidden_exercises or []),
        "required_exercises": list(r.required_exercises or []),
        "coach_notes": r.coach_notes,
    }


def serialize_injury(r: InjuryRule) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "forbidden_exercises": list(r.forbidden_exercises or []),
        "alternatives": list(r.alternatives or []),
        "notes": r.notes,
        "is_active": r.is_active,
        "sort_order": r.sort_order,
    }


def serialize_muscle_priority(r: MusclePriority) -> dict:
    return {
        "id": str(r.id),
        "muscle": r.muscle,
        "extra_exercises": r.extra_exercises,
        "extra_sets": r.extra_sets,
        "order_change": r.order_change,
        "notes": r.notes,
        "sort_order": r.sort_order,
    }


def serialize_bank_group(g: ExerciseBankGroup) -> dict:
    return {
        "id": str(g.id),
        "group": g.group_name,
        "group_name": g.group_name,
        "favorite_exercises": list(g.favorite_exercises or []),
        "beginner_friendly": list(g.beginner_friendly or []),
        "professional_friendly": list(g.professional_friendly or []),
        "forbidden_exercises": list(g.forbidden_exercises or []),
        "sort_order": g.sort_order,
    }


def serialize_general_rule(r: GeneralRule) -> dict:
    return {
        "id": str(r.id),
        "title": r.title,
        "description": r.description,
        "category": r.category,
        "importance": r.importance,
        "is_active": r.is_active,
        "order": r.sort_order,
        "sort_order": r.sort_order,
    }


def serialize_exercise(ex: Exercise, preference: CoachExercisePreference | None = None) -> dict:
    pref = preference
    if pref is None:
        pref = ex.preferences.filter(coach_id=ex.coach_id).first()
    return {
        "id": str(ex.id),
        "name": ex.name,
        "name_en": ex.name_en,
        "primary_muscle": ex.primary_muscle,
        "secondary_muscles": list(ex.secondary_muscles or []),
        "equipment": ex.equipment,
        "level": ex.level,
        "movement_pattern": ex.movement_pattern,
        "laterality": ex.laterality,
        "risk_tags": list(ex.risk_tags or []),
        "source_document": ex.source_document,
        "aliases": list(ex.aliases.order_by("alias").values_list("alias", flat=True)),
        "is_active": ex.is_active,
        "is_archived": ex.is_archived,
        "is_preferred": bool(pref.is_preferred) if pref else False,
        "is_prohibited": bool(pref.is_prohibited) if pref else False,
        "suitable_levels": list(pref.suitable_levels or []) if pref else [],
        "preference_notes": pref.notes if pref else "",
        "created_at": ex.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": ex.updated_at.isoformat().replace("+00:00", "Z"),
    }


def serialize_nutrition_template_summary(t: CoachNutritionTemplate) -> dict:
    """Lightweight summary for the coach rules aggregate (full item detail is fetched separately)."""
    slot_count = t.meal_slots.count()
    item_count = sum(
        option.items.count() for slot in t.meal_slots.all() for option in slot.options.all()
    )
    return {
        "id": str(t.id),
        "name": t.name,
        "purpose": t.purpose,
        "day_type": t.day_type,
        "status": t.status,
        "needs_coach_review": t.needs_coach_review,
        "is_eligible_for_auto_select": t.is_eligible_for_auto_select,
        "source_document": t.source_document,
        "source_version": t.source_version,
        "meal_slot_count": slot_count,
        "item_count": item_count,
        "created_at": t.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": t.updated_at.isoformat().replace("+00:00", "Z"),
    }


def serialize_supplement_template_summary(t: CoachSupplementTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "status": t.status,
        "needs_coach_review": t.needs_coach_review,
        "is_eligible_for_auto_select": t.is_eligible_for_auto_select,
        "source_documents": list(t.source_documents or []),
        "item_count": t.items.count(),
        "created_at": t.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": t.updated_at.isoformat().replace("+00:00", "Z"),
    }


def get_coach_rules_aggregate(coach: CoachProfile) -> dict:
    rule_set = ensure_rule_set(coach)
    templates = [
        serialize_template(t)
        for t in rule_set.templates.filter(is_archived=False).order_by("sort_order", "name")
    ]
    levels = [serialize_level(r) for r in rule_set.level_rules.order_by("level_key")]
    injuries = [serialize_injury(r) for r in rule_set.injury_rules.order_by("sort_order", "name")]
    muscle_priorities = [
        serialize_muscle_priority(r)
        for r in rule_set.muscle_priorities.order_by("sort_order", "muscle")
    ]
    exercise_bank = [
        serialize_bank_group(g)
        for g in rule_set.exercise_bank_groups.order_by("sort_order", "group_name")
    ]
    general_items = [
        serialize_general_rule(r) for r in rule_set.general_rules.order_by("sort_order", "title")
    ]
    nutrition_templates = [
        serialize_nutrition_template_summary(t)
        for t in rule_set.nutrition_templates.order_by("name")
    ]
    supplement_templates = [
        serialize_supplement_template_summary(t)
        for t in coach.supplement_templates.order_by("name")
    ]
    return {
        "updated_at": rule_set.updated_at.isoformat().replace("+00:00", "Z"),
        "schema_version": rule_set.schema_version,
        "templates": templates,
        "levels": levels,
        "injuries": injuries,
        "muscle_priorities": muscle_priorities,
        "exercise_bank": exercise_bank,
        "general_rules": {
            "extra_notes": rule_set.general_extra_notes,
            "items": general_items,
        },
        "nutrition_templates": nutrition_templates,
        "supplement_templates": supplement_templates,
    }


def _validate_template_payload(item: dict, *, require_name: bool = True) -> dict:
    if not isinstance(item, dict):
        raise ValidationError({"templates": ["Each template must be an object."]})
    name = str(item.get("name") or "").strip()
    if require_name and not name:
        raise ValidationError({"templates": ["name is required."]})
    level = str(item.get("level") or "").strip()
    if level not in VALID_LEVELS:
        raise ValidationError({"templates": [f"Invalid level: {level}"]})
    days = item.get("days_per_week")
    try:
        days_int = int(days)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"templates": ["days_per_week must be 1-7."]}) from exc
    if days_int < 1 or days_int > 7:
        raise ValidationError({"templates": ["days_per_week must be 1-7."]})
    split = _as_str_list(item.get("split", []), "split")
    if split and len(split) != days_int:
        raise ValidationError(
            {"templates": [f"split length ({len(split)}) must equal days_per_week ({days_int})."]}
        )
    return {
        "name": name,
        "goal": str(item.get("goal") or "").strip(),
        "main_goal": str(item.get("main_goal") or "").strip(),
        "level": level,
        "days_per_week": days_int,
        "intensity": str(item.get("intensity") or "").strip(),
        "volume": str(item.get("volume") or "").strip(),
        "rest_time": str(item.get("rest_time") or "").strip(),
        "split": split,
        "muscle_priority_order": _as_str_list(
            item.get("muscle_priority_order", []), "muscle_priority_order"
        ),
        "special_rules": _as_str_list(item.get("special_rules", []), "special_rules"),
        "is_active": bool(item.get("is_active", True)),
        "sort_order": int(item.get("sort_order") or 0),
    }


@transaction.atomic
def replace_coach_rules(coach: CoachProfile, payload: dict, *, partial: bool = False) -> dict:
    """Idempotent full or partial replace of coach rules aggregate."""
    if not isinstance(payload, dict):
        raise ValidationError({"detail": "Body must be an object."})
    # Reject client-controlled ownership
    for banned in ("coach", "coach_id", "rule_set_id"):
        if banned in payload:
            raise ValidationError({banned: ["Client-controlled ownership is not allowed."]})

    rule_set = ensure_rule_set(coach)
    sections = set(payload.keys()) - {"updated_at", "schema_version"}
    known = {
        "templates",
        "levels",
        "injuries",
        "muscle_priorities",
        "exercise_bank",
        "general_rules",
    }
    if not partial and not known.issubset(sections | known):
        # Full PUT expects the main sections; missing sections clear to empty.
        pass
    if partial and not sections.intersection(known):
        raise ValidationError({"detail": "No updatable sections provided."})

    replace_all = not partial

    if replace_all or "templates" in payload:
        templates = _as_list(payload.get("templates", []))
        rule_set.templates.all().delete()
        for idx, raw in enumerate(templates):
            data = _validate_template_payload(raw)
            ProgramTemplate.objects.create(
                rule_set=rule_set,
                coach=coach,
                sort_order=data.pop("sort_order", idx),
                **data,
            )

    if replace_all or "levels" in payload:
        levels = _as_list(payload.get("levels", []))
        rule_set.level_rules.all().delete()
        for raw in levels:
            if not isinstance(raw, dict):
                raise ValidationError({"levels": ["Each level must be an object."]})
            level_key = str(raw.get("level_key") or raw.get("id") or "").strip()
            if level_key not in VALID_LEVELS:
                raise ValidationError({"levels": [f"Invalid level_key: {level_key}"]})
            LevelRule.objects.create(
                rule_set=rule_set,
                coach=coach,
                level_key=level_key,
                intensity=str(raw.get("intensity") or ""),
                volume=str(raw.get("volume") or ""),
                allowed_techniques=_as_str_list(
                    raw.get("allowed_techniques", []), "allowed_techniques"
                ),
                forbidden_exercises=_as_str_list(
                    raw.get("forbidden_exercises", []), "forbidden_exercises"
                ),
                required_exercises=_as_str_list(
                    raw.get("required_exercises", []), "required_exercises"
                ),
                coach_notes=str(raw.get("coach_notes") or ""),
            )

    if replace_all or "injuries" in payload:
        injuries = _as_list(payload.get("injuries", []))
        rule_set.injury_rules.all().delete()
        for idx, raw in enumerate(injuries):
            if not isinstance(raw, dict):
                raise ValidationError({"injuries": ["Each injury must be an object."]})
            name = str(raw.get("name") or "").strip()
            if not name:
                raise ValidationError({"injuries": ["name is required."]})
            InjuryRule.objects.create(
                rule_set=rule_set,
                coach=coach,
                name=name,
                forbidden_exercises=_as_str_list(
                    raw.get("forbidden_exercises", []), "forbidden_exercises"
                ),
                alternatives=_as_str_list(raw.get("alternatives", []), "alternatives"),
                notes=str(raw.get("notes") or ""),
                is_active=bool(raw.get("is_active", True)),
                sort_order=int(raw.get("sort_order") or idx),
            )

    if replace_all or "muscle_priorities" in payload:
        priorities = _as_list(payload.get("muscle_priorities", []))
        rule_set.muscle_priorities.all().delete()
        for idx, raw in enumerate(priorities):
            if not isinstance(raw, dict):
                raise ValidationError(
                    {"muscle_priorities": ["Each muscle priority must be an object."]}
                )
            muscle = str(raw.get("muscle") or "").strip()
            if not muscle:
                raise ValidationError({"muscle_priorities": ["muscle is required."]})
            MusclePriority.objects.create(
                rule_set=rule_set,
                coach=coach,
                muscle=muscle,
                extra_exercises=max(0, int(raw.get("extra_exercises") or 0)),
                extra_sets=max(0, int(raw.get("extra_sets") or 0)),
                order_change=str(raw.get("order_change") or ""),
                notes=str(raw.get("notes") or ""),
                sort_order=int(raw.get("sort_order") or idx),
            )

    if replace_all or "exercise_bank" in payload:
        bank = _as_list(payload.get("exercise_bank", []))
        rule_set.exercise_bank_groups.all().delete()
        for idx, raw in enumerate(bank):
            if not isinstance(raw, dict):
                raise ValidationError({"exercise_bank": ["Each bank group must be an object."]})
            group_name = str(raw.get("group") or raw.get("group_name") or "").strip()
            if not group_name:
                raise ValidationError({"exercise_bank": ["group is required."]})
            ExerciseBankGroup.objects.create(
                rule_set=rule_set,
                coach=coach,
                group_name=group_name,
                favorite_exercises=_as_str_list(
                    raw.get("favorite_exercises", []), "favorite_exercises"
                ),
                beginner_friendly=_as_str_list(
                    raw.get("beginner_friendly", []), "beginner_friendly"
                ),
                professional_friendly=_as_str_list(
                    raw.get("professional_friendly", []), "professional_friendly"
                ),
                forbidden_exercises=_as_str_list(
                    raw.get("forbidden_exercises", []), "forbidden_exercises"
                ),
                sort_order=int(raw.get("sort_order") or idx),
            )

    if replace_all or "general_rules" in payload:
        general = payload.get("general_rules") or {}
        if not isinstance(general, dict):
            raise ValidationError({"general_rules": ["Must be an object."]})
        rule_set.general_extra_notes = str(general.get("extra_notes") or "")
        rule_set.general_rules.all().delete()
        items = _as_list(general.get("items", []))
        for idx, raw in enumerate(items):
            if not isinstance(raw, dict):
                raise ValidationError({"general_rules": ["Each item must be an object."]})
            title = str(raw.get("title") or "").strip()
            if not title:
                raise ValidationError({"general_rules": ["title is required."]})
            importance = str(raw.get("importance") or "medium").strip()
            if importance not in VALID_IMPORTANCE:
                raise ValidationError({"general_rules": [f"Invalid importance: {importance}"]})
            GeneralRule.objects.create(
                rule_set=rule_set,
                coach=coach,
                title=title,
                description=str(raw.get("description") or ""),
                category=str(raw.get("category") or ""),
                importance=importance,
                is_active=bool(raw.get("is_active", True)),
                sort_order=int(raw.get("order") or raw.get("sort_order") or idx),
            )

    rule_set.updated_at = timezone.now()
    rule_set.save(update_fields=["general_extra_notes", "updated_at"])
    return get_coach_rules_aggregate(coach)


@transaction.atomic
def create_template(coach: CoachProfile, payload: dict) -> ProgramTemplate:
    rule_set = ensure_rule_set(coach)
    data = _validate_template_payload(payload)
    return ProgramTemplate.objects.create(rule_set=rule_set, coach=coach, **data)


@transaction.atomic
def update_template(template: ProgramTemplate, payload: dict) -> ProgramTemplate:
    merged = serialize_template(template)
    merged.update(payload)
    data = _validate_template_payload(merged)
    for key, value in data.items():
        setattr(template, key, value)
    if "is_archived" in payload:
        template.is_archived = bool(payload["is_archived"])
    template.save()
    return template


@transaction.atomic
def delete_template(template: ProgramTemplate) -> None:
    """Soft-archive templates so generation history retains references by id."""
    template.is_archived = True
    template.is_active = False
    template.save(update_fields=["is_archived", "is_active", "updated_at"])


@transaction.atomic
def create_exercise(coach: CoachProfile, payload: dict) -> Exercise:
    name = str(payload.get("name") or "").strip()
    primary = str(payload.get("primary_muscle") or "").strip()
    if not name or not primary:
        raise ValidationError({"name": ["name and primary_muscle are required."]})
    if Exercise.objects.filter(coach=coach, name=name, primary_muscle=primary).exists():
        raise ValidationError({"name": ["Exercise already exists for this muscle."]})
    ex = Exercise.objects.create(
        coach=coach,
        name=name,
        primary_muscle=primary,
        secondary_muscles=_as_str_list(payload.get("secondary_muscles", []), "secondary_muscles"),
        equipment=str(payload.get("equipment") or ""),
        level=str(payload.get("level") or Exercise.Level.BEGINNER),
        movement_pattern=str(payload.get("movement_pattern") or ""),
        risk_tags=_as_str_list(payload.get("risk_tags", []), "risk_tags"),
        is_active=bool(payload.get("is_active", True)),
    )
    _upsert_preference(coach, ex, payload)
    return ex


def _upsert_preference(coach: CoachProfile, ex: Exercise, payload: dict) -> None:
    pref_fields = ("is_preferred", "is_prohibited", "suitable_levels", "preference_notes")
    if not any(k in payload for k in pref_fields):
        return
    pref, _ = CoachExercisePreference.objects.get_or_create(coach=coach, exercise=ex)
    if "is_preferred" in payload:
        pref.is_preferred = bool(payload["is_preferred"])
    if "is_prohibited" in payload:
        pref.is_prohibited = bool(payload["is_prohibited"])
    if "suitable_levels" in payload:
        pref.suitable_levels = _as_str_list(payload.get("suitable_levels"), "suitable_levels")
    if "preference_notes" in payload:
        pref.notes = str(payload.get("preference_notes") or "")
    pref.save()


@transaction.atomic
def update_exercise(exercise: Exercise, payload: dict) -> Exercise:
    if "name" in payload:
        exercise.name = str(payload["name"]).strip() or exercise.name
    if "primary_muscle" in payload:
        exercise.primary_muscle = str(payload["primary_muscle"]).strip() or exercise.primary_muscle
    if "secondary_muscles" in payload:
        exercise.secondary_muscles = _as_str_list(payload["secondary_muscles"], "secondary_muscles")
    if "equipment" in payload:
        exercise.equipment = str(payload["equipment"] or "")
    if "level" in payload:
        exercise.level = str(payload["level"] or exercise.level)
    if "movement_pattern" in payload:
        exercise.movement_pattern = str(payload["movement_pattern"] or "")
    if "risk_tags" in payload:
        exercise.risk_tags = _as_str_list(payload["risk_tags"], "risk_tags")
    if "is_active" in payload:
        exercise.is_active = bool(payload["is_active"])
    if "is_archived" in payload:
        exercise.is_archived = bool(payload["is_archived"])
    exercise.save()
    _upsert_preference(exercise.coach, exercise, payload)
    return exercise


@transaction.atomic
def archive_exercise(exercise: Exercise) -> Exercise:
    """Safe delete: archive so historical program name snapshots remain valid."""
    exercise.is_archived = True
    exercise.is_active = False
    exercise.save(update_fields=["is_archived", "is_active", "updated_at"])
    return exercise


def deep_copy_json(value: Any) -> Any:
    return copy.deepcopy(value)
