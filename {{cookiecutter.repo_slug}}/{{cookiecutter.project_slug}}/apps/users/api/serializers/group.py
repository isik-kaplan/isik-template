from django.db import transaction
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.users.granting import refuse_a_grant_beyond_the_giver
from apps.users.models.group import Group
from apps.users.permission_rows import rows_named
from apps.users.permissions import VOCABULARY


class GroupSerializer(BaseModelSerializer):
    """A named set of permissions, which everybody in it holds."""

    permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=sorted(VOCABULARY.by_name)),
        source="permission_names",
        required=False,
        help_text="What everybody in the group holds, as permission names.",
    )

    class Meta:
        model = Group
        fields = ["id", "name", "permissions", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        held = set(self.instance.permission_names) if self.instance else set()
        refuse_a_grant_beyond_the_giver(
            self.context["request"].user, permissions=set(attrs.get("permission_names", held)) - held
        )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        names = validated_data.pop("permission_names", [])
        group = super().create(validated_data)
        group.permissions.set(rows_named(names))
        return group

    @transaction.atomic
    def update(self, group, validated_data):
        names = validated_data.pop("permission_names", None)
        group = super().update(group, validated_data)
        if names is not None:
            group.permissions.set(rows_named(names))
        return group
