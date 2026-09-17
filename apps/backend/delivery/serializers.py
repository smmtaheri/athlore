from rest_framework import serializers


class PdfCreateSerializer(serializers.Serializer):
    program_version_id = serializers.UUIDField(required=False)
    file_name = serializers.CharField(required=False, allow_blank=False, max_length=200)
    display_name = serializers.CharField(required=False, allow_blank=False, max_length=200)
    # "pair" = student delivery: training PDF + nutrition/supplements PDF.
    # "single" = one PDF using the version's saved pdf_settings (default / legacy).
    delivery_outputs = serializers.ChoiceField(
        choices=["pair", "single"],
        required=False,
        default="single",
    )
    pdf_settings_override = serializers.DictField(required=False)
    program_type = serializers.ChoiceField(
        choices=["complete", "workout", "nutrition", "supplement"],
        required=False,
    )


class PdfRenameSerializer(serializers.Serializer):
    file_name = serializers.CharField(required=False, allow_blank=False, max_length=200)
    display_name = serializers.CharField(required=False, allow_blank=False, max_length=200)

    def validate(self, attrs):
        name = attrs.get("file_name") or attrs.get("display_name")
        if not name:
            raise serializers.ValidationError(
                {"file_name": ["file_name or display_name is required."]}
            )
        attrs["file_name"] = name
        return attrs


class PdfShareCreateSerializer(serializers.Serializer):
    expires_in_days = serializers.IntegerField(required=False, min_value=1, max_value=30)
    expires_at = serializers.DateTimeField(required=False)
