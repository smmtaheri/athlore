"""Additive, coach-owned exercise reference pack; never replace a coach's work."""

import re
from collections import Counter

from django.db import transaction

from accounts.exercise_metadata import MUSCLE_NAMES
from accounts.models import (
    EquipmentTaxonomy,
    Exercise,
    MuscleRegion,
    MuscleTaxonomy,
    TrainingTechnique,
)
from accounts.rules_services import create_exercise

PACK_VERSION = "2026-10-catalog-expansion-v1"
REFERENCES = [
    "https://www.acefitness.org/resources/everyone/exercise-library/",
    "https://www.acefitness.org/continuing-education/certified/may-2024/8632/the-ace-workout-builder-for-split-routines/",
    "https://www.nsca.com/contentassets/8323553f698a466a98220b21d9eb9a65/foundationsoffitnessprogramming_201508.pdf",
]
REGIONS = {
    "chest": ("mid_chest", "بخش میانی سینه"),
    "back": ("lats", "لت"),
    "quadriceps": ("vastus", "چهارسر ران"),
    "hamstrings": ("posterior_chain", "پشت ران"),
    "glutes": ("glute_max", "سرینی بزرگ"),
    "biceps": ("long_head", "جلو بازو"),
    "triceps": ("long_head", "پشت بازو"),
    "calves": ("gastrocnemius", "دوقلو"),
    "core": ("abdominals", "شکم"),
    "forearms": ("wrist_flexors", "خم‌کننده‌های مچ"),
    "traps": ("upper_traps", "کول بالایی"),
    "shoulders": ("rear_delt", "دلتوئید خلفی"),
}
EXTRA_REGIONS = {
    "glutes": [("glute_med", "سرینی میانی")],
    "calves": [("soleus", "نعلی")],
    "core": [("obliques", "مورب‌های شکم"), ("trunk_stabilizers", "تثبیت‌کننده‌های تنه")],
    "forearms": [("wrist_extensors", "بازکننده‌های مچ"), ("grip", "گیرش")],
    "traps": [("middle_traps", "کول میانی")],
}
EQUIPMENT = {
    "bodyweight": "وزن بدن",
    "dumbbell": "دمبل",
    "barbell": "هالتر",
    "cable": "کابل",
    "machine": "دستگاه",
    "resistance_band": "کش",
    "kettlebell": "کتل بل",
    "bench_flat": "نیمکت صاف",
    "bench_adjustable": "نیمکت شیب‌دار",
    "pullup_bar": "میله بارفیکس",
}
PATTERN_DATA = {
    "push_horizontal": (
        "multi_joint",
        ["shoulder", "elbow"],
        "بدن را ثابت نگه دار؛ با کنترل پایین برو و بدون قفل‌کردن ناگهانی آرنج فشار بده.",
    ),
    "push_vertical": (
        "multi_joint",
        ["shoulder", "elbow"],
        "تنه را ثابت نگه دار؛ وزنه را در دامنهٔ بدون درد بالا ببر و با کنترل برگردان.",
    ),
    "pull_horizontal": (
        "multi_joint",
        ["shoulder", "elbow"],
        "تنه ثابت؛ آرنج‌ها را به عقب بکش و بدون تاب‌دادن بدن آرام برگردان.",
    ),
    "pull_vertical": (
        "multi_joint",
        ["shoulder", "elbow"],
        "شانه‌ها را کنترل کن؛ کشش را با آرنج‌ها هدایت کن و از تاب‌دادن تنه پرهیز کن.",
    ),
    "shoulder_extension": (
        "single_joint",
        ["shoulder"],
        "آرنج کمی خم و ثابت؛ بازو را با کنترل به سمت تنه بکش و آرام برگردان.",
    ),
    "shoulder_horizontal_abduction": (
        "single_joint",
        ["shoulder"],
        "آرنج‌ها کمی خم؛ بازوها را به طرفین باز کن، بدون بالاانداختن شانه یا تاب تنه.",
    ),
    "shoulder_abduction": (
        "single_joint",
        ["shoulder"],
        "بازو را با کنترل از کنار بالا ببر؛ شانه را بالا نینداز و دامنه را با راحتی مفصل تنظیم کن.",
    ),
    "shoulder_flexion": (
        "single_joint",
        ["shoulder"],
        "بازو را از جلو با تنهٔ ثابت بالا ببر؛ بدون تاب‌دادن وزنه آرام برگردان.",
    ),
    "knee_dominant": (
        "multi_joint",
        ["hip", "knee", "ankle"],
        "کف پا را پایدار نگه دار؛ زانو در راستای پنجه حرکت کند و دامنه با کنترل انتخاب شود.",
    ),
    "hip_hinge": (
        "multi_joint",
        ["hip"],
        "با زانوی کمی خم، لگن را عقب ببر؛ تنه را ثابت و بار را نزدیک بدن نگه دار.",
    ),
    "knee_flexion": (
        "single_joint",
        ["knee"],
        "بدون تغییر ناگهانی وضعیت لگن، زانو را خم کن و با کنترل به وضعیت شروع برگرد.",
    ),
    "hip_extension": (
        "single_joint",
        ["hip"],
        "لگن را با انقباض باسن باز کن؛ از گودکردن کمر برای بیشترکردن دامنه پرهیز کن.",
    ),
    "hip_abduction": (
        "single_joint",
        ["hip"],
        "لگن را ثابت نگه دار؛ ران را به کنار باز کن و بدون چرخاندن تنه برگردان.",
    ),
    "ankle_extension": (
        "single_joint",
        ["ankle"],
        "با کنترل روی پنجه بالا برو؛ مکث کوتاه کن و پاشنه را بدون جهش پایین بیاور.",
    ),
    "trunk_flexion": (
        "single_joint",
        ["spine"],
        "تنه را به‌آرامی جمع کن؛ گردن را نکش و حرکت را بدون شتاب انجام بده.",
    ),
    "trunk_stability": (
        "isometric",
        ["spine"],
        "تنه را در وضعیت کنترل‌شده ثابت نگه دار؛ نفس را حبس نکن و پیش از افت فرم توقف کن.",
    ),
    "trunk_rotation": (
        "single_joint",
        ["spine"],
        "تنه را در دامنهٔ کنترل‌شده بچرخان؛ از پرتاب بار و پیچش ناگهانی پرهیز کن.",
    ),
    "elbow_flexion": (
        "single_joint",
        ["elbow"],
        "بازو را ثابت نگه دار؛ آرنج را بدون تاب تنه خم کن و بار را آرام پایین بیاور.",
    ),
    "elbow_extension": (
        "single_joint",
        ["elbow"],
        "بازو را ثابت نگه دار؛ آرنج را با کنترل باز کن و بدون ضربه برگردان.",
    ),
    "wrist_flexion": (
        "single_joint",
        ["wrist"],
        "ساعد را ثابت و مچ را آزاد نگه دار؛ مچ را در دامنهٔ راحت با کنترل خم کن.",
    ),
    "wrist_extension": (
        "single_joint",
        ["wrist"],
        "ساعد را تکیه بده؛ پشت دست را با حرکت کنترل‌شدهٔ مچ بالا ببر و آرام برگردان.",
    ),
    "scapular_elevation": (
        "single_joint",
        ["shoulder"],
        "کتف‌ها را مستقیم بالا ببر و کنترل‌شده پایین بیاور؛ شانه‌ها را نچرخان.",
    ),
    "carry": (
        "multi_joint",
        ["shoulder", "spine", "hip"],
        "قامت را ثابت نگه دار و با قدم‌های کوتاه حرکت کن؛ از کج‌شدن تنه و حبس نفس پرهیز کن.",
    ),
}

