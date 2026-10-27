"""Executable movement vocabulary shared by catalog validation and generation."""

from rest_framework.exceptions import ValidationError

PATTERNS = {
    "push_horizontal": "فشار افقی",
    "push_vertical": "فشار عمودی",
    "push_downward": "فشار رو به پایین / دیپ",
    "pull_horizontal": "کشش افقی",
    "pull_vertical": "کشش عمودی",
    "shoulder_adduction": "جمع‌کردن بازوها / فلای",
    "shoulder_abduction": "بالابردن بازو از جانب",
    "shoulder_flexion": "بالابردن بازو از جلو",
    "shoulder_extension": "پایین‌آوردن بازو / پول‌اور",
    "shoulder_horizontal_abduction": "بازکردن بازوها / نشر خم",
    "scapular_elevation": "بالابردن کتف / شراگ",
    "elbow_flexion": "خم‌کردن آرنج",
    "elbow_extension": "بازکردن آرنج",
    "knee_dominant": "حرکت زانومحور / اسکوات",
    "hip_hinge": "خم‌ و راست‌شدن از لگن",
    "hip_extension": "بازکردن لگن / هیپ‌تراست",
    "hip_abduction": "دورکردن ران",
    "hip_adduction": "نزدیک‌کردن ران",
    "knee_extension": "بازکردن زانو / جلوپا",
    "knee_flexion": "خم‌کردن زانو / پشت‌پا",
    "ankle_extension": "بالاآمدن روی پنجه / ساق",
    "trunk_flexion": "خم‌کردن تنه / کرانچ",
    "trunk_rotation": "چرخش تنه",
    "trunk_stability": "ثبات تنه / پلانک",
    "wrist_flexion": "خم‌کردن مچ",
    "wrist_extension": "بازکردن مچ",
    "carry": "حمل وزنه",
}
JOINTS = {
    "shoulder": "شانه",
    "elbow": "آرنج",
    "wrist": "مچ دست",
    "hip": "لگن",
    "knee": "زانو",
    "ankle": "مچ پا",
    "spine": "ستون فقرات",
}
MECHANICS = {"single_joint": "تک‌مفصلی", "multi_joint": "چندمفصلی", "isometric": "ایستا"}
UNITS = {"reps": "تکرار", "seconds": "ثانیه"}
PATTERN_ALIASES = {
    "horizontal_press": "push_horizontal",
    "vertical_press": "push_vertical",
    "horizontal_pull": "pull_horizontal",
    "vertical_pull": "pull_vertical",
    "hinge": "hip_hinge",
    "squat": "knee_dominant",
}
PATTERN_JOINTS = {
    "push_horizontal": ["shoulder", "elbow"],
    "push_vertical": ["shoulder", "elbow"],
    "push_downward": ["shoulder", "elbow"],
    "pull_horizontal": ["shoulder", "elbow"],
    "pull_vertical": ["shoulder", "elbow"],
    "knee_dominant": ["hip", "knee", "ankle"],
    "hip_hinge": ["hip"],
    "hip_extension": ["hip"],
    "hip_abduction": ["hip"],
    "hip_adduction": ["hip"],
    "knee_extension": ["knee"],
    "knee_flexion": ["knee"],
    "ankle_extension": ["ankle"],
    "elbow_flexion": ["elbow"],
    "elbow_extension": ["elbow"],
    "wrist_flexion": ["wrist"],
    "wrist_extension": ["wrist"],
    "trunk_flexion": ["spine"],
    "trunk_rotation": ["spine"],
    "trunk_stability": ["spine"],
    "carry": ["shoulder", "spine", "hip"],
}
for _pattern in PATTERNS:
    if _pattern.startswith(("shoulder_", "scapular_")):
        PATTERN_JOINTS[_pattern] = ["shoulder"]

MUSCLE_NAMES = {
    "chest": "سینه",
    "back": "زیربغل",
    "shoulders": "سرشانه",
    "quadriceps": "چهارسر ران",
    "hamstrings": "پشت پا",
    "glutes": "باسن",
    "biceps": "جلو بازو",
    "triceps": "پشت بازو",
    "calves": "ساق",
    "forearms": "ساعد",
    "core": "شکم",
    "traps": "کول",
}
MUSCLE_ALIASES = {
    **{key: key for key in MUSCLE_NAMES},
    **{name: key for key, name in MUSCLE_NAMES.items()},
    "abs": "core",
    "همسترینگ": "hamstrings",
    "چهارسر": "quadriceps",
    "بالاسینه": "chest",
    "upper_chest": "chest",
    "بالا سینه": "chest",
    "میان تنه": "core",
    "میان‌تنه": "core",
    "شانه": "shoulders",
}


