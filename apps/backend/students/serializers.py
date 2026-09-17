from rest_framework import serializers

from students.models import Student, Visit
from students.services import PRIMARY_GOALS, TRAINING_LEVELS


class SummarySerializer(serializers.Serializer):
    current_program_title = serializers.CharField(required=False, allow_blank=True, default="")
    last_visit_date = serializers.DateField(required=False, allow_null=True, default=None)
    medical_note = serializers.CharField(required=False, allow_blank=True, default="")


class GoalsSerializer(serializers.Serializer):
    primary_goal = serializers.ChoiceField(choices=sorted(PRIMARY_GOALS), required=False)
    secondary_goal = serializers.CharField(required=False, allow_blank=True, default="")
    muscle_priorities = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    weak_muscles = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    strong_muscles = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class TrainingBackgroundSerializer(serializers.Serializer):
    level = serializers.ChoiceField(choices=sorted(TRAINING_LEVELS), required=False)
    training_experience = serializers.CharField(required=False, allow_blank=True, default="")
    basic_movement_familiarity = serializers.CharField(required=False, allow_blank=True, default="")
    has_free_weight_experience = serializers.BooleanField(required=False, default=False)


class StudentSerializer(serializers.ModelSerializer):
    summary = SummarySerializer(required=False)
    goals = GoalsSerializer(required=False)
    injuries = serializers.DictField(required=False)
    equipment = serializers.DictField(required=False)
    lifestyle = serializers.DictField(required=False)
    preferences = serializers.DictField(required=False)
    training_background = TrainingBackgroundSerializer(required=False)
    training_conditions = serializers.DictField(required=False)
    food_allergies = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    food_intolerances = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    dietary_restrictions = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    dietary_preferences = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    supplement_restrictions = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    relevant_medical_notes = serializers.CharField(required=False, allow_blank=True, default="")
    nutrition_notes = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = Student
        fields = (
            "id",
            "full_name",
            "age",
            "gender",
            "height_cm",
            "weight_kg",
            "phone_number",
            "status",
            "coach_notes",
            "goals",
            "injuries",
            "equipment",
            "lifestyle",
            "preferences",
            "training_background",
            "training_conditions",
            "food_allergies",
            "food_intolerances",
            "dietary_restrictions",
            "dietary_preferences",
            "supplement_restrictions",
            "relevant_medical_notes",
            "nutrition_notes",
            "summary",
            "created_at",
            "updated_at",
            "archived_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "archived_at")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["summary"] = {
            "current_program_title": instance.summary_current_program_title,
            "last_visit_date": (
                instance.summary_last_visit_date.isoformat()
                if instance.summary_last_visit_date
                else None
            ),
            "medical_note": instance.summary_medical_note,
        }
        data["goals"] = instance.goals or {}
        data["injuries"] = instance.injuries or {}
        data["equipment"] = instance.equipment or {}
        data["lifestyle"] = instance.lifestyle or {}
        data["preferences"] = instance.preferences or {}
        data["training_background"] = instance.training_background or {}
        data["training_conditions"] = instance.training_conditions or {}
        data["food_allergies"] = instance.food_allergies or []
        data["food_intolerances"] = instance.food_intolerances or []
        data["dietary_restrictions"] = instance.dietary_restrictions or []
        data["dietary_preferences"] = instance.dietary_preferences or []
        data["supplement_restrictions"] = instance.supplement_restrictions or []
        data["relevant_medical_notes"] = instance.relevant_medical_notes or ""
        data["nutrition_notes"] = instance.nutrition_notes or ""
        from students.services import serialize_portal_access

        data["portal_access"] = serialize_portal_access(instance)
        return data


class StudentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = (
            "id",
            "full_name",
            "status",
            "age",
            "gender",
            "goals",
            "training_background",
            "summary",
            "updated_at",
        )

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "full_name": instance.full_name,
            "status": instance.status,
            "age": instance.age,
            "gender": instance.gender,
            "goals": instance.goals or {},
            "training_background": instance.training_background or {},
            "summary": {
                "current_program_title": instance.summary_current_program_title,
                "last_visit_date": (
                    instance.summary_last_visit_date.isoformat()
                    if instance.summary_last_visit_date
                    else None
                ),
                "medical_note": instance.summary_medical_note,
            },
            "updated_at": instance.updated_at,
        }


class MeasurementsSerializer(serializers.Serializer):
    waist_cm = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    chest_cm = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    arm_cm = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    thigh_cm = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    hip_cm = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )


class AdherenceSerializer(serializers.Serializer):
    overall_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0
    )
    training_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0
    )
    nutrition_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0
    )
    supplements_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0
    )


