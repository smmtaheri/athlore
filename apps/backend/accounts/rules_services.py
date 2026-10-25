"""Coach rules aggregate load/save and template/exercise helpers."""

from __future__ import annotations

import copy
import re
import uuid
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.generation_policy import coach_policy
from accounts.models import (
    CoachExercisePreference,
    CoachNutritionTemplate,
    CoachProfile,
    CoachRuleSet,
    CoachSupplementTemplate,
    CoachTechnique,
    EquipmentTaxonomy,
    Exercise,
    ExerciseEquipment,
    ExerciseMediaAsset,
    ExerciseMuscleTarget,
    ExerciseSuitableLevel,
    GeneralRule,
    InjuryRule,
    LevelRule,
    MusclePriority,
    MuscleRegion,
    MuscleTaxonomy,
    ProgramTemplate,
    TrainingTechnique,
)
from accounts.training_recipes import validate_training_recipe

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
        "execution_plan": t.execution_plan or {},
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
    from accounts.exercise_media_services import serialize_media

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
        "tutorial_url": ex.tutorial_url,
        "tutorial_source_url": ex.tutorial_source_url,
        **serialize_media(ex),
        "execution_guide": ex.execution_guide,
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
        "levels": list(ex.suitable_level_rows.order_by("level").values_list("level", flat=True)),
        "equipment_keys": list(
            ex.equipment_rows.order_by("equipment__sort_order", "equipment__name").values_list(
                "equipment__key", flat=True
            )
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


def serialize_taxonomy(*, include_inactive: bool = False) -> dict:
    muscles = MuscleTaxonomy.objects.all().prefetch_related("regions")
    equipment = EquipmentTaxonomy.objects.all()
    if not include_inactive:
        muscles = muscles.filter(is_active=True)
        equipment = equipment.filter(is_active=True)
    muscles = muscles.order_by("sort_order", "name")
    equipment = equipment.order_by("sort_order", "name")
    return {
        "muscles": [
            {
                "id": str(muscle.id),
                "key": muscle.key,
                "name": muscle.name,
                "name_en": muscle.name_en,
                "is_active": muscle.is_active,
                "sort_order": muscle.sort_order,
                "regions": [
                    {
                        "id": str(region.id),
                        "key": region.key,
                        "name": region.name,
                        "name_en": region.name_en,
                        "is_active": region.is_active,
                        "sort_order": region.sort_order,
                    }
                    for region in muscle.regions.all()
                    if include_inactive or region.is_active
                ],
            }
            for muscle in muscles
        ],
        "equipment": [
            {
                "key": item.key,
                "name": item.name,
                "name_en": item.name_en,
                "is_active": item.is_active,
            }
            for item in equipment
        ],
        "levels": [
            {
                "key": key,
                "name": {
                    "beginner": "مبتدی",
                    "intermediate": "نیمه‌حرفه‌ای",
                    "advanced": "حرفه‌ای",
                }.get(key, label),
            }
            for key, label in Exercise.Level.choices
            if key != Exercise.Level.ALL
        ],
    }


def _taxonomy_text(value: Any, field: str, *, required: bool) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError({field: ["مقدار باید متن باشد."]})
    value = value.strip()
    if required and not value:
        raise ValidationError({field: ["این فیلد الزامی است."]})
    if len(value) > 120:
        raise ValidationError({field: ["حداکثر طول مجاز ۱۲۰ نویسه است."]})
    return value


def _taxonomy_order(value: Any, *, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        raise ValidationError({"sort_order": ["ترتیب باید عدد صحیح باشد."]})
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"sort_order": ["ترتیب باید عدد صحیح باشد."]}) from exc


def _validate_taxonomy_payload(payload: Any, allowed: set[str]) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError({"detail": "بدنه‌ی درخواست باید یک شیء باشد."})
    unknown = set(payload) - allowed
    if unknown:
        raise ValidationError({"detail": f"فیلدهای غیرمجاز: {', '.join(sorted(unknown))}"})
    return payload


def _next_taxonomy_order(model, *, parent=None) -> int:
    rows = model.objects.all()
    if parent is not None:
        rows = rows.filter(muscle=parent)
    current = rows.order_by("-sort_order").values_list("sort_order", flat=True).first()
    return (current if current is not None else -1) + 1


