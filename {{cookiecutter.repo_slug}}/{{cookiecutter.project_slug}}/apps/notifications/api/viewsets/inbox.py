from django.contrib.auth import get_user_model
from django.db.models import Exists, OuterRef, UUIDField
from django.db.models.functions import Cast
from isik.django.apps.notifications import drf
from isik.django.drf.viewsets.schema_generation import none_during_schema_generation

from apps.notifications.api.serializers.inbox_item import InboxItemSerializer


class InboxViewSet(drf.InboxViewSet):
    """The signed-in person's notifications, newest first: ?unread=true for the unread, marked read one at a time
    or all at once."""

    endpoint = "notification-inbox"

    @none_during_schema_generation
    def get_queryset(self):
        # actor_id is isik's loose text id; the user table keys by UUID.
        staff = get_user_model()._default_manager.filter(pk=Cast(OuterRef("actor_id"), UUIDField()), is_staff=True)
        return super().get_queryset().annotate(actor_is_staff=Exists(staff))

    def get_serializer_class(self):
        return InboxItemSerializer
