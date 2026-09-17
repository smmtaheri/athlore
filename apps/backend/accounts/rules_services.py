"""Coach rules aggregate load/save and template/exercise helpers."""

from __future__ import annotations

import copy
import re
from typing import Any

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import (
    CoachExercisePreference,
    CoachNutritionTemplate,
    CoachProfile,
    CoachRuleSet,
    CoachTechnique,
    EquipmentTaxonomy,
    CoachSupplementTemplate,
    Exercise,
    ExerciseBankGroup,
    ExerciseEquipment,
    ExerciseMuscleTarget,
    ExerciseSuitableLevel,
    GeneralRule,
    InjuryRule,
    LevelRule,
    MuscleRegion,
    MuscleTaxonomy,
    MusclePriority,
    ProgramTemplate,
    TrainingTechnique,
)

VALID_LEVELS = {"beginner", "intermediate", "advanced"}
VALID_IMPORTANCE = {"high", "medium", "low"}
SUPERSET_PAIRING_MODES = {
    "same_muscle_isolation",
    "same_muscle",
    "antagonist",
    "any_eligible",
}
EXERCISE_EXTERNAL_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,159}$")


def _valid_external_key(value: str) -> bool:
    return bool(EXERCISE_EXTERNAL_KEY_RE.fullmatch(value))


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
        prefetched = getattr(ex, "_coach_preferences", None)
        if hasattr(ex, "_coach_preferences"):
            pref = prefetched[0] if prefetched else None
        else:
            pref = ex.preferences.filter(coach_id=ex.coach_id).first()
    return {
        "id": str(ex.id),
        "name": ex.name,
        "name_en": ex.name_en,
        "external_key": ex.external_key,
        "primary_muscle": ex.primary_muscle,
        "secondary_muscles": list(ex.secondary_muscles or []),
        "equipment": ex.equipment,
        "level": ex.level,
        "movement_pattern": ex.movement_pattern,
        "laterality": ex.laterality,
        "risk_tags": list(ex.risk_tags or []),
        "source_document": ex.source_document,
        "coach_notes": ex.coach_notes,
        "aliases": list(ex.aliases.order_by("alias").values_list("alias", flat=True)),
        "targets": [
            {
                "muscle_key": target.muscle.key,
                "muscle": target.muscle.name,
                "region_key": target.region.key if target.region else None,
                "region": target.region.name if target.region else None,
                "role": target.role,
            }
            for target in ex.muscle_targets.select_related("muscle", "region").all()
        ],
        "levels": list(
            ex.suitable_level_rows.order_by("level").values_list("level", flat=True)
        ),
        "equipment_keys": list(
            ex.equipment_rows.order_by("equipment__sort_order", "equipment__name")
            .values_list("equipment__key", flat=True)
        ),
        "is_active": ex.is_active,
        "is_archived": ex.is_archived,
        "is_preferred": bool(pref.is_preferred) if pref else False,
        "is_prohibited": bool(pref.is_prohibited) if pref else False,
        "priority": int(pref.priority) if pref else 0,
        "suitable_levels": list(pref.suitable_levels or []) if pref else [],
        "preference_notes": pref.notes if pref else "",
        "created_at": ex.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": ex.updated_at.isoformat().replace("+00:00", "Z"),
    }


def serialize_taxonomy() -> dict:
    return {
        "muscles": [
            {
                "key": muscle.key,
                "name": muscle.name,
                "name_en": muscle.name_en,
                "regions": [
                    {"key": region.key, "name": region.name, "name_en": region.name_en}
                    for region in muscle.regions.all()
                    if region.is_active
                ],
            }
            for muscle in MuscleTaxonomy.objects.filter(is_active=True)
            .prefetch_related("regions")
            .order_by("sort_order", "name")
        ],
        "equipment": [
            {"key": equipment.key, "name": equipment.name, "name_en": equipment.name_en}
            for equipment in EquipmentTaxonomy.objects.filter(is_active=True).order_by(
                "sort_order", "name"
            )
        ],
        "levels": [
            {"key": key, "name": {"beginner": "مبتدی", "intermediate": "متوسط", "advanced": "حرفه‌ای"}.get(key, label)}
            for key, label in Exercise.Level.choices
            if key != Exercise.Level.ALL
        ],
    }


def _technique_handler_status(technique: TrainingTechnique | None) -> str:
    if technique and technique.handler_key:
        return "implemented"
    return "manual_only"


