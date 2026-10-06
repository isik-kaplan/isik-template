from django.contrib.auth.hashers import make_password
from isik.django.drf.viewsets.registry import ViewSetRegistryExemption
from rest_framework.permissions import IsAuthenticated

from apps.users.api.viewsets.user import UserViewSet


class WritableUserViewSet(UserViewSet):
    """The real users endpoint with writes opened up, since the routed one is read-only and the
    template ships no endpoint a POST can succeed against."""

    permission_classes = [IsAuthenticated]
    exempt_from_registry = ViewSetRegistryExemption(
        reason="A test stand-in for UserViewSet, mounted only by this app's tests."
    )

    def perform_create(self, serializer):
        # The serializer carries no password, and a user's is required.
        serializer.save(password=make_password(None))