# Each definition specifies actual dependencies, not equipment inferred from its name.
# An intermediate/advanced restriction on an existing row is never loosened here.
MOVEMENTS = [
    (
        "pushup_knees",
        "شنا سوئدی روی زانو",
        "Kneeling push-up",
        "chest",
        "push_horizontal",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "pushup_incline",
        "شنا سوئدی دست روی نیمکت",
        "Incline push-up",
        "chest",
        "push_horizontal",
        ["bodyweight", "bench_flat"],
        "beginner",
        None,
    ),
    (
        "db_floor_press",
        "پرس سینه دمبل روی زمین",
        "Dumbbell floor press",
        "chest",
        "push_horizontal",
        ["dumbbell"],
        "beginner",
        None,
    ),
    (
        "band_chest_press",
        "پرس سینه با کش دور پشت",
        "Band chest press",
        "chest",
        "push_horizontal",
        ["resistance_band"],
        "beginner",
        None,
    ),
    (
        "pushup_feet_raised",
        "شنا سوئدی پا روی نیمکت",
        "Decline push-up",
        "chest",
        "push_horizontal",
        ["bodyweight", "bench_flat"],
        "intermediate",
        "upper_chest",
    ),
    (
        "seated_band_row",
        "قایقی نشسته با کش دور کف پا",
        "Seated band row",
        "back",
        "pull_horizontal",
        ["resistance_band"],
        "beginner",
        "upper_back",
    ),
    (
        "db_bent_row",
        "زیربغل دمبل خم جفت دست",
        "Bent-over dumbbell row",
        "back",
        "pull_horizontal",
        ["dumbbell"],
        "intermediate",
        "upper_back",
    ),
    (
        "db_supported_row",
        "زیربغل دمبل سینه تکیه نیمکت",
        "Chest-supported dumbbell row",
        "back",
        "pull_horizontal",
        ["dumbbell", "bench_adjustable"],
        "beginner",
        "upper_back",
    ),
    (
        "lat_neutral",
        "لت سیم‌کش دست موازی",
        "Neutral-grip lat pulldown",
        "back",
        "pull_vertical",
        ["cable"],
        "beginner",
        None,
    ),
    (
        "chin_up",
        "بارفیکس دست برعکس",
        "Chin-up",
        "back",
        "pull_vertical",
        ["pullup_bar"],
        "intermediate",
        None,
    ),
    (
        "assisted_pullup",
        "بارفیکس کمکی دستگاه",
        "Assisted pull-up",
        "back",
        "pull_vertical",
        ["machine"],
        "beginner",
        None,
    ),
    (
        "kneeling_lat",
        "لت تک دست سیم‌کش زانوزده",
        "Half-kneeling single-arm pulldown",
        "back",
        "pull_vertical",
        ["cable"],
        "intermediate",
        None,
    ),
    (
        "machine_high_row",
        "زیربغل دستگاه های رو",
        "Machine high row",
        "back",
        "pull_horizontal",
        ["machine"],
        "beginner",
        "upper_back",
    ),
    (
        "band_pullapart",
        "بازکردن کش جلوی سینه",
        "Band pull-apart",
        "shoulders",
        "shoulder_horizontal_abduction",
        ["resistance_band"],
        "beginner",
        "rear_delt",
    ),
    (
        "prone_t_raise",
        "نشر T خوابیده روی زمین",
        "Prone T raise",
        "shoulders",
        "shoulder_horizontal_abduction",
        ["bodyweight"],
        "beginner",
        "rear_delt",
    ),
    (
        "band_lateral_raise",
        "نشر جانب با کش زیر پا",
        "Band lateral raise",
        "shoulders",
        "shoulder_abduction",
        ["resistance_band"],
        "beginner",
        "side_delt",
    ),
    (
        "band_front_raise",
        "نشر جلو با کش زیر پا",
        "Band front raise",
        "shoulders",
        "shoulder_flexion",
        ["resistance_band"],
        "beginner",
        "front_delt",
    ),
    (
        "band_overhead_press",
        "پرس سرشانه کش ایستاده",
        "Band overhead press",
        "shoulders",
        "push_vertical",
        ["resistance_band"],
        "beginner",
        "front_delt",
    ),
    (
        "bodyweight_squat",
        "اسکوات وزن بدن",
        "Bodyweight squat",
        "quadriceps",
        "knee_dominant",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "split_squat_bw",
        "اسپلیت اسکوات وزن بدن",
        "Bodyweight split squat",
        "quadriceps",
        "knee_dominant",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "reverse_lunge_bw",
        "لانج معکوس وزن بدن",
        "Bodyweight reverse lunge",
        "quadriceps",
        "knee_dominant",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "reverse_lunge_db",
        "لانج معکوس دمبل",
        "Dumbbell reverse lunge",
        "quadriceps",
        "knee_dominant",
        ["dumbbell"],
        "intermediate",
        None,
    ),
    (
        "front_squat",
        "اسکوات از جلو هالتر",
        "Barbell front squat",
        "quadriceps",
        "knee_dominant",
        ["barbell"],
        "advanced",
        None,
    ),
    (
        "kettlebell_squat",
        "اسکوات گوبلت کتل بل",
        "Kettlebell goblet squat",
        "quadriceps",
        "knee_dominant",
        ["kettlebell"],
        "beginner",
        None,
    ),
    (
        "db_rdl",
        "ددلیفت رومانیایی دمبل",
        "Dumbbell Romanian deadlift",
        "hamstrings",
        "hip_hinge",
        ["dumbbell"],
        "beginner",
        None,
    ),
    (
        "band_rdl",
        "ددلیفت رومانیایی کش زیر پا",
        "Band Romanian deadlift",
        "hamstrings",
        "hip_hinge",
        ["resistance_band"],
        "beginner",
        None,
    ),
    (
        "kb_rdl",
        "ددلیفت رومانیایی کتل بل",
        "Kettlebell Romanian deadlift",
        "hamstrings",
        "hip_hinge",
        ["kettlebell"],
        "intermediate",
        None,
    ),
    (
        "single_leg_rdl",
        "ددلیفت رومانیایی دمبل تک پا",
        "Single-leg dumbbell Romanian deadlift",
        "hamstrings",
        "hip_hinge",
        ["dumbbell"],
        "intermediate",
        None,
    ),
    (
        "good_morning_bw",
        "گودمورنینگ وزن بدن",
        "Bodyweight good morning",
        "hamstrings",
        "hip_hinge",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "hamstring_walkout",
        "راه‌رفتن پاشنه از پل باسن",
        "Hamstring walkout",
        "hamstrings",
        "knee_flexion",
        ["bodyweight"],
        "intermediate",
        None,
    ),
    (
        "db_glute_bridge",
        "پل باسن دمبل",
        "Dumbbell glute bridge",
        "glutes",
        "hip_extension",
        ["dumbbell"],
        "beginner",
        None,
    ),
    (
        "db_hip_thrust",
        "هیپ تراست دمبل روی نیمکت",
        "Dumbbell hip thrust",
        "glutes",
        "hip_extension",
        ["dumbbell", "bench_flat"],
        "intermediate",
        None,
    ),
    (
        "machine_hip_thrust",
        "هیپ تراست دستگاه",
        "Machine hip thrust",
        "glutes",
        "hip_extension",
        ["machine"],
        "beginner",
        None,
    ),
    (
        "donkey_kick",
        "کیک بک باسن چهار دست و پا",
        "Quadruped hip extension",
        "glutes",
        "hip_extension",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "fire_hydrant",
        "دورکردن ران چهار دست و پا",
        "Fire hydrant",
        "glutes",
        "hip_abduction",
        ["bodyweight"],
        "beginner",
        "glute_med",
    ),
    (
        "side_lying_abduction",
        "دورکردن ران خوابیده به پهلو",
        "Side-lying hip abduction",
        "glutes",
        "hip_abduction",
        ["bodyweight"],
        "beginner",
        "glute_med",
    ),
    (
        "band_clamshell",
        "بازکردن زانو به پهلو با کش",
        "Band clamshell",
        "glutes",
        "hip_abduction",
        ["resistance_band"],
        "beginner",
        "glute_med",
    ),
    (
        "band_side_steps",
        "قدم جانبی با کش دور زانو",
        "Band lateral walk",
        "glutes",
        "hip_abduction",
        ["resistance_band"],
        "beginner",
        "glute_med",
    ),
    (
        "frog_pump",
        "پل باسن پروانه وزن بدن",
        "Frog pump",
        "glutes",
        "hip_extension",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "standing_calf_bw",
        "ساق پا ایستاده وزن بدن",
        "Standing bodyweight calf raise",
        "calves",
        "ankle_extension",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "standing_calf_db",
        "ساق پا ایستاده دمبل",
        "Standing dumbbell calf raise",
        "calves",
        "ankle_extension",
        ["dumbbell"],
        "beginner",
        None,
    ),
    (
        "single_calf_bw",
        "ساق پا تک پا وزن بدن",
        "Single-leg calf raise",
        "calves",
        "ankle_extension",
        ["bodyweight"],
        "intermediate",
        None,
    ),
    (
        "single_calf_db",
        "ساق پا تک پا دمبل",
        "Single-leg dumbbell calf raise",
        "calves",
        "ankle_extension",
        ["dumbbell"],
        "intermediate",
        None,
    ),
    (
        "seated_calf_machine",
        "ساق پا نشسته دستگاه",
        "Seated machine calf raise",
        "calves",
        "ankle_extension",
        ["machine"],
        "beginner",
        "soleus",
    ),
    (
        "seated_band_calf",
        "ساق پا نشسته با کش دور کف پا",
        "Seated band calf raise",
        "calves",
        "ankle_extension",
        ["resistance_band"],
        "beginner",
        None,
    ),
    (
        "floor_crunch",
        "کرانچ روی زمین",
        "Floor crunch",
        "core",
        "trunk_flexion",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "reverse_crunch",
        "کرانچ معکوس روی زمین",
        "Reverse crunch",
        "core",
        "trunk_flexion",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "bird_dog",
        "برد داگ چهار دست و پا",
        "Bird dog",
        "core",
        "trunk_stability",
        ["bodyweight"],
        "intermediate",
        "trunk_stabilizers",
    ),
    (
        "kneeling_plank",
        "پلانک ساعد روی زانو",
        "Kneeling forearm plank",
        "core",
        "trunk_stability",
        ["bodyweight"],
        "beginner",
        "trunk_stabilizers",
    ),
    (
        "kneeling_side_plank",
        "پلانک بغل روی زانو",
        "Kneeling side plank",
        "core",
        "trunk_stability",
        ["bodyweight"],
        "beginner",
        "obliques",
    ),
    (
        "hollow_hold",
        "هالو هولد روی زمین",
        "Hollow body hold",
        "core",
        "trunk_stability",
        ["bodyweight"],
        "advanced",
        "trunk_stabilizers",
    ),
    (
        "heel_taps",
        "تماس پاشنه با زمین خوابیده",
        "Supine heel taps",
        "core",
        "trunk_stability",
        ["bodyweight"],
        "beginner",
        "trunk_stabilizers",
    ),
    (
        "suitcase_carry",
        "حمل دمبل یک‌طرفه کنار بدن",
        "Suitcase carry",
        "core",
        "carry",
        ["dumbbell"],
        "intermediate",
        "obliques",
    ),
    (
        "band_curl",
        "جلوبازو با کش زیر پا",
        "Standing band curl",
        "biceps",
        "elbow_flexion",
        ["resistance_band"],
        "beginner",
        None,
    ),
    (
        "kb_curl",
        "جلوبازو کتل بل جفت دست",
        "Kettlebell curl",
        "biceps",
        "elbow_flexion",
        ["kettlebell"],
        "beginner",
        None,
    ),
    (
        "db_zottman",
        "جلوبازو زاتمن دمبل",
        "Zottman curl",
        "biceps",
        "elbow_flexion",
        ["dumbbell"],
        "intermediate",
        None,
    ),
    (
        "db_floor_triceps",
        "پشت بازو دمبل خوابیده روی زمین",
        "Dumbbell floor triceps extension",
        "triceps",
        "elbow_extension",
        ["dumbbell"],
        "beginner",
        None,
    ),
    (
        "band_overhead_triceps",
        "پشت بازو کش بالای سر",
        "Band overhead triceps extension",
        "triceps",
        "elbow_extension",
        ["resistance_band"],
        "intermediate",
        None,
    ),
    (
        "wall_triceps",
        "پشت بازو با تکیه دست به دیوار",
        "Wall triceps extension",
        "triceps",
        "elbow_extension",
        ["bodyweight"],
        "beginner",
        None,
    ),
    (
        "bb_wrist_curl",
        "مچ خم هالتر نشسته",
        "Seated barbell wrist curl",
        "forearms",
        "wrist_flexion",
        ["barbell", "bench_flat"],
        "beginner",
        None,
    ),
    (
        "bb_reverse_wrist",
        "مچ معکوس هالتر نشسته",
        "Reverse barbell wrist curl",
        "forearms",
        "wrist_extension",
        ["barbell", "bench_flat"],
        "beginner",
        "wrist_extensors",
    ),
    (
        "band_wrist_curl",
        "مچ خم با کش",
        "Band wrist curl",
        "forearms",
        "wrist_flexion",
        ["resistance_band"],
        "beginner",
        None,
    ),
    (
        "farmer_carry",
        "راه‌رفتن کشاورزی با دمبل",
        "Dumbbell farmer carry",
        "forearms",
        "carry",
        ["dumbbell"],
        "intermediate",
        "grip",
    ),
    (
        "kb_farmer_carry",
        "راه‌رفتن کشاورزی با کتل بل",
        "Kettlebell farmer carry",
        "forearms",
        "carry",
        ["kettlebell"],
        "intermediate",
        "grip",
    ),
    (
        "seated_db_shrug",
        "شراگ دمبل نشسته",
        "Seated dumbbell shrug",
        "traps",
        "scapular_elevation",
        ["dumbbell", "bench_flat"],
        "beginner",
        None,
    ),
    (
        "band_shrug",
        "شراگ با کش زیر پا",
        "Band shrug",
        "traps",
        "scapular_elevation",
        ["resistance_band"],
        "beginner",
        None,
    ),
    (
        "prone_t_traps",
        "جمع‌کردن کتف با دست باز روی زمین",
        "Prone scapular T raise",
        "traps",
        "shoulder_horizontal_abduction",
        ["bodyweight"],
        "beginner",
        "middle_traps",
    ),
    (
        "supported_trap_row",
        "پارویی دمبل آرنج باز سینه تکیه",
        "Chest-supported wide-elbow row",
        "traps",
        "pull_horizontal",
        ["dumbbell", "bench_adjustable"],
        "intermediate",
        "middle_traps",
    ),
]