def _ensure_taxonomy_name_available(model, name: str, *, parent=None, exclude_id=None) -> None:
    rows = model.objects.filter(name__iexact=name)
    if parent is not None:
        rows = rows.filter(muscle=parent)
    if exclude_id is not None:
        rows = rows.exclude(pk=exclude_id)
    if rows.exists():
        scope = "برای همین عضله" if parent is not None else "در فهرست عضله‌ها"
        raise ValidationError({"name": [f"این نام {scope} از قبل ثبت شده است."]})


def _serialize_muscle(muscle: MuscleTaxonomy) -> dict:
    return {
        "id": str(muscle.id),
        "key": muscle.key,
        "name": muscle.name,
        "name_en": muscle.name_en,
        "is_active": muscle.is_active,
        "sort_order": muscle.sort_order,
    }


def _serialize_region(region: MuscleRegion) -> dict:
    return {
        "id": str(region.id),
        "muscle_id": str(region.muscle_id),
        "muscle_key": region.muscle.key,
        "muscle_name": region.muscle.name,
        "key": region.key,
        "name": region.name,
        "name_en": region.name_en,
        "is_active": region.is_active,
        "sort_order": region.sort_order,
    }


@transaction.atomic
def create_muscle_taxonomy(payload: dict) -> MuscleTaxonomy:
    payload = _validate_taxonomy_payload(payload, {"name", "name_en", "sort_order"})
    name = _taxonomy_text(payload.get("name"), "name", required=True)
    name_en = _taxonomy_text(payload.get("name_en"), "name_en", required=False)
    _ensure_taxonomy_name_available(MuscleTaxonomy, name)
    muscle_id = uuid.uuid4()
    return MuscleTaxonomy.objects.create(
        id=muscle_id,
        key=f"custom-muscle-{muscle_id.hex}",
        name=name,
        name_en=name_en,
        sort_order=_taxonomy_order(
            payload.get("sort_order"), default=_next_taxonomy_order(MuscleTaxonomy)
        ),
    )


@transaction.atomic
def update_muscle_taxonomy(muscle: MuscleTaxonomy, payload: dict) -> MuscleTaxonomy:
    allowed = {"name", "name_en", "sort_order", "is_active"}
    payload = _validate_taxonomy_payload(payload, allowed)
    if "name" in payload:
        name = _taxonomy_text(payload["name"], "name", required=True)
        _ensure_taxonomy_name_available(MuscleTaxonomy, name, exclude_id=muscle.pk)
        muscle.name = name
    if "name_en" in payload:
        muscle.name_en = _taxonomy_text(payload["name_en"], "name_en", required=False)
    if "sort_order" in payload:
        muscle.sort_order = _taxonomy_order(payload["sort_order"])
    if "is_active" in payload:
        if not isinstance(payload["is_active"], bool):
            raise ValidationError({"is_active": ["وضعیت باید روشن یا خاموش باشد."]})
        muscle.is_active = payload["is_active"]
    muscle.save()
    return muscle


@transaction.atomic
def create_muscle_region(muscle: MuscleTaxonomy, payload: dict) -> MuscleRegion:
    payload = _validate_taxonomy_payload(payload, {"name", "name_en", "sort_order"})
    if not muscle.is_active:
        raise ValidationError({"muscle": ["برای عضله غیرفعال نمی‌توان ناحیه جدید ساخت."]})
    name = _taxonomy_text(payload.get("name"), "name", required=True)
    name_en = _taxonomy_text(payload.get("name_en"), "name_en", required=False)
    _ensure_taxonomy_name_available(MuscleRegion, name, parent=muscle)
    region_id = uuid.uuid4()
    return MuscleRegion.objects.create(
        id=region_id,
        muscle=muscle,
        key=f"custom-region-{region_id.hex}",
        name=name,
        name_en=name_en,
        sort_order=_taxonomy_order(
            payload.get("sort_order"), default=_next_taxonomy_order(MuscleRegion, parent=muscle)
        ),
    )


