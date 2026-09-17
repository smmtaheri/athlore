from django.contrib import admin
from .models import Coach, CoachExercisePreference, CoachRule, CoachTemplate, Exercise, GeneratedProgram, StudentProfile

admin.site.register(Coach)
admin.site.register(Exercise)
admin.site.register(CoachExercisePreference)
admin.site.register(CoachTemplate)
admin.site.register(CoachRule)
admin.site.register(StudentProfile)
admin.site.register(GeneratedProgram)
