from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.users.permissions import VOCABULARY


@extend_schema_field(OpenApiTypes.STR)
class ScopeField(serializers.SlugRelatedField):
    """A delegatable permission, by its `where:action:what` name, that a token may act with."""

    def __init__(self, **kwargs):
        super().__init__(slug_field="codename", **kwargs)

    def get_queryset(self):
        return Permission.objects.filter(
            content_type=ContentType.objects.get_for_model(Permission),
            codename__in=[str(declaration) for declaration in VOCABULARY.delegatable()],
        )
