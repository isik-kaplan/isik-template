from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import bases

from apps.common.models.base import primary_key


class DeliveryAttempt(bases.AbstractDeliveryAttempt):
    id = primary_key()

    class Meta(bases.AbstractDeliveryAttempt.Meta):
        db_table = "notifications_delivery_attempt"
        verbose_name = _("delivery attempt")
        verbose_name_plural = _("delivery attempts")
