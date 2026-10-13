from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.users.permissions import VOCABULARY


@extend_schema_field(OpenApiTypes.STR)
class ScopeField(serializers.SlugRelatedField):
    """A permission an application may act with, by its `where:action:what` name - the scope it asks
    people for. Only a delegatable one: a name that could widen an application's own access does not
    resolve, so nobody is invited to ask for something that can never be granted."""

    def __init__(self, **kwargs):
        super().__init__(slug_field="codename", **kwargs)

    def get_queryset(self):
        return Permission.objects.filter(
            content_type=ContentType.objects.get_for_model(Permission),
            codename__in=[str(declaration) for declaration in VOCABULARY.delegatable()],
        )
