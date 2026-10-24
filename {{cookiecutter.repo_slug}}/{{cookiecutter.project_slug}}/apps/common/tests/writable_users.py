from django.contrib.auth.hashers import make_password
from isik.django.drf.viewsets.registry import ViewSetRegistryExemption
from rest_framework.permissions import IsAuthenticated

from apps.users.api.serializers.user import UserSerializer
from apps.users.api.viewsets.user import UserViewSet
from apps.users.models.user import User


class WritableUserViewSet(UserViewSet):
    """The template ships no endpoint a POST can succeed against."""

    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    request_policies = []
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    exempt_from_registry = ViewSetRegistryExemption(
        reason="A test stand-in for UserViewSet, mounted only by the idempotency claim tests."
    )

    def get_queryset(self):
        # The replay reads the row it made back through this; the routed one narrows to your own.
        return User.objects.all()

    def perform_create(self, serializer):
        serializer.save(password=make_password(None))
