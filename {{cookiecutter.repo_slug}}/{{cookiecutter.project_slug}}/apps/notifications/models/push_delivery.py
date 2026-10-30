from isik.django.apps.notifications import bases


class PushDelivery(bases.AbstractPushDelivery):
    class Meta(bases.AbstractPushDelivery.Meta):
        db_table = "notifications_push_delivery"
