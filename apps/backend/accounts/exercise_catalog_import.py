"""Validated, coach-scoped imports for ``athlore.exercise_catalog.v1``.

The importer deliberately accepts ownership only from the command's ``--coach-id``
argument.  The catalog document cannot name a coach and is never allowed to change
another coach's rows.  All validation happens before an apply transaction starts.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.db import transaction

from accounts.models import (
    CoachExercisePreference,
    CoachProfile,
    EquipmentTaxonomy,
    Exercise,
    ExerciseBankGroup,
    ExerciseEquipment,
    ExerciseMuscleTarget,
    ExerciseSuitableLevel,
    MuscleRegion,
    MuscleTaxonomy,
)
from accounts.nutrition_models import ExerciseAlias

SCHEMA_NAME = "athlore.exercise_catalog.v1"
SCHEMA_VERSION = 1
EXTERNAL_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,159}$")
LEVELS = {"beginner", "intermediate", "advanced"}
TARGET_ROLES = {ExerciseMuscleTarget.Role.PRIMARY, ExerciseMuscleTarget.Role.SECONDARY}
GROUP_LIST_FIELDS = (
    "favorite_exercises",
    "beginner_friendly",
    "professional_friendly",
    "forbidden_exercises",
)


class CatalogImportError(ValueError):
    """A validation or safety error that must prevent all writes."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


@dataclass
class ImportPlan:
    coach: CoachProfile
    document: dict[str, Any]
    items: list[dict[str, Any]]
    deletions: list[Exercise]
    report: dict[str, Any]


def load_catalog(path: str | Path) -> dict[str, Any]:
    catalog_path = Path(path)
    try:
        with catalog_path.open(encoding="utf-8") as stream:
            document = json.load(stream)
    except FileNotFoundError as exc:
        raise CatalogImportError([f"Catalog file not found: {catalog_path}"]) from exc
    except json.JSONDecodeError as exc:
        raise CatalogImportError([f"Invalid JSON at {catalog_path}: {exc}"]) from exc
    validate_document_shape(document)
    return document


def validate_document_shape(document: Any) -> None:
    errors: list[str] = []
    if not isinstance(document, dict):
        raise CatalogImportError(["Catalog root must be an object."])

    if "coach_id" in document:
        errors.append("coach_id is forbidden in the catalog; use --coach-id.")
    if document.get("schema") != SCHEMA_NAME:
        errors.append(f"schema must be {SCHEMA_NAME}.")
    if document.get("version") != SCHEMA_VERSION:
        errors.append(f"version must be {SCHEMA_VERSION}.")
    source = document.get("source")
    if not isinstance(source, dict):
        errors.append("source must be an object.")
    else:
        if source.get("review_status") != "confirmed":
            errors.append("source.review_status must be confirmed; unresolved source data cannot import.")
        if not isinstance(source.get("documents"), list) or not source["documents"]:
            errors.append("source.documents must be a non-empty array.")
    raw_exercises = document.get("exercises")
    if not isinstance(raw_exercises, list) or not raw_exercises:
        errors.append("exercises must be a non-empty array.")
        raw_exercises = []

    allowed_root = {"schema", "version", "source", "exercises"}
    errors.extend(
        f"unknown root field: {key}"
        for key in sorted(set(document) - allowed_root)
    )
    external_keys: set[str] = set()
    for index, raw in enumerate(raw_exercises):
        errors.extend(_validate_exercise_shape(raw, index, external_keys))

    if errors:
        raise CatalogImportError(errors)


