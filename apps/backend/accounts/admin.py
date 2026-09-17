from django.contrib import admin

from accounts.models import CoachProfile, CoachRuleSet


@admin.register(CoachProfile)
class CoachProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "control_mode", "created_at")
    search_fields = ("display_name", "user__email")


@admin.register(CoachRuleSet)
class CoachRuleSetAdmin(admin.ModelAdmin):
    list_display = ("coach", "schema_version", "updated_at")