def _normalize_technique_parameters(
    handler_key: str, value: Any, *, field: str = "parameters"
) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValidationError({field: ["Expected an object."]})

    params = copy.deepcopy(value)
    if handler_key == "superset":
        # `pairing` was the original public parameter name. Keep accepting it
        # while storing the clearer structured name for new configurations.
        pairing_mode = str(
            params.get("pairing_mode") or params.get("pairing") or "same_muscle_isolation"
        ).strip()
        if pairing_mode not in SUPERSET_PAIRING_MODES:
            raise ValidationError(
                {field: [f"Unsupported superset pairing mode: {pairing_mode}"]}
            )
        params["pairing_mode"] = pairing_mode
        if "max_pairs" in params:
            try:
                max_pairs = int(params["max_pairs"])
            except (TypeError, ValueError) as exc:
                raise ValidationError({field: ["max_pairs must be an integer."]}) from exc
            if max_pairs < 1 or max_pairs > 10:
                raise ValidationError({field: ["max_pairs must be between 1 and 10."]})
            params["max_pairs"] = max_pairs
        for key, maximum in (
            ("rest_between_exercises_seconds", 600),
            ("rest_after_pair_seconds", 900),
        ):
            if key not in params:
                continue
            try:
                seconds = int(params[key])
            except (TypeError, ValueError) as exc:
                raise ValidationError({field: [f"{key} must be an integer."]}) from exc
            if seconds < 0 or seconds > maximum:
                raise ValidationError({field: [f"{key} is outside the allowed range."]})
            params[key] = seconds
        if "allow_compound" in params and not isinstance(params["allow_compound"], bool):
            raise ValidationError({field: ["allow_compound must be boolean."]})
        params["allow_compound"] = bool(params.get("allow_compound", False))
    elif handler_key == "drop_set":
        if "drops" in params:
            try:
                drops = int(params["drops"])
            except (TypeError, ValueError) as exc:
                raise ValidationError({field: ["drops must be an integer."]}) from exc
            if drops < 1 or drops > 3:
                raise ValidationError({field: ["drops must be between 1 and 3."]})
            params["drops"] = drops
        if "reduction_percent" in params:
            try:
                reduction = int(params["reduction_percent"])
            except (TypeError, ValueError) as exc:
                raise ValidationError({field: ["reduction_percent must be an integer."]}) from exc
            if reduction < 1 or reduction > 80:
                raise ValidationError(
                    {field: ["reduction_percent must be between 1 and 80."]}
                )
            params["reduction_percent"] = reduction
    return params


def serialize_coach_technique(config: CoachTechnique) -> dict:
    base = config.base_technique
    return {
        "id": str(config.id),
        "key": config.key,
        "name": config.name,
        "description": config.description,
        "execution_method": config.execution_method,
        "allowed_levels": list(config.allowed_levels or []),
        "max_per_session": config.max_per_session,
        "parameters": copy.deepcopy(config.parameters or {}),
        "enabled": config.enabled,
        "source": "coach_override" if base else "coach_private",
        "base_technique_key": base.key if base else None,
        "handler_key": base.handler_key if base else "",
        "handler_status": _technique_handler_status(base),
        "public_definition": (
            {
                "key": base.key,
                "name": base.name,
                "description": base.description,
                "execution_method": base.execution_method,
                "parameter_schema": copy.deepcopy(base.parameter_schema or {}),
            }
            if base
            else None
        ),
        "created_at": config.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": config.updated_at.isoformat().replace("+00:00", "Z"),
    }


def get_coach_techniques(coach: CoachProfile) -> list[dict]:
    configs = {
        config.base_technique_id: config
        for config in CoachTechnique.objects.filter(coach=coach).select_related("base_technique")
        if config.base_technique_id
    }
    rows = []
    for base in TrainingTechnique.objects.filter(is_active=True).order_by("sort_order", "name"):
        config = configs.get(base.id)
        if config:
            rows.append(serialize_coach_technique(config))
        else:
            rows.append(
                {
                    "id": None,
                    "key": base.key,
                    "name": base.name,
                    "description": base.description,
                    "execution_method": base.execution_method,
                    "allowed_levels": [],
                    "max_per_session": 0,
                    "parameters": {},
                    "enabled": False,
                    "source": "platform",
                    "base_technique_key": base.key,
                    "handler_key": base.handler_key,
                    "handler_status": _technique_handler_status(base),
                    "parameter_schema": copy.deepcopy(base.parameter_schema or {}),
                }
            )
    private = CoachTechnique.objects.filter(coach=coach, base_technique__isnull=True).order_by("name")
    rows.extend(serialize_coach_technique(config) for config in private)
    return rows


