from django.contrib import admin

from programming.models import GenerationRun, Program, ProgramVersion

admin.site.register(Program)
admin.site.register(ProgramVersion)
admin.site.register(GenerationRun)
