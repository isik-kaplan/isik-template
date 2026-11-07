from django.db import models
from isik.django.apps.common.db import track_events
from isik.django.apps.notifications.audience import bases

from apps.common.models.base import primary_key
from apps.notifications.keys import kind_key
from apps.notifications.models.endpoint import Endpoint


# What an endpoint is sent is as much its configuration as its URL.
@track_events()
class EndpointKind(bases.AbstractEndpointKind):
    id = primary_key()
    endpoint = models.ForeignKey(
        Endpoint,
        on_delete=models.CASCADE,
        related_name="kinds",
        help_text="The endpoint wanting the kind.",
        db_comment="The endpoint wanting the kind.",
    )
    kind = kind_key()

    class Meta(bases.AbstractEndpointKind.Meta):
        db_table = "notifications_endpoint_kind"