def _validate_exercise_shape(
    raw: Any, index: int, external_keys: set[str]
) -> list[str]:
    prefix = f"exercises[{index}]"
    errors: list[str] = []
    if not isinstance(raw, dict):
        return [f"{prefix} must be an object."]

    allowed = {
        "external_key",
        "name_fa",
        "name_en",
        "aliases_fa",
        "targets",
        "levels",
        "equipment_keys",
        "movement_pattern",
        "risk_tags",
        "is_preferred",
        "is_prohibited",
        "priority",
        "coach_notes",
        "source_document",
        "is_active",
        "is_archived",
    }
    errors.extend(f"{prefix}: unknown field {key}" for key in sorted(set(raw) - allowed))

    external_key = raw.get("external_key")
    if not isinstance(external_key, str) or not EXTERNAL_KEY_RE.fullmatch(external_key):
        errors.append(f"{prefix}.external_key must match {EXTERNAL_KEY_RE.pattern!r}.")
    elif external_key in external_keys:
        errors.append(f"{prefix}.external_key is duplicated in the catalog.")
    else:
        external_keys.add(external_key)

    for field in ("name_fa", "name_en", "movement_pattern", "coach_notes", "source_document"):
        if not isinstance(raw.get(field), str) or not raw[field].strip():
            errors.append(f"{prefix}.{field} must be a non-empty string.")

    errors.extend(_validate_string_array(raw.get("aliases_fa"), f"{prefix}.aliases_fa"))
    errors.extend(_validate_string_array(raw.get("levels"), f"{prefix}.levels", min_items=1))
    errors.extend(_validate_string_array(raw.get("equipment_keys"), f"{prefix}.equipment_keys", min_items=1))
    errors.extend(_validate_string_array(raw.get("risk_tags", []), f"{prefix}.risk_tags"))

    levels = raw.get("levels")
    if isinstance(levels, list):
        unknown_levels = sorted(set(levels) - LEVELS)
        errors.extend(f"{prefix}.levels contains unsupported key {level}" for level in unknown_levels)
        if len(levels) != len(set(levels)):
            errors.append(f"{prefix}.levels must not contain duplicates.")

    equipment_keys = raw.get("equipment_keys")
    if isinstance(equipment_keys, list) and len(equipment_keys) != len(set(equipment_keys)):
        errors.append(f"{prefix}.equipment_keys must not contain duplicates.")

    if not isinstance(raw.get("is_preferred"), bool):
        errors.append(f"{prefix}.is_preferred must be boolean.")
    if not isinstance(raw.get("is_prohibited"), bool):
        errors.append(f"{prefix}.is_prohibited must be boolean.")
    if raw.get("is_preferred") and raw.get("is_prohibited"):
        errors.append(f"{prefix} cannot be both preferred and prohibited.")
    if not isinstance(raw.get("priority"), int) or isinstance(raw.get("priority"), bool):
        errors.append(f"{prefix}.priority must be a non-negative integer.")
    elif raw["priority"] < 0:
        errors.append(f"{prefix}.priority must be a non-negative integer.")
    for field in ("is_active", "is_archived"):
        if not isinstance(raw.get(field, True if field == "is_active" else False), bool):
            errors.append(f"{prefix}.{field} must be boolean.")

    targets = raw.get("targets")
    if not isinstance(targets, list) or not targets:
        errors.append(f"{prefix}.targets must be a non-empty array.")
        return errors
    primary_count = 0
    seen_targets: set[tuple[str, str | None, str]] = set()
    for target_index, target in enumerate(targets):
        target_prefix = f"{prefix}.targets[{target_index}]"
        if not isinstance(target, dict):
            errors.append(f"{target_prefix} must be an object.")
            continue
        if set(target) - {"muscle_key", "region_key", "role"}:
            errors.extend(
                f"{target_prefix}: unknown field {key}"
                for key in sorted(set(target) - {"muscle_key", "region_key", "role"})
            )
        muscle_key = target.get("muscle_key")
        region_key = target.get("region_key")
        role = target.get("role")
        if not isinstance(muscle_key, str) or not muscle_key.strip():
            errors.append(f"{target_prefix}.muscle_key must be a non-empty string.")
        if region_key is not None and (
            not isinstance(region_key, str) or not region_key.strip()
        ):
            errors.append(f"{target_prefix}.region_key must be a string or null.")
        if role not in TARGET_ROLES:
            errors.append(f"{target_prefix}.role must be primary or secondary.")
        else:
            primary_count += role == ExerciseMuscleTarget.Role.PRIMARY
        target_key = (muscle_key, region_key, role)
        if target_key in seen_targets:
            errors.append(f"{target_prefix} duplicates another target.")
        seen_targets.add(target_key)
        if role == ExerciseMuscleTarget.Role.PRIMARY and not region_key:
            errors.append(f"{target_prefix}.region_key is required for the primary target.")
    if primary_count != 1:
        errors.append(f"{prefix}.targets must contain exactly one primary target.")
    aliases = raw.get("aliases_fa")
    if isinstance(aliases, list) and isinstance(raw.get("name_fa"), str):
        if raw["name_fa"] in aliases:
            errors.append(f"{prefix}.aliases_fa cannot contain name_fa.")
        if len(aliases) != len(set(aliases)):
            errors.append(f"{prefix}.aliases_fa must not contain duplicates.")
    return errors


