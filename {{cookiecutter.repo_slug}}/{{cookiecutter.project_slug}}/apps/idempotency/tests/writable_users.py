from django.contrib.auth.hashers import make_password
from isik.django.drf.viewsets.registry import ViewSetRegistryExemption
from rest_framework.permissions import IsAuthenticated

from apps.users.api.serializers.user import UserSerializer
from apps.users.api.viewsets.user import UserViewSet
from apps.users.models.user import User


class WritableUserViewSet(UserViewSet):
    """The real users endpoint with writes opened up, since the routed one is read-only and the
    template ships no endpoint a POST can succeed against."""

    permission_classes = [IsAuthenticated]
    # The routed one's is for managing somebody already there, and asks who they are; this one makes them.
    serializer_class = UserSerializer
    # The gate is UserViewSet's for changing somebody else's account, and none of its business here.
    request_policies = []
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    exempt_from_registry = ViewSetRegistryExemption(
        reason="A test stand-in for UserViewSet, mounted only by this app's tests."
    )

    def get_queryset(self):
        # Every account, as the replay reads the row it made back through this: the routed one narrows to
        # your own unless you may see everybody's.
        return User.objects.all()

    def perform_create(self, serializer):
        # The serializer carries no password, and a user's is required.
        serializer.save(password=make_password(None))
