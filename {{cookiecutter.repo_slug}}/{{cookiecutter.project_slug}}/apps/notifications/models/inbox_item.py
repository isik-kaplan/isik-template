from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events
from isik.django.apps.notifications.audience import bases

from apps.common.models.base import primary_key
from apps.notifications.keys import kind_key, user_key


# Whether somebody was told and whether they read it, even after the row goes. Its own actor_id is left out:
# on every event table that name is who wrote the row, and Notice keeps the notice's actor anyway.
@track_events(exclude=["actor_id"])
class InboxItem(bases.AbstractInboxItem):
    id = primary_key()
    user = user_key("whose inbox it's in")
    kind = kind_key()

    class Meta(bases.AbstractInboxItem.Meta):
        db_table = "notifications_inbox_item"
        verbose_name = _("inbox item")
        verbose_name_plural = _("inbox items")
