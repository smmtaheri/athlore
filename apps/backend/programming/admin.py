from django.contrib import admin

from programming.models import GenerationRun, Program, ProgramReadySms, ProgramVersion

admin.site.register(Program)
admin.site.register(ProgramVersion)
admin.site.register(GenerationRun)


@admin.register(ProgramReadySms)
class ProgramReadySmsAdmin(admin.ModelAdmin):
    list_display = ("version", "status", "error_code", "created_at", "sent_at")
    list_filter = ("status",)
    readonly_fields = (
        "version",
        "status",
        "provider_message_id",
        "error_code",
        "created_at",
        "attempted_at",
        "sent_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
