from isik.django.apps.notifications import drf


class NoticeKindViewSet(drf.NoticeKindViewSet):
    """Every kind of notification there is, with what it is, whether you may turn it off, and whether staff decided it
    for you."""

    endpoint = "notification-kinds"
