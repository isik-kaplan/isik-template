from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.users.api.fields.scope import ScopeField
from apps.users.models import PersonalAccessToken
from apps.users.personal_access_tokens import make_token


# Enough for every script somebody runs, few enough that a forgotten one is noticed in the list.
TOKENS_PER_USER = 50


class PersonalAccessTokenSerializer(BaseModelSerializer):
    """A token somebody made for themselves, as they see it - the token itself only in the answer to making it."""

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
            "expires_at": {"help_text": "When it stops working - leave it out for a token that never does."},
        }

    def get_token(self, personal_access_token) -> str | None:
        return getattr(personal_access_token, "issued_token", None)

    def validate_scopes(self, scopes):
        # You may give a token only what you hold - the same rule as granting anybody anything.
        user = self.context["request"].user
        missing = sorted(scope.codename for scope in scopes if not user.has_perm(scope.codename))
        if missing:
            raise serializers.ValidationError(
                _("You cannot give a token what you do not hold: %(scopes)s.") % {"scopes": ", ".join(missing)}
            )
        return scopes

    def validate_expires_at(self, expires_at):
        if expires_at is not None and expires_at <= timezone.now():
            raise serializers.ValidationError(_("Pick a moment still to come."))
        return expires_at

    def validate(self, attrs):
        user = self.context["request"].user
        if PersonalAccessToken.objects.filter(user=user).count() >= TOKENS_PER_USER:
            raise serializers.ValidationError(
                _("You can have at most %(limit)d tokens. Delete one you no longer use.") % {"limit": TOKENS_PER_USER}
            )
        return attrs

    def create(self, validated_data):
        return make_token(user=self.context["request"].user, scopes=validated_data.pop("scopes", []), **validated_data)