@transaction.atomic
def update_muscle_region(region: MuscleRegion, payload: dict) -> MuscleRegion:
    allowed = {"name", "name_en", "sort_order", "is_active"}
    payload = _validate_taxonomy_payload(payload, allowed)
    if "name" in payload:
        name = _taxonomy_text(payload["name"], "name", required=True)
        _ensure_taxonomy_name_available(
            MuscleRegion, name, parent=region.muscle, exclude_id=region.pk
        )
        region.name = name
    if "name_en" in payload:
        region.name_en = _taxonomy_text(payload["name_en"], "name_en", required=False)
    if "sort_order" in payload:
        region.sort_order = _taxonomy_order(payload["sort_order"])
    if "is_active" in payload:
        if not isinstance(payload["is_active"], bool):
            raise ValidationError({"is_active": ["وضعیت باید روشن یا خاموش باشد."]})
        if payload["is_active"] and not region.muscle.is_active:
            raise ValidationError(
                {"is_active": ["برای فعال‌کردن ناحیه، ابتدا عضله‌ی والد را فعال کنید."]}
            )
        region.is_active = payload["is_active"]
    region.save()
    return region


def serialize_muscle(muscle: MuscleTaxonomy) -> dict:
    return _serialize_muscle(muscle)


def serialize_muscle_region(region: MuscleRegion) -> dict:
    return _serialize_region(region)


def _technique_handler_status(technique: TrainingTechnique | None) -> str:
    if technique and technique.handler_key:
        return "implemented"
    if technique and technique.recipe:
        try:
            validate_training_recipe(technique.recipe, allow_empty=False)
        except ValidationError:
            return "manual_only"
        return "implemented"
    return "manual_only"


def _coach_technique_handler_status(config: CoachTechnique) -> str:
    if config.base_technique_id:
        return _technique_handler_status(config.base_technique)
    if config.recipe:
        try:
            validate_training_recipe(config.recipe, allow_empty=False)
        except ValidationError:
            return "manual_only"
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
            raise ValidationError({field: [f"Unsupported superset pairing mode: {pairing_mode}"]})
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
                raise ValidationError({field: ["reduction_percent must be between 1 and 80."]})
            params["reduction_percent"] = reduction
    elif handler_key == "partial_reps":
        allowed_variants = {"one_and_half", "after_failure", "partial_only"}
        variants = params.get("variants", sorted(allowed_variants))
        if not isinstance(variants, list) or not variants:
            raise ValidationError({field: ["variants must contain at least one supported option."]})
        normalized_variants = list(dict.fromkeys(str(item) for item in variants))
        invalid_variants = sorted(set(normalized_variants) - allowed_variants)
        if invalid_variants:
            raise ValidationError(
                {field: [f"Unsupported partial-rep variants: {invalid_variants}"]}
            )
        params["variants"] = normalized_variants
        try:
            after_failure_reps = int(params.get("after_failure_reps", 3))
        except (TypeError, ValueError) as exc:
            raise ValidationError({field: ["after_failure_reps must be an integer."]}) from exc
        if after_failure_reps < 1 or after_failure_reps > 10:
            raise ValidationError({field: ["after_failure_reps must be between 1 and 10."]})
        params["after_failure_reps"] = after_failure_reps
        params["half_range"] = "coach_defined_per_exercise"
    return params


def serialize_coach_technique(config: CoachTechnique) -> dict:
    base = config.base_technique
    return {
        "id": str(config.id),
        "key": config.key,
        "name": config.name,
        "description": config.description,
        "execution_method": config.execution_method,
        "recipe": copy.deepcopy(config.recipe or (base.recipe if base else {})),
        "allowed_levels": list(config.allowed_levels or []),
        "max_per_session": config.max_per_session,
        "parameters": copy.deepcopy(config.parameters or {}),
        "enabled": config.enabled,
        "source": "coach_override" if base else "coach_private",
        "base_technique_key": base.key if base else None,
        "handler_key": base.handler_key if base else "",
        "handler_status": _coach_technique_handler_status(config),
        "public_definition": (
            {
                "key": base.key,
                "name": base.name,
                "description": base.description,
                "execution_method": base.execution_method,
                "parameter_schema": copy.deepcopy(base.parameter_schema or {}),
                "recipe": copy.deepcopy(base.recipe or {}),
            }
            if base
            else None
        ),
        "created_at": config.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": config.updated_at.isoformat().replace("+00:00", "Z"),
    }


