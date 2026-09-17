"""Coach visit form fixtures — data only, no engine branches.

Arman's detailed form is one coach fixture (arman_visit_v1), not a platform default.
semantic_key values are the only fields the generator may interpret.
Custom / free-text fields without a recognized semantic_key are coach context only.
"""

from __future__ import annotations

from typing import Any


def _opt(value: str, label: str | None = None) -> dict[str, str]:
    return {"value": value, "label": label or value}


def _field(
    key: str,
    label: str,
    *,
    field_type: str = "text",
    semantic_key: str = "",
    options: list[dict[str, str]] | None = None,
    required: bool = False,
    enabled: bool = True,
    order: int = 0,
    help_text: str = "",
    prefill_from: str = "",
    student_visible: bool = False,
    student_editable: bool = False,
    coach_editable: bool = True,
    student_visible_when_finalized: bool | None = None,
) -> dict[str, Any]:
    if student_editable:
        student_visible = True
    if student_visible_when_finalized is None:
        student_visible_when_finalized = student_visible
    return {
        "key": key,
        "semantic_key": semantic_key,
        "label": label,
        "type": field_type,
        "options": options or [],
        "required": required,
        "enabled": enabled,
        "order": order,
        "help_text": help_text,
        "prefill_from": prefill_from,
        "student_visible": student_visible,
        "student_visible_when_finalized": student_visible_when_finalized,
        "student_editable": student_editable,
        "coach_editable": coach_editable,
    }


def _section(key: str, label: str, order: int, fields: list[dict[str, Any]]) -> dict[str, Any]:
    return {"key": key, "label": label, "order": order, "fields": fields}


MUSCLE_GROUP_OPTIONS = [
    _opt("shoulders", "شانه / Shoulders"),
    _opt("triceps", "پشت بازو / Triceps"),
    _opt("calves", "ساق / Calves"),
    _opt("chest", "سینه / Chest"),
    _opt("quadriceps", "چهارسر / Quadriceps"),
    _opt("forearms", "ساعد / Forearms"),
    _opt("back", "پشت / Back / Lats"),
    _opt("hamstrings", "همسترینگ / Hamstrings"),
    _opt("abs", "شکم / Abs"),
    _opt("biceps", "جلو بازو / Biceps"),
    _opt("glutes", "باسن / Glutes"),
]

DETAIL_STATUS_OPTIONS = [
    _opt("weak", "ضعیف"),
    _opt("average", "متوسط"),
    _opt("strong", "قوی"),
    _opt("asymmetry", "عدم تقارن"),
]

POSTURE_OPTIONS = [
    _opt("forward_head", "سر به جلو"),
    _opt("rounded_shoulders", "شانه‌های گرد"),
    _opt("dropped_shoulders", "افتادگی شانه"),
    _opt("upper_cross", "الگوی Upper-cross"),
    _opt("scoliosis", "اسکولیوز (مشاهده مربی)"),
    _opt("lordosis", "لوردوز"),
    _opt("kyphosis", "کیفوز / قوز پشت"),
    _opt("flat_back", "پشت صاف"),
    _opt("sway_back", "Sway-back"),
    _opt("winged_scapula", "کتف بال‌دار"),
    _opt("genu_valgum", "زانوی ضربدری (genu valgum)"),
    _opt("genu_varum", "زانوی پرانتزی (genu varum)"),
    _opt("flat_feet", "کف پای صاف"),
    _opt("high_arch", "قوس پای بلند"),
    _opt("knee_hyperextension", "هایپراکستنشن زانو"),
    _opt("neck_tilt_right", "کج‌گردنی به راست"),
    _opt("neck_tilt_left", "کج‌گردنی به چپ"),
    _opt("uneven_shoulder_right_dropped", "شانه راست افتاده"),
    _opt("uneven_shoulder_left_dropped", "شانه چپ افتاده"),
]

TRAINING_METHOD_OPTIONS = [
    _opt("superset", "سوپرست"),
    _opt("drop_set", "دراپ ست"),
    _opt("tri_set", "تری‌ست"),
    _opt("giant_set", "جاینت ست"),
    _opt("hundred_rep", "روش ۱۰۰ تکرار"),
    _opt("hit", "HIT"),
    _opt("gvt", "German Volume Training"),
    _opt("final_pump", "پمپ نهایی"),
]

