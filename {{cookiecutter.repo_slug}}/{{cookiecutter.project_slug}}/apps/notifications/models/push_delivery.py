from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import bases


class PushDelivery(bases.AbstractPushDelivery):
    class Meta(bases.AbstractPushDelivery.Meta):
        db_table = "notifications_push_delivery"
        verbose_name = _("push delivery")
        verbose_name_plural = _("push deliveries")
