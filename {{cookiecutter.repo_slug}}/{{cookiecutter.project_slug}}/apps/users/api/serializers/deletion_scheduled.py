from rest_framework import serializers


class DeletionScheduledSerializer(serializers.Serializer):
    deletes_at = serializers.DateTimeField(help_text="When the account is deleted, unless they sign in before.")
