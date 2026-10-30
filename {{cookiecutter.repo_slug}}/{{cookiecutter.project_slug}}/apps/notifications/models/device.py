from isik.django.apps.notifications.audience import bases

from apps.common.models.base import primary_key
from apps.notifications.keys import user_key


class Device(bases.AbstractDevice):
    id = primary_key()
    user = user_key("signed in on the install, whose notices it's pushed")

    class Meta(bases.AbstractDevice.Meta):
        db_table = "notifications_device"
