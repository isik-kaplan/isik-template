from drf_spectacular.utils import extend_schema_field
from isik.django.apps.notifications.drf import inbox_item_serializer
from rest_framework import serializers

from apps.notifications.models import InboxItem


ACTORS = ("self", "staff", "other")


class InboxItemSerializer(inbox_item_serializer(InboxItem)):
    """Who acted, as one of ACTORS - never their id or name, which a staff member's would give away."""

    actor = serializers.SerializerMethodField()

    class Meta(inbox_item_serializer(InboxItem).Meta):
        fields = [*inbox_item_serializer(InboxItem).Meta.fields, "actor"]
        read_only_fields = fields

    @extend_schema_field(serializers.ChoiceField(choices=ACTORS, allow_null=True))
    def get_actor(self, item):
        if item.actor_id is None:
            return None
        if item.actor_id == str(self.context["request"].user.pk):
            return "self"
        return "staff" if item.actor_is_staff else "other"
