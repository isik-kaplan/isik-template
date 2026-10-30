from isik.django.apps.notifications import bases


class EmailDelivery(bases.AbstractEmailDelivery):
    class Meta(bases.AbstractEmailDelivery.Meta):
        db_table = "notifications_email_delivery"