def _validated_levels(value: Any, field: str = "levels") -> list[str]:
    levels = _as_str_list(value, field)
    allowed = VALID_LEVELS | {Exercise.Level.ALL}
    invalid = sorted(set(levels) - allowed)
    if invalid:
        raise ValidationError({field: [f"Unsupported levels: {', '.join(invalid)}"]})
    return list(dict.fromkeys(levels))


def _taxonomy_by_key(model, key: str, field: str):
    try:
        return model.objects.get(key=key, is_active=True)
    except model.DoesNotExist as exc:
        raise ValidationError({field: [f"Unknown taxonomy key: {key}"]}) from exc


def _sync_structured_exercise_data(exercise: Exercise, payload: dict) -> None:
    if "targets" in payload:
        targets = _as_list(payload.get("targets"))
        if not targets:
            raise ValidationError({"targets": ["At least one structured target is required."]})
        ExerciseMuscleTarget.objects.filter(exercise=exercise).delete()
        primary_targets = 0
        for index, raw in enumerate(targets):
            if not isinstance(raw, dict):
                raise ValidationError({"targets": ["Every target must be an object."]})
            muscle_key = str(raw.get("muscle_key") or "").strip()
            role = str(raw.get("role") or ExerciseMuscleTarget.Role.SECONDARY).strip()
            if role not in {choice[0] for choice in ExerciseMuscleTarget.Role.choices}:
                raise ValidationError({"targets": [f"Unsupported role: {role}"]})
            muscle = _taxonomy_by_key(MuscleTaxonomy, muscle_key, "targets")
            region = None
            region_key = str(raw.get("region_key") or "").strip()
            if region_key:
                try:
                    region = MuscleRegion.objects.get(
                        key=region_key, muscle=muscle, is_active=True
                    )
                except MuscleRegion.DoesNotExist as exc:
                    raise ValidationError({"targets": [f"Unknown region key: {region_key}"]}) from exc
            primary_targets += role == ExerciseMuscleTarget.Role.PRIMARY
            ExerciseMuscleTarget.objects.create(
                exercise=exercise,
                muscle=muscle,
                region=region,
                role=role,
                sort_order=index,
            )
        if primary_targets != 1:
            raise ValidationError({"targets": ["Exactly one primary target is required."]})
        primary = ExerciseMuscleTarget.objects.select_related("muscle").get(
            exercise=exercise, role=ExerciseMuscleTarget.Role.PRIMARY
        )
        exercise.primary_muscle = primary.muscle.name
        exercise.secondary_muscles = list(
            ExerciseMuscleTarget.objects.filter(
                exercise=exercise, role=ExerciseMuscleTarget.Role.SECONDARY
            )
            .select_related("muscle")
            .values_list("muscle__name", flat=True)
        )

    if "levels" in payload:
        levels = _validated_levels(payload.get("levels"))
        ExerciseSuitableLevel.objects.filter(exercise=exercise).delete()
        for level in levels:
            ExerciseSuitableLevel.objects.create(exercise=exercise, level=level)
        if levels:
            exercise.level = levels[0] if len(levels) == 1 else Exercise.Level.ALL

    if "equipment_keys" in payload:
        keys = _as_str_list(payload.get("equipment_keys"), "equipment_keys")
        ExerciseEquipment.objects.filter(exercise=exercise).delete()
        equipments = [_taxonomy_by_key(EquipmentTaxonomy, key, "equipment_keys") for key in keys]
        for equipment in equipments:
            ExerciseEquipment.objects.create(exercise=exercise, equipment=equipment)
        exercise.equipment = ", ".join(equipment.name for equipment in equipments)