def _validate_string_array(value: Any, field: str, *, min_items: int = 0) -> list[str]:
    if not isinstance(value, list):
        return [f"{field} must be an array of strings."]
    errors = [f"{field} must contain at least {min_items} item(s)."] if len(value) < min_items else []
    errors.extend(f"{field} must contain only non-empty strings." for item in value if not isinstance(item, str) or not item.strip())
    return errors


def prepare_import(
    coach: CoachProfile,
    document: dict[str, Any],
    *,
    replace_primary_muscle_key: str | None = None,
) -> ImportPlan:
    validate_document_shape(document)
    items, errors = _resolve_taxonomies(document["exercises"])
    if replace_primary_muscle_key and any(
        item["primary_muscle_key"] != replace_primary_muscle_key for item in items
    ):
        errors.append("Every imported primary target must match --replace-primary-muscle-key.")
    replacement_muscle = None
    if replace_primary_muscle_key:
        replacement_muscle = MuscleTaxonomy.objects.filter(
            key=replace_primary_muscle_key, is_active=True
        ).first()
        if replacement_muscle is None:
            errors.append(f"Unknown active replacement muscle key: {replace_primary_muscle_key}")
    if errors:
        raise CatalogImportError(errors)

    external_keys = [item["external_key"] for item in items]
    existing_by_external = {
        row.external_key: row
        for row in Exercise.objects.filter(coach=coach, external_key__in=external_keys)
    }
    existing_by_name = {
        (row.name, row.primary_muscle): row
        for row in Exercise.objects.filter(
            coach=coach,
            name__in=[item["name_fa"] for item in items],
        )
    }
    errors.extend(_validate_existing_identity(items, existing_by_external, existing_by_name))
    errors.extend(_validate_alias_conflicts(coach, items, existing_by_external, existing_by_name))

    candidate_deletions: list[Exercise] = []
    if replacement_muscle is not None:
        candidates = _legacy_and_structured_primary_exercises(coach, replacement_muscle)
        keep_ids = {
            row.id
            for row in [
                existing_by_external.get(item["external_key"])
                or existing_by_name.get((item["name_fa"], item["primary_muscle_name"]))
                for item in items
            ]
            if row is not None
        }
        candidate_deletions = [row for row in candidates if row.id not in keep_ids]
        errors.extend(_validate_group_cleanup(coach, candidate_deletions))

    if errors:
        raise CatalogImportError(errors)

    report_items = []
    counters = {"created": 0, "updated": 0, "skipped": 0}
    for item in items:
        existing = existing_by_external.get(item["external_key"]) or existing_by_name.get(
            (item["name_fa"], item["primary_muscle_name"])
        )
        if existing is None:
            action = "created"
        elif _exercise_matches(existing, item):
            action = "skipped"
        else:
            action = "updated"
        counters[action] += 1
        report_items.append(
            {
                "external_key": item["external_key"],
                "name_fa": item["name_fa"],
                "name_en": item["name_en"],
                "action": action,
                "existing_id": str(existing.id) if existing else None,
                "primary_target": {
                    "muscle_key": item["primary_muscle_key"],
                    "muscle_name": item["primary_muscle_name"],
                    "region_key": item["primary_region_key"],
                    "region_name": next(
                        (
                            target["region"].name
                            for target in item["resolved_targets"]
                            if target["role"] == ExerciseMuscleTarget.Role.PRIMARY
                            and target["region"] is not None
                        ),
                        None,
                    ),
                },
                "secondary_targets": [
                    {
                        "muscle_key": target["muscle"].key,
                        "muscle_name": target["muscle"].name,
                        "region_key": target["region"].key if target["region"] else None,
                        "region_name": target["region"].name if target["region"] else None,
                    }
                    for target in item["resolved_targets"]
                    if target["role"] == ExerciseMuscleTarget.Role.SECONDARY
                ],
                "levels": item["levels"],
                "equipment_keys": item["equipment_keys"],
                "equipment_names": [row.name for row in item["resolved_equipment"]],
            }
        )

    report = {
        "schema": SCHEMA_NAME,
        "version": SCHEMA_VERSION,
        "coach": {"id": str(coach.id), "display_name": coach.display_name},
        "created": counters["created"],
        "updated": counters["updated"],
        "skipped": counters["skipped"],
        "deleted": len(candidate_deletions),
        "errors": [],
        "exercises": report_items,
        "deletions": [
            {
                "id": str(row.id),
                "external_key": row.external_key,
                "name_fa": row.name,
                "primary_muscle": row.primary_muscle,
            }
            for row in candidate_deletions
        ],
    }
    return ImportPlan(coach, document, items, candidate_deletions, report)


