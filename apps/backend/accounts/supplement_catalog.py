"""Validated catalog CRUD, safe proposals and coach-approved prescription snapshots."""

from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from accounts.supplement_models import SupplementCatalogEntry, SupplementDose, SupplementGoal


class DoseSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=9, decimal_places=3, min_value=Decimal("0.001"))
    unit = serializers.ChoiceField(choices=SupplementDose.Unit.choices)
    timing = serializers.ChoiceField(choices=SupplementDose.Timing.choices)
    custom_time = serializers.CharField(max_length=120, allow_blank=True, default="")
    days = serializers.ChoiceField(choices=SupplementDose.Days.choices, default="all")

    def validate(self, attrs):
        if attrs["timing"] == "custom" and not attrs["custom_time"].strip():
            raise ValidationError({"custom_time": "زمان دلخواه را مشخص کنید."})
        return attrs


class EntrySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    name_en = serializers.CharField(max_length=200, allow_blank=True, default="")
    aliases = serializers.ListField(
        child=serializers.CharField(max_length=200), default=list, max_length=30
    )
    category = serializers.CharField(max_length=120)
    goal_ids = serializers.ListField(child=serializers.UUIDField(), default=list, max_length=30)
    reason = serializers.CharField(allow_blank=True, default="", max_length=4000)
    instructions = serializers.CharField(allow_blank=True, default="", max_length=4000)
    warnings = serializers.CharField(allow_blank=True, default="", max_length=4000)
    replacement_group = serializers.CharField(max_length=120, allow_blank=True, default="")
    priority = serializers.IntegerField(default=0, min_value=-10000, max_value=10000)
    is_active = serializers.BooleanField(default=True)
    auto_eligible = serializers.BooleanField(default=False)
    reviewed = serializers.BooleanField(default=False)
    doses = DoseSerializer(many=True, allow_empty=False)

    def validate_doses(self, value):
        if len(value) > 20:
            raise ValidationError("حداکثر ۲۰ نوبت مصرف مجاز است.")
        return value


def catalog(coach):
    return SupplementCatalogEntry.objects.filter(coach=coach).prefetch_related("goals", "doses")


def dose_payload(dose):
    return {
        "amount": str(dose.amount),
        "unit": dose.unit,
        "timing": dose.timing,
        "custom_time": dose.custom_time,
        "days": dose.days,
    }


def entry_payload(entry):
    return {
        "id": str(entry.id),
        "name": entry.name,
        "name_en": entry.name_en,
        "aliases": entry.aliases,
        "category": entry.category,
        "goal_ids": [str(goal.id) for goal in entry.goals.all()],
        "reason": entry.reason,
        "instructions": entry.instructions,
        "warnings": entry.warnings,
        "replacement_group": entry.replacement_group,
        "priority": entry.priority,
        "is_active": entry.is_active,
        "is_archived": entry.is_archived,
        "auto_eligible": entry.auto_eligible,
        "reviewed": entry.reviewed,
        "doses": [dose_payload(dose) for dose in entry.doses.all()],
    }


def resolve_goals(coach, ids):
    ids = set(map(str, ids))
    goals = list(SupplementGoal.objects.filter(coach=coach, id__in=ids))
    if len(goals) != len(ids):
        from rest_framework.exceptions import NotFound

        raise NotFound("هدف یافت نشد.")
    return goals


@transaction.atomic
def save_entry(coach, data, entry=None):
    serializer = EntrySerializer(data=data)
    serializer.is_valid(raise_exception=True)
    attrs = serializer.validated_data
    goals = resolve_goals(coach, attrs.pop("goal_ids"))
    doses = attrs.pop("doses")
    duplicate = SupplementCatalogEntry.objects.filter(coach=coach, name=attrs["name"])
    if entry:
        duplicate = duplicate.exclude(id=entry.id)
    if duplicate.exists():
        raise ValidationError({"name": "این نام قبلاً ثبت شده است."})
    if attrs["auto_eligible"] and not attrs["reviewed"]:
        raise ValidationError({"reviewed": "برای پیشنهاد خودکار، بازبینی مربی الزامی است."})
    entry = entry or SupplementCatalogEntry(coach=coach)
    for key, value in attrs.items():
        setattr(entry, key, value)
    entry.save()
    entry.goals.set(goals)
    entry.doses.all().delete()
    SupplementDose.objects.bulk_create(
        [SupplementDose(entry=entry, sort_order=i, **dose) for i, dose in enumerate(doses)]
    )
    return catalog(coach).get(id=entry.id)


class ProposalSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    goal_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=30
    )
    count = serializers.IntegerField(min_value=1, max_value=10, default=2)