def serialize_platform_technique(base: TrainingTechnique) -> dict:
    return {
        "id": None,
        "key": base.key,
        "name": base.name,
        "description": base.description,
        "execution_method": base.execution_method,
        "recipe": copy.deepcopy(base.recipe or {}),
        "allowed_levels": [],
        "max_per_session": 0,
        "parameters": {},
        "enabled": False,
        "source": "platform",
        "base_technique_key": base.key,
        "handler_key": base.handler_key,
        "handler_status": _technique_handler_status(base),
        "parameter_schema": copy.deepcopy(base.parameter_schema or {}),
        "public_definition": {
            "key": base.key,
            "name": base.name,
            "description": base.description,
            "execution_method": base.execution_method,
            "parameter_schema": copy.deepcopy(base.parameter_schema or {}),
            "recipe": copy.deepcopy(base.recipe or {}),
        },
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
            rows.append(serialize_platform_technique(base))
    private = CoachTechnique.objects.filter(coach=coach, base_technique__isnull=True).order_by(
        "name"
    )
    rows.extend(serialize_coach_technique(config) for config in private)
    return rows


@transaction.atomic
def update_platform_technique(key: str, payload: dict) -> TrainingTechnique:
    try:
        base = TrainingTechnique.objects.select_for_update().get(key=key, is_active=True)
    except TrainingTechnique.DoesNotExist as exc:
        raise ValidationError({"key": ["Unknown active platform training system."]}) from exc

    editable_fields = {"name", "description", "execution_method", "recipe"}
    unsupported = sorted(set(payload) - editable_fields)
    if unsupported:
        raise ValidationError(
            {"detail": f"These platform-definition fields cannot be edited: {unsupported}."}
        )

    previous = {field: copy.deepcopy(getattr(base, field)) for field in editable_fields}
    changed_fields = []
    if "name" in payload:
        name = str(payload.get("name") or "").strip()
        if not name or len(name) > 160:
            raise ValidationError({"name": ["Name must contain 1-160 characters."]})
        base.name = name
        changed_fields.append("name")
    for field in ("description", "execution_method"):
        if field in payload:
            value = str(payload.get(field) or "")
            base_value = getattr(base, field)
            if value != base_value:
                setattr(base, field, value)
                changed_fields.append(field)
    if "recipe" in payload:
        base.recipe = validate_training_recipe(payload["recipe"], allow_empty=False)
        changed_fields.append("recipe")

    if changed_fields:
        base.save(update_fields=[*dict.fromkeys(changed_fields), "updated_at"])
        # Existing coach records copy public text and recipes when configured.
        # Move values that still match the prior public definition forward, while
        # retaining fields a coach has independently customized.
        for config in CoachTechnique.objects.filter(base_technique=base).iterator():
            updates = []
            for field in changed_fields:
                previous_value = previous[field]
                config_value = getattr(config, field)
                if field == "recipe":
                    previous_value = validate_training_recipe(previous_value, allow_empty=True)
                    config_value = validate_training_recipe(config_value, allow_empty=True)
                if config_value == previous_value:
                    setattr(config, field, getattr(base, field))
                    updates.append(field)
            if updates:
                config.save(update_fields=[*updates, "updated_at"])
    return base


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
        existing_targets = {
            (
                target.muscle.key,
                target.region.key if target.region else "",
                target.role,
            )
            for target in exercise.muscle_targets.select_related("muscle", "region").all()
        }
        ExerciseMuscleTarget.objects.filter(exercise=exercise).delete()
        primary_targets = 0
        for index, raw in enumerate(targets):
            if not isinstance(raw, dict):
                raise ValidationError({"targets": ["Every target must be an object."]})
            muscle_key = str(raw.get("muscle_key") or "").strip()
            role = str(raw.get("role") or ExerciseMuscleTarget.Role.SECONDARY).strip()
            if role not in {choice[0] for choice in ExerciseMuscleTarget.Role.choices}:
                raise ValidationError({"targets": [f"Unsupported role: {role}"]})
            region_key = str(raw.get("region_key") or "").strip()
            retained_target = (muscle_key, region_key, role) in existing_targets
            muscle = MuscleTaxonomy.objects.filter(key=muscle_key).first()
            if not muscle or (not muscle.is_active and not retained_target):
                raise ValidationError({"targets": [f"Unknown taxonomy key: {muscle_key}"]})
            region = None
            if region_key:
                region = MuscleRegion.objects.filter(key=region_key, muscle=muscle).first()
                if not region or (not region.is_active and not retained_target):
                    raise ValidationError({"targets": [f"Unknown region key: {region_key}"]})
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


def get_coach_rules_aggregate(coach: CoachProfile, *, include_catalogs: bool = True) -> dict:
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
    exercises = [
        serialize_exercise(
            ex,
            preference=(getattr(ex, "_coach_preferences", None) or [None])[0],
        )
        for ex in (
            coach.exercises.filter(is_archived=False)
            if include_catalogs
            else Exercise.objects.none()
        )
        .select_related("media_asset")
        .prefetch_related(
            Prefetch(
                "media_uploads",
                queryset=ExerciseMediaAsset.objects.filter(owner=coach).order_by("-created_at"),
                to_attr="_media_uploads",
            ),
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
        "generation_rules": coach_policy(coach),
        "schema_version": rule_set.schema_version,
        "templates": templates,
        "levels": levels,
        "injuries": injuries,
        "muscle_priorities": muscle_priorities,
        "exercise_catalog": exercises,
        "exercise_taxonomy": serialize_taxonomy() if include_catalogs else {},
        "training_techniques": get_coach_techniques(coach) if include_catalogs else [],
        "general_rules": {
            "extra_notes": rule_set.general_extra_notes,
            "items": general_items,
        },
        "nutrition_templates": nutrition_templates,
        "supplement_templates": supplement_templates,
    }


def _validate_template_payload(item: dict, *, require_name: bool = True, coach=None) -> dict:
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
    if split and len(split) != days_int and not item.get("execution_plan"):
        raise ValidationError(
            {"templates": [f"split length ({len(split)}) must equal days_per_week ({days_int})."]}
        )
    execution_plan = item.get("execution_plan", {})
    if not isinstance(execution_plan, dict):
        raise ValidationError({"execution_plan": ["ساختار قالب باید یک شیء معتبر باشد."]})
    if execution_plan:
        from accounts.models import MuscleTaxonomy
        from accounts.template_plans import validate_execution_plan
        from programming.services.split_parser import TAXONOMY_MUSCLE_GROUPS

        execution_plan = validate_execution_plan(
            execution_plan, days_per_week=days_int, coach=coach, level=level
        )
        names = dict(MuscleTaxonomy.objects.values_list("key", "name"))
        split = [
            " و ".join(TAXONOMY_MUSCLE_GROUPS.get(key, names[key]) for key in day["muscles"])
            for day in execution_plan["days"]
        ]
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
        "execution_plan": execution_plan,
        "is_active": bool(item.get("is_active", True)),
        "sort_order": int(item.get("sort_order") or 0),
    }


def _save_rule(manager, raw, identity, **data):
    """Preserve identity inside this owner-scoped collection; never recreate existing rows."""
    row = None
    raw_id = raw.get("id")
    try:
        parsed_id = uuid.UUID(str(raw_id)) if raw_id else None
    except ValueError:
        parsed_id = None
    if parsed_id:
        row = manager.filter(pk=parsed_id).first()
        if row is None:
            raise ValidationError({"id": ["Rule does not belong to this collection; reload it."]})
    else:
        candidates = manager.filter(**{identity: data[identity]})
        if manager.model is ProgramTemplate:
            candidates = candidates.filter(is_archived=False)
        row = candidates.first()
    if row is None:
        return manager.create(**data)
    for key, value in data.items():
        setattr(row, key, value)
    row.save()
    return row


@transaction.atomic
def replace_coach_rules(
    coach: CoachProfile, payload: dict, *, partial: bool = False, include_catalogs: bool = True
) -> dict:
    """Idempotent full or partial replace of coach rules aggregate."""
    if not isinstance(payload, dict):
        raise ValidationError({"detail": "Body must be an object."})
    # Reject client-controlled ownership
    for banned in ("coach", "coach_id", "rule_set_id"):
        if banned in payload:
            raise ValidationError({banned: ["Client-controlled ownership is not allowed."]})

    rule_set = ensure_rule_set(coach)
    rule_set = CoachRuleSet.objects.select_for_update().get(pk=rule_set.pk)
    sections = set(payload.keys()) - {"updated_at", "schema_version"}
    known = {
        "templates",
        "levels",
        "injuries",
        "muscle_priorities",
        "general_rules",
        "generation_rules",
    }
    if not partial and not known.issubset(sections | known):
        # Full PUT expects the main sections; missing sections clear to empty.
        pass
    if partial and not sections.intersection(known):
        raise ValidationError({"detail": "No updatable sections provided."})

    replace_all = not partial
    if "generation_rules" in payload:
        from accounts.generation_policy import validate_policy

        rule_set.style_profile = {
            **(rule_set.style_profile or {}),
            "generation_rules": validate_policy(payload["generation_rules"]),
        }

    if replace_all or "templates" in payload:
        templates = _as_list(payload.get("templates", []))
        retained_templates = []
        for idx, raw in enumerate(templates):
            data = _validate_template_payload(raw, coach=coach)
            row = _save_rule(
                rule_set.templates,
                raw,
                "name",
                coach=coach,
                sort_order=data.pop("sort_order", idx),
                **data,
            )
            retained_templates.append(row.pk)
        rule_set.templates.exclude(pk__in=retained_templates).update(
            is_archived=True, is_active=False
        )

    if replace_all or "levels" in payload:
        levels = _as_list(payload.get("levels", []))
        retained_levels = []
        for raw in levels:
            if not isinstance(raw, dict):
                raise ValidationError({"levels": ["Each level must be an object."]})
            level_key = str(raw.get("level_key") or raw.get("id") or "").strip()
            if level_key not in VALID_LEVELS:
                raise ValidationError({"levels": [f"Invalid level_key: {level_key}"]})
            row = _save_rule(
                rule_set.level_rules,
                {"id": None},
                "level_key",
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
            retained_levels.append(row.pk)
        rule_set.level_rules.exclude(pk__in=retained_levels).delete()

    if replace_all or "injuries" in payload:
        injuries = _as_list(payload.get("injuries", []))
        retained_injuries = []
        for idx, raw in enumerate(injuries):
            if not isinstance(raw, dict):
                raise ValidationError({"injuries": ["Each injury must be an object."]})
            name = str(raw.get("name") or "").strip()
            if not name:
                raise ValidationError({"injuries": ["name is required."]})
            row = _save_rule(
                rule_set.injury_rules,
                raw,
                "name",
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
            retained_injuries.append(row.pk)
        rule_set.injury_rules.exclude(pk__in=retained_injuries).delete()

    if replace_all or "muscle_priorities" in payload:
        priorities = _as_list(payload.get("muscle_priorities", []))
        retained_priorities = []
        for idx, raw in enumerate(priorities):
            if not isinstance(raw, dict):
                raise ValidationError(
                    {"muscle_priorities": ["Each muscle priority must be an object."]}
                )
            muscle = str(raw.get("muscle") or "").strip()
            if not muscle:
                raise ValidationError({"muscle_priorities": ["muscle is required."]})
            row = _save_rule(
                rule_set.muscle_priorities,
                raw,
                "muscle",
                coach=coach,
                muscle=muscle,
                extra_exercises=max(0, int(raw.get("extra_exercises") or 0)),
                extra_sets=max(0, int(raw.get("extra_sets") or 0)),
                order_change=str(raw.get("order_change") or ""),
                notes=str(raw.get("notes") or ""),
                sort_order=int(raw.get("sort_order") or idx),
            )
            retained_priorities.append(row.pk)
        rule_set.muscle_priorities.exclude(pk__in=retained_priorities).delete()

    if replace_all or "general_rules" in payload:
        general = payload.get("general_rules") or {}
        if not isinstance(general, dict):
            raise ValidationError({"general_rules": ["Must be an object."]})
        rule_set.general_extra_notes = str(general.get("extra_notes") or "")
        retained_general = []
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
            row = _save_rule(
                rule_set.general_rules,
                raw,
                "title",
                coach=coach,
                title=title,
                description=str(raw.get("description") or ""),
                category=str(raw.get("category") or ""),
                importance=importance,
                is_active=bool(raw.get("is_active", True)),
                sort_order=int(raw.get("order") or raw.get("sort_order") or idx),
            )
            retained_general.append(row.pk)
        rule_set.general_rules.exclude(pk__in=retained_general).delete()

    rule_set.updated_at = timezone.now()
    rule_set.save(update_fields=["general_extra_notes", "style_profile", "updated_at"])
    return get_coach_rules_aggregate(coach, include_catalogs=include_catalogs)


@transaction.atomic
def create_template(coach: CoachProfile, payload: dict) -> ProgramTemplate:
    rule_set = ensure_rule_set(coach)
    data = _validate_template_payload(payload, coach=coach)
    return ProgramTemplate.objects.create(rule_set=rule_set, coach=coach, **data)


@transaction.atomic
def update_template(template: ProgramTemplate, payload: dict) -> ProgramTemplate:
    merged = serialize_template(template)
    merged.update(payload)
    data = _validate_template_payload(merged, coach=template.coach)
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


def _validate_exercise_guide(payload):
    url = payload.get("tutorial_url")
    if url:
        if not isinstance(url, str) or len(url) > 1024:
            raise ValidationError({"tutorial_url": ["لینک ویدئو معتبر نیست."]})
        try:
            URLValidator(schemes=["https"])(url)
        except DjangoValidationError as exc:
            raise ValidationError(
                {"tutorial_url": ["لینک HTTPS مستقیم ویدئو را وارد کنید."]}
            ) from exc
    source_url = payload.get("tutorial_source_url")
    if source_url:
        if not isinstance(source_url, str) or len(source_url) > 1024:
            raise ValidationError({"tutorial_source_url": ["لینک منبع ویدئو معتبر نیست."]})
        try:
            URLValidator(schemes=["https"])(source_url)
        except DjangoValidationError as exc:
            raise ValidationError(
                {"tutorial_source_url": ["لینک منبع ویدئو باید HTTPS باشد."]}
            ) from exc
    guide = payload.get("execution_guide", {})
    if (
        not isinstance(guide, dict)
        or set(guide) - {"execution", "tips", "mistakes"}
        or any(not isinstance(value, str) or len(value) > 4000 for value in guide.values())
    ):
        raise ValidationError({"execution_guide": ["راهنمای اجرا باید متن ساختاریافته باشد."]})


@transaction.atomic
def create_exercise(coach: CoachProfile, payload: dict) -> Exercise:
    _validate_exercise_guide(payload)
    name = str(payload.get("name") or "").strip()
    external_key = str(payload.get("external_key") or "").strip().lower()
    primary = str(payload.get("primary_muscle") or "").strip()
    targets = payload.get("targets")
    if targets:
        primary_target = next(
            (
                target
                for target in targets
                if isinstance(target, dict) and target.get("role") == "primary"
            ),
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
        raise ValidationError(
            {"external_key": ["Use 1-160 lowercase letters, numbers, '.', '_' or '-'."]}
        )
    if Exercise.objects.filter(coach=coach, name=name, primary_muscle=primary).exists():
        raise ValidationError({"name": ["Exercise already exists for this muscle."]})
    if external_key and Exercise.objects.filter(coach=coach, external_key=external_key).exists():
        raise ValidationError(
            {"external_key": ["Exercise external_key already exists for this coach."]}
        )
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
        tutorial_url=str(payload.get("tutorial_url") or ""),
        tutorial_source_url=str(payload.get("tutorial_source_url") or ""),
        execution_guide=payload.get("execution_guide") or {},
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
            raise ValidationError(
                {"priority": ["Priority must be a non-negative integer."]}
            ) from exc
    if "suitable_levels" in payload:
        pref.suitable_levels = _as_str_list(payload.get("suitable_levels"), "suitable_levels")
    if "preference_notes" in payload:
        pref.notes = str(payload.get("preference_notes") or "")
    pref.save()


@transaction.atomic
def update_exercise(exercise: Exercise, payload: dict) -> Exercise:
    _validate_exercise_guide(payload)
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
        if (
            external_key
            and Exercise.objects.filter(coach=exercise.coach, external_key=external_key)
            .exclude(pk=exercise.pk)
            .exists()
        ):
            raise ValidationError(
                {"external_key": ["Exercise external_key already exists for this coach."]}
            )
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
    if "tutorial_url" in payload:
        exercise.tutorial_url = str(payload["tutorial_url"] or "")
    if "tutorial_source_url" in payload:
        exercise.tutorial_source_url = str(payload["tutorial_source_url"] or "")
    if "execution_guide" in payload:
        exercise.execution_guide = payload["execution_guide"] or {}
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
        default_max = 2 if (base and base.handler_key == "partial_reps") else 0
        max_per_session = max(0, int(payload.get("max_per_session", default_max) or 0))
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
        recipe=validate_training_recipe(
            payload.get("recipe", base.recipe if base else {}), allow_empty=True
        ),
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
            if (
                CoachTechnique.objects.filter(coach=config.coach, base_technique=base)
                .exclude(pk=config.pk)
                .exists()
            ):
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
    if "recipe" in payload:
        config.recipe = validate_training_recipe(payload["recipe"], allow_empty=True)
    if "enabled" in payload:
        config.enabled = bool(payload["enabled"])
    config.save()
    return config


def delete_coach_technique(config: CoachTechnique) -> None:
    config.delete()


def deep_copy_json(value: Any) -> Any:
    return copy.deepcopy(value)