def apply_import(plan: ImportPlan) -> dict[str, Any]:
    with transaction.atomic():
        _remove_deleted_exercises_from_groups(plan.coach, plan.deletions)
        for exercise in plan.deletions:
            exercise.delete()

        for item in plan.items:
            exercise = _find_import_target(plan.coach, item)
            if exercise is None:
                exercise = Exercise(coach=plan.coach)
            _write_exercise(exercise, item, plan.document["source"])

        _verify_apply(plan)
    return plan.report


def _resolve_taxonomies(raw_items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    muscles = {
        row.key: row
        for row in MuscleTaxonomy.objects.filter(is_active=True)
    }
    regions = {
        (row.muscle_id, row.key): row
        for row in MuscleRegion.objects.filter(is_active=True).select_related("muscle")
    }
    equipment = {
        row.key: row
        for row in EquipmentTaxonomy.objects.filter(is_active=True)
    }
    items: list[dict[str, Any]] = []
    errors: list[str] = []
    for index, raw in enumerate(raw_items):
        item = dict(raw)
        targets = []
        for target_index, raw_target in enumerate(raw["targets"]):
            muscle = muscles.get(raw_target["muscle_key"])
            if muscle is None:
                errors.append(
                    f"exercises[{index}].targets[{target_index}]: unknown muscle key {raw_target['muscle_key']}"
                )
                continue
            region = None
            if raw_target.get("region_key"):
                region = regions.get((muscle.id, raw_target["region_key"]))
                if region is None:
                    errors.append(
                        f"exercises[{index}].targets[{target_index}]: unknown region key "
                        f"{raw_target['region_key']} for muscle {muscle.key}"
                    )
                    continue
            targets.append(
                {
                    "muscle": muscle,
                    "region": region,
                    "role": raw_target["role"],
                    "sort_order": target_index,
                }
            )
        equipment_rows = []
        for equipment_key in raw["equipment_keys"]:
            equipment_row = equipment.get(equipment_key)
            if equipment_row is None:
                errors.append(f"exercises[{index}]: unknown equipment key {equipment_key}")
                continue
            equipment_rows.append(equipment_row)
        primary_targets = [
            target for target in targets if target["role"] == ExerciseMuscleTarget.Role.PRIMARY
        ]
        if len(primary_targets) == 1:
            primary = primary_targets[0]
            item.update(
                {
                    "resolved_targets": targets,
                    "primary_muscle_key": primary["muscle"].key,
                    "primary_muscle_name": primary["muscle"].name,
                    "primary_region_key": primary["region"].key if primary["region"] else None,
                    "resolved_equipment": equipment_rows,
                }
            )
            items.append(item)
    return items, errors


def _validate_existing_identity(
    items: list[dict[str, Any]],
    existing_by_external: dict[str, Exercise],
    existing_by_name: dict[tuple[str, str], Exercise],
) -> list[str]:
    errors: list[str] = []
    for item in items:
        by_external = existing_by_external.get(item["external_key"])
        by_name = existing_by_name.get((item["name_fa"], item["primary_muscle_name"]))
        if by_external and by_name and by_external.id != by_name.id:
            errors.append(
                f"{item['external_key']}: external_key and name identify different existing exercises."
            )
        if by_name and by_name.external_key and by_name.external_key != item["external_key"]:
            errors.append(
                f"{item['external_key']}: name is already owned by external_key {by_name.external_key}."
            )
    return errors


def _validate_alias_conflicts(
    coach: CoachProfile,
    items: list[dict[str, Any]],
    existing_by_external: dict[str, Exercise],
    existing_by_name: dict[tuple[str, str], Exercise],
) -> list[str]:
    errors: list[str] = []
    aliases = {alias for item in items for alias in item["aliases_fa"]}
    if not aliases:
        return errors
    existing_aliases = {
        row.alias: row
        for row in ExerciseAlias.objects.filter(coach=coach, alias__in=aliases).select_related("exercise")
    }
    existing_names = {
        row.name: row
        for row in Exercise.objects.filter(coach=coach, name__in=aliases)
    }
    for item in items:
        target = existing_by_external.get(item["external_key"]) or existing_by_name.get(
            (item["name_fa"], item["primary_muscle_name"])
        )
        for alias in item["aliases_fa"]:
            alias_row = existing_aliases.get(alias)
            if alias_row and (target is None or alias_row.exercise_id != target.id):
                errors.append(f"{item['external_key']}: alias {alias!r} belongs to another exercise.")
            name_row = existing_names.get(alias)
            if name_row and (target is None or name_row.id != target.id):
                errors.append(f"{item['external_key']}: alias {alias!r} is another canonical exercise name.")
    return errors


def _legacy_muscle_key(name: str) -> str:
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:12]
    return f"legacy-muscle-{digest}"