def propose(coach, data):
    from students.models import Student

    serializer = ProposalSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    attrs = serializer.validated_data
    student = get_object_or_404(Student, coach=coach, id=attrs["student_id"])
    goals = resolve_goals(coach, attrs["goal_ids"])
    if (
        student.supplement_restrictions
        or student.relevant_medical_notes
        or student.summary_medical_note
    ):
        return {
            "items": [],
            "reason": "نیازمند بررسی محدودیت‌های مکمل شاگرد؛ انتخاب را دستی انجام دهید.",
            "excluded": [],
        }
    candidates = (
        catalog(coach)
        .filter(
            is_active=True, is_archived=False, auto_eligible=True, reviewed=True, goals__in=goals
        )
        .distinct()
    )
    selected, excluded, groups = [], [], set()
    for entry in candidates:
        if entry.replacement_group and entry.replacement_group in groups:
            excluded.append({"id": str(entry.id), "reason": "same_replacement_group"})
            continue
        if len(selected) >= attrs["count"]:
            excluded.append({"id": str(entry.id), "reason": "lower_priority"})
            continue
        if not entry.doses.all():
            excluded.append({"id": str(entry.id), "reason": "no_doses"})
            continue
        selected.append(entry_payload(entry))
        if entry.replacement_group:
            groups.add(entry.replacement_group)
    return {
        "items": selected,
        "reason": "پیشنهاد براساس هدف و اولویت مربی؛ نیازمند تأیید، نه تشخیص پزشکی.",
        "excluded": excluded,
    }


class SelectionItemSerializer(serializers.Serializer):
    entry_id = serializers.UUIDField()
    doses = DoseSerializer(many=True, required=False, allow_empty=False)
    reason = serializers.CharField(max_length=4000, allow_blank=True, required=False)

    def validate_doses(self, value):
        if len(value) > 20:
            raise ValidationError("حداکثر ۲۰ نوبت مصرف مجاز است.")
        return value


class SelectionSerializer(serializers.Serializer):
    items = SelectionItemSerializer(many=True)
    confirmed = serializers.BooleanField(default=False)
    safety_reviewed = serializers.BooleanField(default=False)
    mode = serializers.ChoiceField(choices=["manual", "suggested"], default="manual")
    goal_ids = serializers.ListField(child=serializers.UUIDField(), default=list, max_length=30)

    def validate_items(self, items):
        if len(items) > 30 or len({str(item["entry_id"]) for item in items}) != len(items):
            raise ValidationError("فهرست مکمل تکراری یا بیش از حد مجاز است.")
        return items


def snapshot_selection(coach, student, data):
    serializer = SelectionSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    selection = serializer.validated_data
    goals = resolve_goals(coach, selection["goal_ids"])
    if selection["items"] and not selection["confirmed"]:
        raise ValidationError({"supplement_selection": "برنامه مکمل باید توسط مربی تأیید شود."})
    if selection["items"] and not selection["safety_reviewed"]:
        raise ValidationError(
            {"supplement_selection": "محدودیت‌های مکمل شاگرد را بررسی و تأیید کنید."}
        )
    ids = [item["entry_id"] for item in selection["items"]]
    entries = {
        str(entry.id): entry
        for entry in catalog(coach).filter(id__in=ids, is_active=True, is_archived=False)
    }
    if len(entries) != len(ids):
        from rest_framework.exceptions import NotFound

        raise NotFound("مکمل فعال یافت نشد.")
    output, evidence, groups = [], [], set()
    for item in selection["items"]:
        entry = entries[str(item["entry_id"])]
        if selection["mode"] == "suggested":
            if (
                not entry.auto_eligible
                or not entry.reviewed
                or not set(entry.goals.all()).intersection(goals)
            ):
                raise ValidationError("مکمل برای پیشنهاد با این هدف مجاز نیست.")
            if entry.replacement_group and entry.replacement_group in groups:
                raise ValidationError("مکمل‌های جایگزین همزمان پیشنهاد نمی‌شوند.")
            groups.add(entry.replacement_group)
        doses = item.get("doses", [dose_payload(dose) for dose in entry.doses.all()])
        if not doses:
            raise ValidationError("نوبت مصرف مشخص نشده است.")
        reason = item.get("reason", entry.reason)
        for index, dose in enumerate(doses):
            amount = format(Decimal(dose["amount"]).normalize(), "f")
            timing = (
                dose["custom_time"]
                if dose["timing"] == "custom"
                else SupplementDose.Timing(dose["timing"]).label
            )
            output.append(
                {
                    "id": f"{entry.id}:{index}",
                    "entry_id": str(entry.id),
                    "order": len(output),
                    "name": entry.name,
                    "amount": f"{amount} {SupplementDose.Unit(dose['unit']).label}",
                    "timing": f"{timing} — {SupplementDose.Days(dose['days']).label}",
                    "dose": {**dose, "amount": str(dose["amount"])},
                    "reason": reason,
                    "notes": reason,
                    "instructions": entry.instructions,
                    "warnings": entry.warnings,
                    "source": "coach_catalog",
                    "category": entry.category,
                }
            )
        evidence.append(
            {
                "id": str(entry.id),
                "coach_id": str(coach.id),
                "name": entry.name,
                "source": "coach_catalog",
                "priority": entry.priority,
                "mode": selection["mode"],
                "goal_ids": [str(goal.id) for goal in entry.goals.all()],
                "doses": [{**dose, "amount": str(dose["amount"])} for dose in doses],
                "reason": reason,
                "catalog_updated_at": entry.updated_at.isoformat(),
            }
        )
    return output, {
        "reason": "coach_confirmed_catalog",
        "selected": evidence,
        "safety_reviewed": selection["safety_reviewed"],
        "confirmed": selection["confirmed"],
    }
