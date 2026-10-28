from isik.django.apps.notifications.audience import bases

from apps.common.models.base import primary_key
from apps.notifications.keys import kind_key, user_key


class Subscription(bases.AbstractSubscription):
    id = primary_key()
    user = user_key("whose choice this is")
    kind = kind_key()
