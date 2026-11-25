from django.db import transaction
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.users.login_policy import sweep
from apps.users.models.site_settings import SiteSettings
from apps.users.tasks.logins_closed import tell_the_people_a_rung_signed_out


class SiteSettingsSerializer(BaseModelSerializer):
    """The site-wide settings: for now, who may sign in at all."""

    # Per change, not stored: during a breach you do not want to mail the account you just cut off.
    mail_the_people_signed_out = serializers.BooleanField(
        write_only=True,
        default=False,
        help_text="Whether to email the people a raised ladder signs out; leave it off during a breach.",
    )
    signed_out = serializers.IntegerField(
        read_only=True,
        allow_null=True,
        help_text="How many sessions this change ended; null outside the answer to a change.",
    )

    class Meta:
        model = SiteSettings
        fields = ["login_policy", "mail_the_people_signed_out", "signed_out", "created_at", "updated_at"]

    def validate_login_policy(self, policy):
        if policy == SiteSettings.LoginPolicy.SUPERUSERS and not self.context["request"].user.is_superuser:
            raise serializers.ValidationError(_("Only a superuser may shut out everybody but superusers."))
        return policy

    @transaction.atomic
    def update(self, settings, validated_data):
        mail = validated_data.pop("mail_the_people_signed_out")
        moved = validated_data.get("login_policy", settings.login_policy) != settings.login_policy
        settings = super().update(settings, validated_data)
        settings.signed_out = sweep(settings.login_policy) if moved else 0
        if settings.signed_out and mail:
            tell_the_people_a_rung_signed_out.delay()
        return settings