def _legacy_and_structured_primary_exercises(
    coach: CoachProfile, muscle: MuscleTaxonomy
) -> list[Exercise]:
    rows = list(
        Exercise.objects.filter(coach=coach, primary_muscle=muscle.name)
        .prefetch_related("muscle_targets__muscle")
    )
    allowed_primary_keys = {muscle.key, _legacy_muscle_key(muscle.name)}
    return [
        row
        for row in rows
        if not list(row.muscle_targets.all())
        or any(
            target.role == ExerciseMuscleTarget.Role.PRIMARY
            and target.muscle.key in allowed_primary_keys
            for target in row.muscle_targets.all()
        )
    ] + list(
        Exercise.objects.filter(
            coach=coach,
            muscle_targets__muscle=muscle,
            muscle_targets__role=ExerciseMuscleTarget.Role.PRIMARY,
        )
        .exclude(primary_muscle=muscle.name)
        .distinct()
    )


def _validate_group_cleanup(coach: CoachProfile, deletions: list[Exercise]) -> list[str]:
    names = {row.name for row in deletions}
    if not names:
        return []
    deletion_ids = {row.id for row in deletions}
    errors = []
    for group in ExerciseBankGroup.objects.filter(coach=coach):
        for field in GROUP_LIST_FIELDS:
            referenced = set(getattr(group, field) or []) & names
            for name in referenced:
                if Exercise.objects.filter(coach=coach, name=name).exclude(id__in=deletion_ids).exists():
                    errors.append(
                        f"Cannot safely remove {name!r} from bank group {group.group_name!r}: "
                        "the same name belongs to another exercise."
                    )
    return errors


def _exercise_matches(exercise: Exercise, item: dict[str, Any]) -> bool:
    if any(
        getattr(exercise, field) != expected
        for field, expected in {
            "name": item["name_fa"],
            "name_en": item["name_en"],
            "external_key": item["external_key"],
            "primary_muscle": item["primary_muscle_name"],
            "movement_pattern": item["movement_pattern"],
            "coach_notes": item["coach_notes"],
            "source_document": item["source_document"],
            "is_active": item.get("is_active", True),
            "is_archived": item.get("is_archived", False),
        }.items()
    ):
        return False
    secondary_names = [
        target["muscle"].name
        for target in item["resolved_targets"]
        if target["role"] == ExerciseMuscleTarget.Role.SECONDARY
    ]
    if list(exercise.secondary_muscles or []) != secondary_names:
        return False
    if list(exercise.risk_tags or []) != list(item.get("risk_tags") or []):
        return False
    expected_level = item["levels"][0] if len(item["levels"]) == 1 else Exercise.Level.ALL
    if exercise.level != expected_level:
        return False
    if exercise.equipment != ", ".join(row.name for row in item["resolved_equipment"]):
        return False
    target_values = {
        (row.muscle_id, row.region_id, row.role)
        for row in exercise.muscle_targets.all()
    }
    expected_targets = {
        (row["muscle"].id, row["region"].id if row["region"] else None, row["role"])
        for row in item["resolved_targets"]
    }
    if target_values != expected_targets:
        return False
    if set(exercise.suitable_level_rows.values_list("level", flat=True)) != set(item["levels"]):
        return False
    if set(exercise.equipment_rows.values_list("equipment_id", flat=True)) != {
        row.id for row in item["resolved_equipment"]
    }:
        return False
    aliases = set(exercise.aliases.values_list("alias", flat=True))
    if aliases != set(item["aliases_fa"]):
        return False
    preference = exercise.preferences.filter(coach=exercise.coach).first()
    return bool(
        preference
        and preference.is_preferred == item["is_preferred"]
        and preference.is_prohibited == item["is_prohibited"]
        and preference.priority == item["priority"]
        and set(preference.suitable_levels or []) == set(item["levels"])
    )