class VisitSerializer(serializers.ModelSerializer):
    measurements = serializers.SerializerMethodField()
    adherence = serializers.SerializerMethodField()
    student_id = serializers.UUIDField(read_only=True)
    form_template_id = serializers.SerializerMethodField()
    form_template_name = serializers.SerializerMethodField()
    form_template_key = serializers.CharField(read_only=True)
    form_template_version = serializers.IntegerField(read_only=True)
    form_template_snapshot = serializers.JSONField(read_only=True)
    answers = serializers.JSONField(read_only=True)
    answer_sources = serializers.JSONField(read_only=True)
    status = serializers.CharField(read_only=True)
    coach_private_notes = serializers.CharField(read_only=True)
    sent_at = serializers.DateTimeField(read_only=True, allow_null=True)
    expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
    submitted_by_student_at = serializers.DateTimeField(read_only=True, allow_null=True)
    finalized_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = Visit
        fields = (
            "id",
            "student_id",
            "visit_date",
            "current_weight_kg",
            "previous_weight_kg",
            "body_fat_percentage",
            "measurements",
            "adherence",
            "daily_energy_level",
            "sleep_quality",
            "stress_level",
            "body_feeling",
            "student_feedback",
            "coach_assessment",
            "coach_notes",
            "coach_private_notes",
            "has_new_injury",
            "new_injury_notes",
            "next_cycle_goal",
            "training_condition_changes",
            "form_template_id",
            "form_template_key",
            "form_template_name",
            "form_template_version",
            "form_template_snapshot",
            "answers",
            "answer_sources",
            "status",
            "sent_at",
            "expires_at",
            "submitted_by_student_at",
            "finalized_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "student_id", "created_at", "updated_at")

    def get_measurements(self, obj: Visit) -> dict:
        return {
            "waist_cm": obj.waist_cm,
            "chest_cm": obj.chest_cm,
            "arm_cm": obj.arm_cm,
            "thigh_cm": obj.thigh_cm,
            "hip_cm": obj.hip_cm,
        }

    def get_adherence(self, obj: Visit) -> dict:
        return {
            "overall_percent": obj.adherence_overall,
            "training_percent": obj.adherence_training,
            "nutrition_percent": obj.adherence_nutrition,
            "supplements_percent": obj.adherence_supplements,
        }

    def get_form_template_id(self, obj: Visit):
        return str(obj.form_template_id) if obj.form_template_id else None

    def get_form_template_name(self, obj: Visit) -> str:
        snap = obj.form_template_snapshot or {}
        return str(snap.get("name") or obj.form_template_key or "")


class VisitWriteSerializer(serializers.Serializer):
    visit_date = serializers.DateField(required=True)
    current_weight_kg = serializers.DecimalField(max_digits=5, decimal_places=1, required=True)
    previous_weight_kg = serializers.DecimalField(max_digits=5, decimal_places=1, required=True)
    body_fat_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    measurements = MeasurementsSerializer(required=False)
    adherence = AdherenceSerializer(required=False)
    daily_energy_level = serializers.ChoiceField(choices=Visit.Level.choices, required=True)
    sleep_quality = serializers.ChoiceField(choices=Visit.Level.choices, required=True)
    stress_level = serializers.ChoiceField(choices=Visit.Level.choices, required=True)
    body_feeling = serializers.CharField(required=False, allow_blank=True, default="")
    student_feedback = serializers.CharField(required=False, allow_blank=True, default="")
    coach_assessment = serializers.CharField(required=False, allow_blank=True, default="")
    coach_notes = serializers.CharField(required=False, allow_blank=True, default="")
    coach_private_notes = serializers.CharField(required=False, allow_blank=True, default="")
    has_new_injury = serializers.BooleanField(required=False, default=False)
    new_injury_notes = serializers.CharField(required=False, allow_blank=True, default="")
    next_cycle_goal = serializers.CharField(required=False, allow_blank=True, default="")
    training_condition_changes = serializers.CharField(required=False, allow_blank=True, default="")
    form_template_id = serializers.UUIDField(required=False, allow_null=True)
    answers = serializers.DictField(required=False)
    skip_form_template = serializers.BooleanField(required=False, default=False)

    def __init__(self, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        super().__init__(*args, **kwargs)
        if partial:
            for field in self.fields.values():
                field.required = False


class SendToStudentSerializer(serializers.Serializer):
    expires_in_days = serializers.IntegerField(
        required=False, default=30, min_value=1, max_value=365
    )


class ActivateLoginSerializer(serializers.Serializer):
    rotate_password = serializers.BooleanField(required=False, default=True)
    initial_password = serializers.CharField(
        write_only=True, trim_whitespace=False, min_length=4, max_length=128
    )
    username = serializers.CharField(required=False, allow_blank=True, max_length=150)


class SetPortalInitialPasswordSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    initial_password = serializers.CharField(
        write_only=True, trim_whitespace=False, min_length=4, max_length=128
    )


class SetPortalUsernameSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)


class ResetPortalPasswordSerializer(serializers.Serializer):
    initial_password = serializers.CharField(
        write_only=True, trim_whitespace=False, min_length=4, max_length=128
    )


class StudentPortalCompleteSetupSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(
        write_only=True, trim_whitespace=False, required=False, allow_blank=True
    )


class StudentPortalLoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class StudentAnswersUpdateSerializer(serializers.Serializer):
    answers = serializers.DictField(required=True)
