from isik.django.apps.notifications import bases

from apps.common.models.base import primary_key


class DeliveryAttempt(bases.AbstractDeliveryAttempt):
    id = primary_key()

    class Meta(bases.AbstractDeliveryAttempt.Meta):
        db_table = "notifications_delivery_attempt"
