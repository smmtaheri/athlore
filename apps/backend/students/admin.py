from django.contrib import admin

from students.models import Student, Visit
from students.visit_form_models import CoachVisitFormTemplate


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("full_name", "coach", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("full_name", "phone_number")


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "visit_date",
        "status",
        "form_template_key",
        "current_weight_kg",
        "coach",
    )
    list_filter = ("visit_date", "status")


@admin.register(CoachVisitFormTemplate)
class CoachVisitFormTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "coach", "version", "is_default", "is_active", "updated_at")
    list_filter = ("is_active", "is_default")
    search_fields = ("name", "key")