def _find_import_target(coach: CoachProfile, item: dict[str, Any]) -> Exercise | None:
    exercise = Exercise.objects.filter(coach=coach, external_key=item["external_key"]).first()
    if exercise is not None:
        return exercise
    return Exercise.objects.filter(
        coach=coach,
        name=item["name_fa"],
        primary_muscle=item["primary_muscle_name"],
    ).first()


def _write_exercise(exercise: Exercise, item: dict[str, Any], source: dict[str, Any]) -> None:
    exercise.name = item["name_fa"]
    exercise.name_en = item["name_en"]
    exercise.external_key = item["external_key"]
    exercise.primary_muscle = item["primary_muscle_name"]
    exercise.secondary_muscles = [
        target["muscle"].name
        for target in item["resolved_targets"]
        if target["role"] == ExerciseMuscleTarget.Role.SECONDARY
    ]
    exercise.equipment = ", ".join(row.name for row in item["resolved_equipment"])
    exercise.level = item["levels"][0] if len(item["levels"]) == 1 else Exercise.Level.ALL
    exercise.movement_pattern = item["movement_pattern"]
    exercise.risk_tags = list(item.get("risk_tags") or [])
    exercise.source_document = item["source_document"] or ", ".join(source["documents"])
    exercise.coach_notes = item["coach_notes"]
    exercise.is_active = item.get("is_active", True)
    exercise.is_archived = item.get("is_archived", False)
    exercise.save()

    ExerciseMuscleTarget.objects.filter(exercise=exercise).delete()
    ExerciseMuscleTarget.objects.bulk_create(
        [
            ExerciseMuscleTarget(
                exercise=exercise,
                muscle=target["muscle"],
                region=target["region"],
                role=target["role"],
                sort_order=target["sort_order"],
            )
            for target in item["resolved_targets"]
        ]
    )
    ExerciseSuitableLevel.objects.filter(exercise=exercise).delete()
    ExerciseSuitableLevel.objects.bulk_create(
        [ExerciseSuitableLevel(exercise=exercise, level=level) for level in item["levels"]]
    )
    ExerciseEquipment.objects.filter(exercise=exercise).delete()
    ExerciseEquipment.objects.bulk_create(
        [ExerciseEquipment(exercise=exercise, equipment=row) for row in item["resolved_equipment"]]
    )
    exercise.aliases.all().delete()
    ExerciseAlias.objects.bulk_create(
        [ExerciseAlias(coach=exercise.coach, exercise=exercise, alias=alias) for alias in item["aliases_fa"]]
    )
    preference, _ = CoachExercisePreference.objects.get_or_create(
        coach=exercise.coach,
        exercise=exercise,
    )
    preference.is_preferred = item["is_preferred"]
    preference.is_prohibited = item["is_prohibited"]
    preference.priority = item["priority"]
    preference.suitable_levels = list(item["levels"])
    preference.notes = item["coach_notes"]
    preference.save()


def _remove_deleted_exercises_from_groups(
    coach: CoachProfile, deletions: list[Exercise]
) -> None:
    names = {row.name for row in deletions}
    if not names:
        return
    for group in ExerciseBankGroup.objects.filter(coach=coach):
        changed = False
        for field in GROUP_LIST_FIELDS:
            values = list(getattr(group, field) or [])
            filtered = [value for value in values if value not in names]
            if filtered != values:
                setattr(group, field, filtered)
                changed = True
        if changed:
            group.save(update_fields=[*GROUP_LIST_FIELDS, "updated_at"])


def _verify_apply(plan: ImportPlan) -> None:
    expected_keys = {item["external_key"] for item in plan.items}
    actual = {
        row.external_key: row
        for row in Exercise.objects.filter(coach=plan.coach, external_key__in=expected_keys)
    }
    if set(actual) != expected_keys:
        raise CatalogImportError(["Apply verification failed: imported external keys are incomplete."])
    for item in plan.items:
        row = actual[item["external_key"]]
        if row.coach_id != plan.coach.id or not _exercise_matches(row, item):
            raise CatalogImportError(
                [f"Apply verification failed for external_key {item['external_key']}."]
            )
    if plan.deletions:
        remaining_deleted = Exercise.objects.filter(
            coach=plan.coach, id__in=[row.id for row in plan.deletions]
        ).exists()
        if remaining_deleted:
            raise CatalogImportError(["Apply verification failed: old replacement rows remain."])