def _sync_exercise_aliases(exercise: Exercise, payload: dict) -> None:
    if "aliases" not in payload:
        return
    aliases = _as_str_list(payload.get("aliases"), "aliases")
    exercise.aliases.all().delete()
    from accounts.nutrition_models import ExerciseAlias

    ExerciseAlias.objects.bulk_create(
        [ExerciseAlias(coach=exercise.coach, exercise=exercise, alias=alias) for alias in aliases]
    )


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
    exercises = [
        serialize_exercise(
            ex,
            preference=(getattr(ex, "_coach_preferences", None) or [None])[0],
        )
        for ex in coach.exercises.filter(is_archived=False)
        .prefetch_related(
            Prefetch(
                "preferences",
                queryset=CoachExercisePreference.objects.filter(coach=coach),
                to_attr="_coach_preferences",
            ),
            "aliases",
            "muscle_targets__muscle",
            "muscle_targets__region",
            "suitable_level_rows",
            "equipment_rows__equipment",
        )
        .order_by("primary_muscle", "name")
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
        "exercise_catalog": exercises,
        "exercise_taxonomy": serialize_taxonomy(),
        "training_techniques": get_coach_techniques(coach),
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
    external_key = str(payload.get("external_key") or "").strip().lower()
    primary = str(payload.get("primary_muscle") or "").strip()
    targets = payload.get("targets")
    if targets:
        primary_target = next(
            (target for target in targets if isinstance(target, dict) and target.get("role") == "primary"),
            None,
        )
        primary_key = str(
            (primary_target or {}).get("muscle_key") or (primary_target or {}).get("muscle") or ""
        ).strip()
        try:
            primary = primary or MuscleTaxonomy.objects.get(key=primary_key, is_active=True).name
        except MuscleTaxonomy.DoesNotExist:
            primary = primary or primary_key
    if not name or not primary:
        raise ValidationError({"name": ["name and a primary muscle are required."]})
    if external_key and not _valid_external_key(external_key):
        raise ValidationError({"external_key": ["Use 1-160 lowercase letters, numbers, '.', '_' or '-'."]})
    if Exercise.objects.filter(coach=coach, name=name, primary_muscle=primary).exists():
        raise ValidationError({"name": ["Exercise already exists for this muscle."]})
    if external_key and Exercise.objects.filter(coach=coach, external_key=external_key).exists():
        raise ValidationError({"external_key": ["Exercise external_key already exists for this coach."]})
    ex = Exercise.objects.create(
        coach=coach,
        name=name,
        name_en=str(payload.get("name_en") or ""),
        external_key=external_key,
        primary_muscle=primary,
        secondary_muscles=_as_str_list(payload.get("secondary_muscles", []), "secondary_muscles"),
        equipment=str(payload.get("equipment") or ""),
        level=str(payload.get("level") or Exercise.Level.BEGINNER),
        movement_pattern=str(payload.get("movement_pattern") or ""),
        laterality=str(payload.get("laterality") or ""),
        risk_tags=_as_str_list(payload.get("risk_tags", []), "risk_tags"),
        source_document=str(payload.get("source_document") or ""),
        coach_notes=str(payload.get("coach_notes") or ""),
        is_active=bool(payload.get("is_active", True)),
    )
    _sync_structured_exercise_data(ex, payload)
    _sync_exercise_aliases(ex, payload)
    ex.save()
    _upsert_preference(coach, ex, payload)
    return ex


def _upsert_preference(coach: CoachProfile, ex: Exercise, payload: dict) -> None:
    pref_fields = (
        "is_preferred",
        "is_prohibited",
        "priority",
        "suitable_levels",
        "preference_notes",
    )
    if not any(k in payload for k in pref_fields):
        return
    pref, _ = CoachExercisePreference.objects.get_or_create(coach=coach, exercise=ex)
    if "is_preferred" in payload:
        pref.is_preferred = bool(payload["is_preferred"])
    if "is_prohibited" in payload:
        pref.is_prohibited = bool(payload["is_prohibited"])
    if "priority" in payload:
        try:
            pref.priority = max(0, int(payload.get("priority") or 0))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"priority": ["Priority must be a non-negative integer."]}) from exc
    if "suitable_levels" in payload:
        pref.suitable_levels = _as_str_list(payload.get("suitable_levels"), "suitable_levels")
    if "preference_notes" in payload:
        pref.notes = str(payload.get("preference_notes") or "")
    pref.save()


