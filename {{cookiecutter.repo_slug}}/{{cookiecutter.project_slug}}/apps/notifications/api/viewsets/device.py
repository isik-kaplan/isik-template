from isik.django.apps.notifications import drf


class DeviceViewSet(drf.DeviceViewSet):
    """The phones your notifications are pushed to. The app registers its install when you sign in, and forgets it
    when you sign out there."""

    endpoint = "notification-devices"
