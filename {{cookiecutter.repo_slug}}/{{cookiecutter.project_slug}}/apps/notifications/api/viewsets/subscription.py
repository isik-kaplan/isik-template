from isik.django.apps.notifications import drf


class SubscriptionViewSet(drf.SubscriptionViewSet):
    """Which notifications the signed-in person gets: each a choice against a kind's default. kinds/ lists the ones
    they may choose about; a mandatory kind is not among them."""

    endpoint = "notification-subscriptions"