def muscle_key(value):
    return MUSCLE_ALIASES.get(str(value or "").strip(), str(value or "").strip())


def validate_metadata(payload):
    if "movement_pattern" in payload and isinstance(payload["movement_pattern"], str):
        payload["movement_pattern"] = PATTERN_ALIASES.get(
            payload["movement_pattern"], payload["movement_pattern"]
        )
    for key, choices in (
        ("movement_pattern", PATTERNS),
        ("mechanics", MECHANICS),
        ("prescription_unit", UNITS),
    ):
        if key in payload and (
            not isinstance(payload[key], str)
            or (payload[key] not in choices and payload[key] != "")
        ):
            raise ValidationError({key: ["گزینهٔ معتبر را از فهرست انتخاب کنید."]})
    if "joint_keys" in payload:
        keys = payload["joint_keys"]
        if not isinstance(keys, list) or any(
            not isinstance(key, str) or key not in JOINTS for key in keys
        ):
            raise ValidationError({"joint_keys": ["مفاصل انتخاب‌شده معتبر نیستند."]})
        payload["joint_keys"] = list(dict.fromkeys(keys))


def metadata_missing(exercise):
    missing = [
        field
        for field, valid in (
            ("movement_pattern", exercise.movement_pattern in PATTERNS),
            ("mechanics", exercise.mechanics in MECHANICS),
            ("joint_keys", bool(exercise.joint_keys)),
            ("prescription_unit", exercise.prescription_unit in UNITS),
        )
        if not valid
    ]
    if muscle_key(exercise.primary_muscle) not in MUSCLE_NAMES and not any(
        target.role == "primary" and target.muscle.key in MUSCLE_NAMES
        for target in exercise.muscle_targets.all()
    ):
        missing.append("primary_target")
    return missing


def movement_role(snapshot):
    """Derive execution roles from structured data, never from display names."""
    pattern = snapshot.get("movement_pattern", "")
    primary = muscle_key(snapshot.get("primary_muscle_key") or snapshot.get("primary_muscle"))
    if pattern == "push_horizontal":
        regions = [
            target.get("region_key")
            for target in snapshot.get("targets", [])
            if target.get("role") == "primary"
        ]
        return "incline" if "upper_chest" in regions else "compound_press"
    return {
        "push_downward": "compound_press" if primary == "chest" else "triceps",
        "push_vertical": "shoulder_press",
        "pull_vertical": "vertical_pull",
        "pull_horizontal": "horizontal_pull",
        "shoulder_adduction": "chest_accessory",
        "shoulder_abduction": "lateral",
        "shoulder_horizontal_abduction": "rear_delt",
        "shoulder_flexion": "lateral",
        "shoulder_extension": "back_accessory",
        "elbow_flexion": "biceps",
        "elbow_extension": "triceps",
        "knee_dominant": "quad",
        "knee_extension": "quad",
        "hip_hinge": "hinge",
        "knee_flexion": "hinge",
        "hip_extension": "leg_accessory",
        "hip_abduction": "leg_accessory",
        "hip_adduction": "leg_accessory",
        "ankle_extension": "calf",
        "trunk_flexion": "core_flexion",
        "trunk_stability": "core_stability",
        "trunk_rotation": "core_stability",
        "wrist_flexion": "forearm",
        "wrist_extension": "forearm",
    }.get(pattern, "accessory" if primary else "unclassified")


def movement_class(item):
    snapshot = item.get("exercise_snapshot") or item
    if snapshot.get("mechanics") == "multi_joint":
        return "compound"
    if snapshot.get("mechanics") == "single_joint":
        return "isolation"
    if snapshot.get("mechanics") == "isometric":
        return "core"
    return "unclassified"


def matches_muscle(metadata, muscle):
    key = muscle_key(metadata.get("primary_muscle_key") or metadata.get("primary_muscle"))
    if muscle == "پا":
        return key in {"پا", "quadriceps", "hamstrings", "glutes", "calves"}
    return key == muscle_key(muscle)