def movement_payload(row):
    key, name, english, muscle, pattern, equipment, level, region = row
    mechanics, joints, guide = PATTERN_DATA[pattern]
    levels = ["beginner", "intermediate", "advanced"]
    levels = levels[levels.index(level) :]
    region = region or REGIONS[muscle][0]
    secondary = {
        "push_horizontal": ["triceps", "shoulders"],
        "push_vertical": ["triceps"],
        "pull_horizontal": ["biceps", "traps"],
        "pull_vertical": ["biceps"],
        "knee_dominant": ["glutes", "core"],
        "hip_hinge": ["glutes", "core"],
        "hip_extension": ["hamstrings"],
        "elbow_flexion": ["forearms"],
        "carry": ["forearms", "traps", "core"],
    }.get(pattern, [])
    if muscle == "traps" and pattern == "pull_horizontal":
        secondary = ["back", "biceps", "shoulders"]
    return {
        "external_key": f"athlore.base.{key}",
        "name": name,
        "name_en": english,
        "targets": [
            {"muscle_key": muscle, "region_key": region, "role": "primary"},
            *[{"muscle_key": key, "role": "secondary"} for key in secondary if key != muscle],
        ],
        "levels": levels,
        "equipment_keys": equipment,
        "movement_pattern": pattern,
        "mechanics": mechanics,
        "joint_keys": joints,
        "prescription_unit": "seconds" if pattern in {"trunk_stability", "carry"} else "reps",
        "source_document": PACK_VERSION + "; " + REFERENCES[0],
        "execution_guide": {
            "execution": guide,
            "tips": "بار و دامنه را طبق نظر مربی انتخاب کن؛ کیفیت اجرا بر تعداد تکرار مقدم است.",
            "mistakes": "افزایش بار با افت فرم؛ حبس نفس؛ ادامهٔ حرکت با درد.",
        },
    }