GOAL_OPTIONS = [
    _opt("gain_weight", "افزایش وزن"),
    _opt("lose_weight", "کاهش وزن"),
    _opt("maintain_weight", "حفظ وزن"),
    _opt("hypertrophy", "هایپرتروفی / حجم عضله"),
]

LEVEL_OPTIONS = [
    _opt("beginner", "مبتدی"),
    _opt("intermediate", "متوسط"),
    _opt("semi_professional", "نیمه‌حرفه‌ای"),
    _opt("professional", "حرفه‌ای"),
]


def _muscle_detail_fields(prefix: str, labels: list[tuple[str, str]], start_order: int) -> list[dict]:
    fields = []
    for i, (sub_key, label) in enumerate(labels):
        fields.append(
            _field(
                f"muscle_detail.{prefix}.{sub_key}",
                label,
                field_type="single_select",
                semantic_key="muscle_detail",
                options=DETAIL_STATUS_OPTIONS,
                order=start_order + i,
                help_text=f"زیرناحیه {prefix}.{sub_key}",
            )
        )
    return fields


ARMAN_VISIT_FORM_TEMPLATE: dict[str, Any] = {
    "key": "arman_visit_v1",
    "name": "فرم ویزیت کامل آرمان",
    "version": 1,
    "description": (
        "فرم ویزیت دوره‌ای آرمان — داده/پیکربندی مربی. "
        "مشاهدات اسکلتی تشخیص پزشکی نیستند."
    ),
    "is_active": True,
    "is_default": True,
    "sections": [
        _section(
            "general",
            "ارزیابی عمومی",
            0,
            [
                _field(
                    "assessment_date",
                    "تاریخ ارزیابی",
                    field_type="date",
                    semantic_key="assessment_date",
                    order=0,
                ),
                _field(
                    "full_name",
                    "نام و نام خانوادگی",
                    semantic_key="",
                    order=1,
                    prefill_from="student.full_name",
                ),
                _field(
                    "phone",
                    "شماره تماس",
                    semantic_key="",
                    order=2,
                    prefill_from="student.phone_number",
                ),
                _field(
                    "height_cm",
                    "قد (سانتی‌متر)",
                    field_type="number",
                    semantic_key="",
                    order=3,
                    prefill_from="student.height_cm",
                ),
                _field(
                    "age",
                    "سن",
                    field_type="number",
                    semantic_key="",
                    order=4,
                    prefill_from="student.age",
                ),
                _field(
                    "weight_kg",
                    "وزن (کیلوگرم)",
                    field_type="number",
                    semantic_key="",
                    order=5,
                    prefill_from="student.weight_kg",
                ),
                _field(
                    "has_nutrition_plan",
                    "برنامه تغذیه دارد؟",
                    field_type="boolean",
                    semantic_key="nutrition_plan",
                    order=6,
                ),
                _field(
                    "sessions_per_week",
                    "تعداد جلسات تمرین در هفته",
                    field_type="number",
                    semantic_key="sessions_per_week",
                    order=7,
                    prefill_from="student.training_conditions.training_days_per_week",
                ),
                _field(
                    "calorie_target",
                    "کالری هدف / مورد نیاز",
                    field_type="number",
                    semantic_key="calorie_target",
                    order=8,
                    help_text="فقط مرجع مربی؛ مگر منطق تغذیه صریحاً پشتیبانی کند.",
                ),
                _field(
                    "current_supplements",
                    "مکمل‌های فعلی",
                    field_type="textarea",
                    semantic_key="supplements",
                    order=9,
                ),
                _field(
                    "current_medications",
                    "داروهای فعلی",
                    field_type="textarea",
                    semantic_key="medications",
                    order=10,
                    help_text="مرجع مربی — اجرا توسط ژنراتور نمی‌شود.",
                ),
                _field(
                    "free_text_plan",
                    "برنامه آزاد / توضیحات دوره",
                    field_type="textarea",
                    semantic_key="",
                    order=11,
                ),
                _field(
                    "coach_notes_general",
                    "یادداشت مربی",
                    field_type="textarea",
                    semantic_key="",
                    order=12,
                ),
            ],
        ),
        _section(
            "goal",
            "هدف",
            1,
            [
                _field(
                    "goal",
                    "هدف اصلی دوره",
                    field_type="single_select",
                    semantic_key="goal",
                    options=GOAL_OPTIONS,
                    order=0,
                ),
            ],
        ),
        _section(
            "level",
            "سطح برنامه / ورزشکار",
            2,
            [
                _field(
                    "training_level",
                    "سطح",
                    field_type="single_select",
                    semantic_key="training_level",
                    options=LEVEL_OPTIONS,
                    order=0,
                    prefill_from="student.training_background.level",
                ),
            ],
        ),
        _section(
            "weak_points",
            "نقاط ضعف کلی",
            3,
            [
                _field(
                    "weak_muscles",
                    "گروه‌های عضلانی ضعیف",
                    field_type="multi_select",
                    semantic_key="weak_muscles",
                    options=MUSCLE_GROUP_OPTIONS,
                    order=0,
                ),
            ],
        ),
        _section(
            "muscle_detail_shoulders",
            "جزئیات شانه",
            4,
            _muscle_detail_fields(
                "shoulders",
                [
                    ("anterior", "شانه قدامی"),
                    ("lateral", "شانه جانبی"),
                    ("posterior", "شانه خلفی"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_chest",
            "جزئیات سینه",
            5,
            _muscle_detail_fields(
                "chest",
                [
                    ("upper", "بالاسینه"),
                    ("inner", "داخل سینه"),
                    ("outer", "خارج سینه"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_triceps",
            "جزئیات پشت بازو",
            6,
            _muscle_detail_fields(
                "triceps",
                [
                    ("medial", "سر داخلی / medial"),
                    ("lateral", "سر خارجی / lateral"),
                    ("symmetry", "تقارن"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_back",
            "جزئیات پشت / لت / کمر",
            7,
            _muscle_detail_fields(
                "back",
                [
                    ("height", "ارتفاع"),
                    ("width", "عرض"),
                    ("thickness", "ضخامت"),
                    ("asymmetry", "عدم تقارن"),
                    ("lower_back", "کمر / Erector"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_traps",
            "جزئیات تراپزیوس",
            8,
            _muscle_detail_fields(
                "traps",
                [
                    ("upper", "فوقانی"),
                    ("middle", "میانی"),
                    ("lower", "تحتانی"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_hamstrings",
            "جزئیات همسترینگ",
            9,
            _muscle_detail_fields(
                "hamstrings",
                [
                    ("upper", "فوقانی"),
                    ("lower", "تحتانی"),
                    ("medial", "داخلی"),
                    ("lateral", "خارجی"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_quads",
            "جزئیات چهارسر",
            10,
            _muscle_detail_fields(
                "quadriceps",
                [
                    ("upper", "فوقانی"),
                    ("lower", "تحتانی"),
                    ("inner", "داخلی"),
                    ("outer", "خارجی"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_abs",
            "جزئیات شکم / Core",
            11,
            _muscle_detail_fields(
                "abs",
                [
                    ("upper", "فوقانی"),
                    ("lower", "تحتانی"),
                    ("oblique", "مایل / پهلو"),
                    ("serratus", "سراتوس"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_glutes",
            "جزئیات باسن",
            12,
            _muscle_detail_fields(
                "glutes",
                [
                    ("upper", "فوقانی"),
                    ("lower", "تحتانی"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_calves",
            "جزئیات ساق",
            13,
            _muscle_detail_fields(
                "calves",
                [
                    ("gastrocnemius", "ساق اصلی"),
                    ("soleus", "سولئوس"),
                    ("tibialis", "تیبیالیس"),
                ],
                0,
            ),
        ),
        _section(
            "muscle_detail_arms",
            "جزئیات جلوبازو / ساعد",
            14,
            _muscle_detail_fields(
                "biceps",
                [
                    ("peak", "پیک"),
                    ("thickness", "ضخامت"),
                    ("symmetry", "تقارن"),
                ],
                0,
            )
            + _muscle_detail_fields(
                "forearms",
                [
                    ("flexors", "فلکسورها"),
                    ("extensors", "اکستنسورها"),
                ],
                10,
            ),
        ),
        _section(
            "posture",
            "مشاهدات وضعیتی / اسکلتی",
            15,
            [
                _field(
                    "posture",
                    "مشاهدات وضعیتی (غیرتشخیصی)",
                    field_type="multi_select",
                    semantic_key="posture",
                    options=POSTURE_OPTIONS,
                    order=0,
                    help_text="مشاهده مربی است؛ تشخیص پزشکی نیست.",
                ),
            ],
        ),
        _section(
            "injuries",
            "آسیب‌ها و محدودیت‌ها",
            16,
            [
                _field(
                    "injuries",
                    "آسیب / محدودیت فعال",
                    field_type="multi_select",
                    semantic_key="injuries",
                    options=[
                        _opt("neck", "گردن"),
                        _opt("back", "کمر"),
                        _opt("knee", "زانو"),
                        _opt("shoulder", "شانه"),
                        _opt("other", "سایر"),
                    ],
                    order=0,
                ),
                _field(
                    "injury_notes",
                    "توضیح آسیب / محدودیت",
                    field_type="textarea",
                    semantic_key="",
                    order=1,
                ),
            ],
        ),
        _section(
            "training_methods",
            "روش‌های تمرینی",
            17,
            [
                _field(
                    "training_methods",
                    "روش‌های مورد نظر دوره",
                    field_type="multi_select",
                    semantic_key="training_methods",
                    options=TRAINING_METHOD_OPTIONS,
                    order=0,
                    help_text="پیکربندی مربی؛ به‌صورت پیش‌فرض در همه برنامه‌ها hardcode نمی‌شود.",
                ),
            ],
        ),
        _section(
            "weekly_split",
            "اسپلیت هفتگی",
            18,
            [
                _field(
                    "split_saturday",
                    "شنبه",
                    field_type="text",
                    semantic_key="weekly_split",
                    order=0,
                ),
                _field(
                    "split_sunday",
                    "یکشنبه",
                    field_type="text",
                    semantic_key="weekly_split",
                    order=1,
                ),
                _field(
                    "split_monday",
                    "دوشنبه",
                    field_type="text",
                    semantic_key="weekly_split",
                    order=2,
                ),
                _field(
                    "split_tuesday",
                    "سه‌شنبه",
                    field_type="text",
                    semantic_key="weekly_split",
                    order=3,
                ),
                _field(
                    "split_wednesday",
                    "چهارشنبه",
                    field_type="text",
                    semantic_key="weekly_split",
                    order=4,
                ),
                _field(
                    "split_thursday",
                    "پنجشنبه",
                    field_type="text",
                    semantic_key="weekly_split",
                    order=5,
                ),
            ],
        ),
        _section(
            "notes",
            "یادداشت‌های تکمیلی",
            19,
            [
                _field(
                    "additional_notes",
                    "یادداشت‌های ارزیابی ورزشکار",
                    field_type="textarea",
                    semantic_key="",
                    order=0,
                    help_text=(
                        "محدودیت زمان، محدودیت حرکت، آزمایش خون، مشاهدات آزاد — "
                        "متن آزاد به‌صورت خودکار اجرا نمی‌شود."
                    ),
                ),
            ],
        ),
    ],
}


# Compact example for coaches who want a minimal visit form (not a global default).
MINIMAL_VISIT_FORM_TEMPLATE: dict[str, Any] = {
    "key": "minimal_v1",
    "name": "فرم ویزیت ساده",
    "version": 1,
    "description": "حداقلی: هدف، سطح، آسیب، عضله ضعیف، روز تمرین.",
    "is_active": True,
    "is_default": True,
    "sections": [
        _section(
            "core",
            "ویزیت پایه",
            0,
            [
                _field(
                    "goal",
                    "هدف",
                    field_type="single_select",
                    semantic_key="goal",
                    options=GOAL_OPTIONS,
                    order=0,
                    student_visible=True,
                    student_editable=True,
                ),
                _field(
                    "training_level",
                    "سطح",
                    field_type="single_select",
                    semantic_key="training_level",
                    options=LEVEL_OPTIONS[:2],
                    order=1,
                    student_visible=True,
                    student_editable=True,
                ),
                _field(
                    "injuries",
                    "آسیب",
                    field_type="multi_select",
                    semantic_key="injuries",
                    options=[
                        _opt("neck", "گردن"),
                        _opt("back", "کمر"),
                        _opt("knee", "زانو"),
                    ],
                    order=2,
                    student_visible=True,
                    student_editable=True,
                ),
                _field(
                    "weak_muscles",
                    "عضلات ضعیف",
                    field_type="multi_select",
                    semantic_key="weak_muscles",
                    options=MUSCLE_GROUP_OPTIONS,
                    order=3,
                    student_visible=True,
                    student_editable=True,
                ),
                _field(
                    "sessions_per_week",
                    "روزهای تمرین",
                    field_type="number",
                    semantic_key="sessions_per_week",
                    order=4,
                    student_visible=True,
                    student_editable=True,
                ),
            ],
        ),
    ],
}


# Student self-report keys on Arman's detailed form (coach-only elsewhere by default).
_ARMAN_STUDENT_EDITABLE_KEYS = frozenset(
    {
        "weight_kg",
        "has_nutrition_plan",
        "sessions_per_week",
        "current_supplements",
        "current_medications",
        "goal",
        "training_level",
        "injuries",
        "injury_notes",
        "training_methods",
        "weekly_split_saturday",
        "weekly_split_sunday",
        "weekly_split_monday",
        "weekly_split_tuesday",
        "weekly_split_wednesday",
        "weekly_split_thursday",
        "student_notes",
        "additional_notes",
    }
)
_ARMAN_STUDENT_VISIBLE_READONLY = frozenset(
    {
        "assessment_date",
        "full_name",
        "phone",
        "height_cm",
        "age",
    }
)


def _apply_arman_visibility(template: dict[str, Any]) -> dict[str, Any]:
    for section in template.get("sections") or []:
        for field in section.get("fields") or []:
            key = str(field.get("key") or "")
            if key in _ARMAN_STUDENT_EDITABLE_KEYS or key.startswith("weekly_split"):
                field["student_visible"] = True
                field["student_editable"] = True
            elif key in _ARMAN_STUDENT_VISIBLE_READONLY:
                field["student_visible"] = True
                field["student_editable"] = False
            else:
                # Muscle detail, posture, coach notes — coach-only by default.
                field.setdefault("student_visible", False)
                field.setdefault("student_editable", False)
            field.setdefault("coach_editable", True)
            # Same visibility carries through to the finalized (locked) visit view.
            field["student_visible_when_finalized"] = field["student_visible"]
    return template


_apply_arman_visibility(ARMAN_VISIT_FORM_TEMPLATE)


# Classic 4-day hypertrophy calibration stored as coach style_profile data.
ARMAN_STYLE_PROFILE: dict[str, Any] = {
    "day_targets": {
        "سینه|پشت بازو": {
            "total_exercises": [5, 6],
            "per_muscle": {"سینه": [3, 4], "پشت بازو": [2, 2]},
            "supersets": 1,
        },
        "زیربغل|جلو بازو": {
            "total_exercises": [5, 6],
            "per_muscle": {"زیربغل": [3, 4], "جلو بازو": [2, 3]},
            "supersets": 1,
        },
        "پا": {
            "total_exercises": [4, 5],
            "per_muscle": {"پا": [4, 5]},
            "supersets": 0,
        },
        "سرشانه|شکم": {
            "total_exercises": [5, 6],
            "per_muscle": {"سرشانه": [3, 3], "شکم": [2, 2]},
            "supersets": 0,
        },
    },
    "session_sets": {"کم": 14, "متوسط": 18, "زیاد": 22},
    "sets_per_class": {
        "compound": 3,
        "accessory": 3,
        "isolation": 3,
        "core": 3,
    },
    "rx_by_class": {
        "compound": [["۸", 4], ["۱۰", 3], ["۸-۱۰", 4], ["۱۰", 4]],
        "accessory": [["۱۲-۱۰", 4], ["۱۰", 3], ["۱۲", 3], ["۱۵-۱۰-۸-۱۵", 4]],
        "isolation": [["۱۲", 3], ["۱۲-۱۰", 4], ["۱۵", 3], ["۱۲+۱۲", 3]],
        "core": [["۱۵-۲۰", 3], ["۲۰", 3], ["۳۰ ثانیه", 3], ["۴۵ ثانیه", 3]],
    },
    "rest_buckets": [60, 75, 90, 120],
    "max_supersets_per_day": 1,
    "source": "coach_style_profile",
}
