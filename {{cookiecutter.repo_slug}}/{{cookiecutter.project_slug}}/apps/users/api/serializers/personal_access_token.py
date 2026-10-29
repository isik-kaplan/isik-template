from datetime import timedelta

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from isik.django.apps.features.resolution import effective
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.users.api.fields.scope import ScopeField
from apps.users.models import PersonalAccessToken
from apps.users.personal_access_tokens import make_token


# Few enough that a forgotten one is noticed in the list.
TOKENS_PER_USER = 50


class PersonalAccessTokenSerializer(BaseModelSerializer):
    """A token somebody made for themselves; the secret appears only in the answer to making it."""

    scopes = ScopeField(
        many=True,
        required=False,
        help_text="What it may do, of what you hold. None at all still reads whatever needs no permission.",
    )
    token = serializers.SerializerMethodField(
        help_text="Only in the answer to making it, and never again: only its checksum is kept. Lost, make another."
    )

    class Meta:
        model = PersonalAccessToken
        fields = ["id", "name", "scopes", "expires_at", "last_used_at", "token", "created_at", "updated_at"]
        read_only_fields = ["last_used_at", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"allow_blank": False},
            # Every token ends: leaving it out gives the lifetime, so null would only mean the same less clearly.
            "expires_at": {
                "allow_null": False,
                "help_text": "When it stops working: no later than your token lifetime allows, which is also when one "
                "you leave it out for stops.",
            },
        }

    def get_token(self, personal_access_token) -> str | None:
        return getattr(personal_access_token, "issued_token", None)

    def validate_scopes(self, scopes):
        user = self.context["request"].user
        missing = sorted(scope.codename for scope in scopes if not user.has_perm(scope.codename))
        if missing:
            raise serializers.ValidationError(
                _("You cannot give a token what you do not hold: %(scopes)s.") % {"scopes": ", ".join(missing)}
            )
        return scopes

    def lifetime_days(self):
        return effective(self.context["request"].user, "token_lifetime_days").value

    def validate_expires_at(self, expires_at):
        now = timezone.now()
        if expires_at <= now:
            raise serializers.ValidationError(_("Pick a moment still to come."))
        days = self.lifetime_days()
        if expires_at > now + timedelta(days=days):
            raise serializers.ValidationError(
                _("A token of yours can work for at most %(days)d days.") % {"days": days}
            )
        return expires_at

    def validate(self, attrs):
        user = self.context["request"].user
        if PersonalAccessToken.objects.filter(user=user).count() >= TOKENS_PER_USER:
            raise serializers.ValidationError(
                _("You can have at most %(limit)d tokens. Delete one you no longer use.") % {"limit": TOKENS_PER_USER}
            )
        return attrs

    def create(self, validated_data):
        validated_data.setdefault("expires_at", timezone.now() + timedelta(days=self.lifetime_days()))
        return make_token(user=self.context["request"].user, scopes=validated_data.pop("scopes", []), **validated_data)
