from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import bases


class EmailDelivery(bases.AbstractEmailDelivery):
    class Meta(bases.AbstractEmailDelivery.Meta):
        db_table = "notifications_email_delivery"
        verbose_name = _("email delivery")
        verbose_name_plural = _("email deliveries")
