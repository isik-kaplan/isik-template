from isik.django.apps.notifications.audience import bases

from apps.common.models.base import primary_key
from apps.notifications.keys import kind_key, user_key


class InboxItem(bases.AbstractInboxItem):
    id = primary_key()
    user = user_key("whose inbox it's in")
    kind = kind_key()

    class Meta(bases.AbstractInboxItem.Meta):
        db_table = "notifications_inbox_item"
