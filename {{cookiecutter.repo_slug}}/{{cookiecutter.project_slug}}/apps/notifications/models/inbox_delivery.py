from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import bases


class InboxDelivery(bases.AbstractInboxDelivery):
    class Meta(bases.AbstractInboxDelivery.Meta):
        db_table = "notifications_inbox_delivery"
        verbose_name = _("inbox delivery")
        verbose_name_plural = _("inbox deliveries")
