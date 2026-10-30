from isik.django.apps.common.db.history import track_events
from isik.django.apps.notifications.audience import bases

from apps.common.models.base import primary_key
from apps.notifications.keys import kind_key, user_key


# Tracked: who forced a person's choice, when and why is its history.
@track_events()
class Subscription(bases.AbstractForceableSubscription):
    id = primary_key()
    user = user_key("whose choice this is")
    kind = kind_key()

    class Meta(bases.AbstractForceableSubscription.Meta):
        db_table = "notifications_subscription"
