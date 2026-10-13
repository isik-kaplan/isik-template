from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils.translation import gettext_lazy as _
from isik.django.drf.serializers.registry import SerializerRegistryExemption
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.users.granting import refuse_a_grant_beyond_the_giver, refuse_a_grant_that_can_never_apply
from apps.users.models.user import User
from apps.users.permissions import VOCABULARY


class ManagedUserSerializer(BaseModelSerializer):
    """Somebody's account, as whoever manages accounts sees it: who they are is read-only here, and what
    they may do is the point. Raising anything is a grant - see apps/users/granting.py."""

    exempt_from_registry = SerializerRegistryExemption(
        reason="A second serializer over User, for whoever manages accounts rather than the person themselves."
    )

    permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=sorted(VOCABULARY.by_name)),
        required=False,
        help_text="What they were granted, as permission names - not what that implies.",
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "permissions",
            "last_login",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["username", "email", "first_name", "last_name", "last_login"]
        extra_kwargs = {
            "is_active": {"help_text": "Whether they may sign in at all."},
            "is_staff": {"help_text": "Whether they may sign in to the admin, and read everybody's account."},
            "is_superuser": {"help_text": "Whether they may do everything, without being granted anything."},
        }

    def to_representation(self, user):
        # The rows themselves rather than get_user_permissions(), which answers "everything" for a superuser.
        granted = sorted(permission.codename for permission in user.user_permissions.all())
        return {**super().to_representation(user), "permissions": granted}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        actor = self.context["request"].user
        user = self.instance
        if user.pk == actor.pk:
            raise serializers.ValidationError(_("Somebody else changes what you may do."))
        if user.is_superuser and not actor.is_superuser:
            raise serializers.ValidationError(_("Only a superuser changes a superuser's account."))
        granted = {permission.codename for permission in user.user_permissions.all()}
        added = set(attrs.get("permissions", granted)) - granted
        # Only a raise is a grant: lowering takes something away, and is users:manage:user's business.
        refuse_a_grant_beyond_the_giver(
            actor,
            raising_is_staff=attrs.get("is_staff") is True and not user.is_staff,
            raising_is_superuser=attrs.get("is_superuser") is True and not user.is_superuser,
            permissions=added,
        )
        refuse_a_grant_that_can_never_apply(attrs.get("is_staff", user.is_staff), added)
        return attrs

    @transaction.atomic
    def update(self, user, validated_data):
        names = validated_data.pop("permissions", None)
        user = super().update(user, validated_data)
        if names is not None:
            user.user_permissions.set(
                PermissionRow.objects.filter(
                    content_type=ContentType.objects.get_for_model(PermissionRow), codename__in=names
                )
            )
        return user
