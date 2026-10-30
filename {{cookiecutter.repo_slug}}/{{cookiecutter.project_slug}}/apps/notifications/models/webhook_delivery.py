from isik.django.apps.notifications import bases


class WebhookDelivery(bases.AbstractWebhookDelivery):
    class Meta(bases.AbstractWebhookDelivery.Meta):
        db_table = "notifications_webhook_delivery"
