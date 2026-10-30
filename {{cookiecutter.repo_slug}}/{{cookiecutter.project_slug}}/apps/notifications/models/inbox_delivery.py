from isik.django.apps.notifications import bases


class InboxDelivery(bases.AbstractInboxDelivery):
    class Meta(bases.AbstractInboxDelivery.Meta):
        db_table = "notifications_inbox_delivery"