def exercise_snapshot(exercise):
    targets = list(exercise.muscle_targets.all())
    primary = next((target.muscle.key for target in targets if target.role == "primary"), None)
    return {
        "id": str(exercise.id),
        "name": exercise.name,
        "name_en": exercise.name_en,
        "primary_muscle": exercise.primary_muscle,
        "primary_muscle_key": primary or muscle_key(exercise.primary_muscle),
        "secondary_muscles": exercise.secondary_muscles,
        "movement_pattern": exercise.movement_pattern,
        "mechanics": exercise.mechanics,
        "joint_keys": exercise.joint_keys,
        "prescription_unit": exercise.prescription_unit,
        "equipment": exercise.equipment,
        "level": exercise.level,
        "equipment_keys": [row.equipment.key for row in exercise.equipment_rows.all()],
        "levels": [row.level for row in exercise.suitable_level_rows.all()],
        "targets": [
            {
                "muscle_key": target.muscle.key,
                "region_key": target.region.key if target.region else None,
                "role": target.role,
            }
            for target in targets
        ],
    }


def infer_legacy_metadata(name, pattern=""):
    """One-time catalog conversion only. Ambiguous rows remain explicitly incomplete."""
    text = name.replace("‌", " ").lower()
    pattern = PATTERN_ALIASES.get(pattern, pattern)
    rules = [
        (("پلانک", "plank"), "trunk_stability"),
        (("پشت پا", "پشت ران", "leg curl"), "knee_flexion"),
        (("جلوپا", "جلو پا", "leg extension"), "knee_extension"),
        (("هیپ تراست", "hip thrust", "glute bridge", "پل باسن"), "hip_extension"),
        (("کیک بک باسن", "کیک‌بک باسن"), "hip_extension"),
        (("خارج ران", "abductor", "hip abduction"), "hip_abduction"),
        (("داخل ران", "adductor", "hip adduction"), "hip_adduction"),
        (("ساق", "calf"), "ankle_extension"),
        (
            ("اسکوات", "اسکات", "پرس پا", "لانج", "هاک", "squat", "lunge", "leg press"),
            "knee_dominant",
        ),
        (("ددلیفت", "دد لیفت", "رومانی", "deadlift", "good morning"), "hip_hinge"),
        (("نشر خم", "نشر خلفی", "rear delt", "reverse fly"), "shoulder_horizontal_abduction"),
        (("نشر جانب", "نشر از جانب", "lateral raise"), "shoulder_abduction"),
        (("نشر جلو", "نشر از جلو", "front raise"), "shoulder_flexion"),
        (("شراگ", "shrug"), "scapular_elevation"),
        (("پولاور", "پول اور", "pullover", "straight arm"), "shoulder_extension"),
        (
            ("پرس سرشانه", "پرس شانه", "پرس نظامی", "shoulder press", "overhead press"),
            "push_vertical",
        ),
        (("پشت بازو", "پشتبازو", "triceps", "پوشدان", "پوش داون"), "elbow_extension"),
        (("جلو بازو", "جلوبازو", "biceps", "چکش", "لاری"), "elbow_flexion"),
        (("کراس", "قفسه", "فلای", "pec deck", "پروانه"), "shoulder_adduction"),
        (
            ("پرس سینه", "پرس بالا", "پرس زیر", "bench press", "chest press", "شنا سوئدی"),
            "push_horizontal",
        ),
        (("پارالل", "دیپ دستگاه", "دیپ", "dip"), "push_downward"),
        (("لت", "بارفیکس", "pulldown", "pullup", "pull up"), "pull_vertical"),
        (("قایق", "روئینگ", "تی بار", "row", "زیربغل خم", "زیر بغل خم"), "pull_horizontal"),
        (("کرانچ", "crunch", "sit up"), "trunk_flexion"),
        (("ساعد", "مچ", "wrist"), "wrist_flexion"),
    ]
    if pattern not in PATTERNS:
        pattern = next((value for words, value in rules if any(word in text for word in words)), "")
    if not pattern:
        return {}
    mechanics = (
        "multi_joint"
        if pattern
        in {
            "push_horizontal",
            "push_vertical",
            "push_downward",
            "pull_horizontal",
            "pull_vertical",
            "knee_dominant",
            "hip_hinge",
            "carry",
        }
        else "single_joint"
    )
    if pattern == "trunk_stability":
        mechanics = "isometric"
    return {
        "movement_pattern": pattern,
        "mechanics": mechanics,
        "joint_keys": PATTERN_JOINTS[pattern],
        "prescription_unit": "seconds" if pattern == "trunk_stability" else "reps",
    }
