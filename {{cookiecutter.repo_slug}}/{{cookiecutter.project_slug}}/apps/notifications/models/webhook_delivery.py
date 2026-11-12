from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import bases


class WebhookDelivery(bases.AbstractWebhookDelivery):
    class Meta(bases.AbstractWebhookDelivery.Meta):
        db_table = "notifications_webhook_delivery"
        verbose_name = _("webhook delivery")
        verbose_name_plural = _("webhook deliveries")