def normalize_name(value):
    return re.sub(r"[\s‌ـ]+", "", str(value).replace("ي", "ی").replace("ك", "ک")).casefold()


def ensure_taxonomy():
    for key, name in MUSCLE_NAMES.items():
        muscle, _ = MuscleTaxonomy.objects.get_or_create(key=key, defaults={"name": name})
        for region_key, region_name in [REGIONS[key], *EXTRA_REGIONS.get(key, [])]:
            MuscleRegion.objects.get_or_create(
                muscle=muscle, key=region_key, defaults={"name": region_name}
            )
    for key, name in EQUIPMENT.items():
        EquipmentTaxonomy.objects.get_or_create(key=key, defaults={"name": name})


@transaction.atomic
def expand_catalog(coach, *, apply=False):
    if apply:
        type(coach).objects.select_for_update().get(pk=coach.pk)
        ensure_taxonomy()
    # Include archived names and aliases: a deleted/prohibited coach choice is not resurrected.
    existing = list(Exercise.objects.filter(coach=coach).prefetch_related("aliases"))
    names = {
        normalize_name(value)
        for ex in existing
        for value in [ex.name, ex.name_en, *[alias.alias for alias in ex.aliases.all()]]
        if value
    }
    keys = {ex.external_key for ex in existing if ex.external_key}
    report = {
        "coach_id": str(coach.pk),
        "pack": PACK_VERSION,
        "created": [],
        "skipped": [],
        "by_muscle": {},
    }
    counts = Counter()
    for row in MOVEMENTS:
        payload = movement_payload(row)
        if payload["external_key"] in keys or any(
            normalize_name(payload[field]) in names for field in ("name", "name_en")
        ):
            report["skipped"].append(payload["name"])
            continue
        if apply:
            create_exercise(coach, payload)
        report["created"].append(payload["name"])
        counts[row[3]] += 1
        names.update([normalize_name(payload["name"]), normalize_name(payload["name_en"])])
        keys.add(payload["external_key"])
    report["by_muscle"] = dict(counts)
    return report