@transaction.atomic
def update_exercise(exercise: Exercise, payload: dict) -> Exercise:
    if "name" in payload:
        exercise.name = str(payload["name"]).strip() or exercise.name
    if "name_en" in payload:
        exercise.name_en = str(payload["name_en"] or "")
    if "external_key" in payload:
        external_key = str(payload["external_key"] or "").strip().lower()
        if external_key and not _valid_external_key(external_key):
            raise ValidationError(
                {"external_key": ["Use 1-160 lowercase letters, numbers, '.', '_' or '-'."]}
            )
        if external_key and Exercise.objects.filter(
            coach=exercise.coach, external_key=external_key
        ).exclude(pk=exercise.pk).exists():
            raise ValidationError({"external_key": ["Exercise external_key already exists for this coach."]})
        exercise.external_key = external_key
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
    if "laterality" in payload:
        exercise.laterality = str(payload["laterality"] or "")
    if "risk_tags" in payload:
        exercise.risk_tags = _as_str_list(payload["risk_tags"], "risk_tags")
    if "source_document" in payload:
        exercise.source_document = str(payload["source_document"] or "")
    if "coach_notes" in payload:
        exercise.coach_notes = str(payload["coach_notes"] or "")
    if "is_active" in payload:
        exercise.is_active = bool(payload["is_active"])
    if "is_archived" in payload:
        exercise.is_archived = bool(payload["is_archived"])
    _sync_structured_exercise_data(exercise, payload)
    _sync_exercise_aliases(exercise, payload)
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


@transaction.atomic
def create_coach_technique(coach: CoachProfile, payload: dict) -> CoachTechnique:
    key = str(payload.get("key") or "").strip().lower()
    name = str(payload.get("name") or "").strip()
    if not key or not name:
        raise ValidationError({"detail": "key and name are required."})
    base_key = str(payload.get("base_technique_key") or "").strip().lower()
    base = None
    if base_key:
        try:
            base = TrainingTechnique.objects.get(key=base_key, is_active=True)
        except TrainingTechnique.DoesNotExist as exc:
            raise ValidationError({"base_technique_key": ["Unknown public technique."]}) from exc
        if CoachTechnique.objects.filter(coach=coach, base_technique=base).exists():
            raise ValidationError({"base_technique_key": ["This technique is already configured."]})
    levels = _validated_levels(payload.get("allowed_levels", []), "allowed_levels")
    try:
        max_per_session = max(0, int(payload.get("max_per_session") or 0))
    except (TypeError, ValueError) as exc:
        raise ValidationError({"max_per_session": ["Must be a non-negative integer."]}) from exc
    parameters = _normalize_technique_parameters(
        base.handler_key if base else "", payload.get("parameters"), field="parameters"
    )
    return CoachTechnique.objects.create(
        coach=coach,
        base_technique=base,
        key=key,
        name=name,
        description=str(payload.get("description") or ""),
        execution_method=str(payload.get("execution_method") or ""),
        allowed_levels=levels,
        max_per_session=max_per_session,
        parameters=parameters,
        enabled=bool(payload.get("enabled", True)),
    )


@transaction.atomic
def update_coach_technique(config: CoachTechnique, payload: dict) -> CoachTechnique:
    base = config.base_technique
    if "base_technique_key" in payload and not base:
        base_key = str(payload.get("base_technique_key") or "").strip().lower()
        if base_key:
            try:
                base = TrainingTechnique.objects.get(key=base_key, is_active=True)
            except TrainingTechnique.DoesNotExist as exc:
                raise ValidationError(
                    {"base_technique_key": ["Unknown public technique."]}
                ) from exc
            if CoachTechnique.objects.filter(
                coach=config.coach, base_technique=base
            ).exclude(pk=config.pk).exists():
                raise ValidationError(
                    {"base_technique_key": ["This technique is already configured."]}
                )
            config.base_technique = base
    if "name" in payload:
        config.name = str(payload.get("name") or "").strip() or config.name
    if "description" in payload:
        config.description = str(payload.get("description") or "")
    if "execution_method" in payload:
        config.execution_method = str(payload.get("execution_method") or "")
    if "allowed_levels" in payload:
        config.allowed_levels = _validated_levels(payload.get("allowed_levels"), "allowed_levels")
    if "max_per_session" in payload:
        try:
            config.max_per_session = max(0, int(payload.get("max_per_session") or 0))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"max_per_session": ["Must be a non-negative integer."]}) from exc
    if "parameters" in payload:
        config.parameters = _normalize_technique_parameters(
            base.handler_key if base else "",
            payload["parameters"],
            field="parameters",
        )
    if "enabled" in payload:
        config.enabled = bool(payload["enabled"])
    config.save()
    return config


def delete_coach_technique(config: CoachTechnique) -> None:
    config.delete()


def deep_copy_json(value: Any) -> Any:
    return copy.deepcopy(value)