def new_systems():
    def recipe(target, steps, grouping=None):
        value = {"version": 1, "target": target, "steps": steps}
        if grouping:
            value["grouping"] = grouping
        return value

    return [
        {
            "key": "straight_sets",
            "name": "ست معمولی",
            "description": "تکرار چند ست با محدودهٔ تکرار و استراحت یکسان؛ الگوی پایه و قابل تنظیم.",
            "execution_method": "ست‌ها را با فرم ثابت اجرا کن و بین آن‌ها استراحت تعیین‌شده را رعایت کن.",
            "recipe": recipe(
                "all", [{"op": "prescribe", "reps": "8-12", "rest_seconds": 90, "rpe": "RIR 2"}]
            ),
        },
        {
            "key": "strength_5x5",
            "name": "قدرتی ۵×۵",
            "description": "پنج ست پنج‌تکراری برای اولین حرکت اصلی مناسب جلسه؛ بار و کاربرد را مربی تعیین می‌کند.",
            "execution_method": "پس از گرم‌کردن اختصاصی، پنج ست پنج‌تکراری با فرم ثابت و استراحت کامل اجرا کن؛ بار ۱RM حدس زده نمی‌شود.",
            "recipe": recipe(
                "first_compound",
                [{"op": "prescribe", "sets": 5, "reps": "5", "rest_seconds": 180, "rpe": "RIR 2"}],
            ),
        },
        {
            "key": "circuit_training",
            "name": "تمرین دایره‌ای",
            "description": "نمونهٔ آغازین: سه حرکت با عضلات اصلی متفاوت در یک دور، با استراحت مشخص بین حرکت‌ها و دورها.",
            "execution_method": "حرکت‌های هر دور را به‌ترتیب اجرا کن؛ تعداد دور و استراحت را طبق برنامه رعایت کن.",
            "recipe": recipe(
                "all",
                [
                    {
                        "op": "instruction",
                        "title": "دور تمرینی",
                        "text": "پس از آخرین حرکت هر دور استراحت کن؛ تعداد ست‌های هر حرکت در برنامه مشخص است.",
                    }
                ],
                {
                    "size": 3,
                    "mode": "alternating",
                    "allow_compound": True,
                    "max_groups_per_session": 1,
                    "rest_between_seconds": 20,
                    "rest_after_seconds": 120,
                },
            ),
        },
        {
            "key": "eccentric_emphasis",
            "name": "منفی کنترل‌شده",
            "description": "بخش پایین‌رفتن بار چهار ثانیه‌ای؛ بدون بار اجباری یا منفیِ فوق‌بیشینه.",
            "execution_method": "چهار ثانیه بخش منفی و یک ثانیه بخش مثبت؛ از بار سبک‌تر و قابل‌کنترل استفاده کن.",
            "recipe": recipe(
                "last_isolation",
                [
                    {"op": "prescribe", "reps": "8-10", "rpe": "RIR 3"},
                    {"op": "tempo", "pattern": "4-0-1-0"},
                ],
            ),
        },
        {
            "key": "paused_reps",
            "name": "تکرار مکث‌دار",
            "description": "تکرار کنترل‌شده با مکث دو ثانیه‌ای پس از بخش منفی؛ نقطه و دامنه را مربی بررسی می‌کند.",
            "execution_method": "دو ثانیه پایین برو، در نقطهٔ تعیین‌شده دو ثانیه مکث کن و یک ثانیه بخش مثبت را اجرا کن؛ مفصل را با درد در انتهای دامنه نگه ندار.",
            "recipe": recipe(
                "first_compound",
                [
                    {"op": "prescribe", "reps": "6-8", "rpe": "RIR 3"},
                    {"op": "tempo", "pattern": "2-2-1-0"},
                ],
            ),
        },
    ]


def seed_systems():
    from accounts.training_recipes import validate_training_recipe

    created = []
    for index, row in enumerate(new_systems()):
        data = {
            **row,
            "recipe": validate_training_recipe(row["recipe"], allow_empty=False),
            "handler_key": "recipe",
            "is_active": True,
            "sort_order": 240 + index * 10,
        }
        key = data.pop("key")
        system, added = TrainingTechnique.objects.get_or_create(key=key, defaults=data)
        # Only complete our explicitly deferred live-Stage import. Never re-enable
        # a system that the coach disabled or edited independently.
        if (
            not added
            and system.parameter_schema == {"pending_stage_release": PACK_VERSION}
            and not system.is_active
            and all(
                getattr(system, field) == data[field]
                for field in ("recipe", "name", "description", "execution_method")
            )
        ):
            system.is_active = True
            system.parameter_schema = {}
            system.save(update_fields=["is_active", "parameter_schema"])
        if added:
            created.append(key)
    return created
