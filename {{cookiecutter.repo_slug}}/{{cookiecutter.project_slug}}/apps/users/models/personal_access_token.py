import pgtrigger
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Now
from isik.django.apps.common.db import track_events
from isik.django.apps.notifications.audiences import Field
from isik.django.apps.notifications.choices import Policy
from isik.django.apps.notifications.kinds import notifies

from apps.common.models.base import BaseModel
from apps.notifications.kinds import OWNER_CHANNELS, PRIVATE_PUSH, TOKEN_CREATED, TOKEN_REVOKED


class PersonalAccessTokenQuerySet(models.QuerySet):
    def unexpired(self):
        return self.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=Now()))


# Every request would otherwise write an event.
@track_events(exclude=["last_used_at", "updated_at"])
@notifies(
    TOKEN_CREATED,
    on=pgtrigger.Insert,
    snapshot=["user", "name"],
    audience=Field("user"),
    policy=Policy.MANDATORY,
    channels=OWNER_CHANNELS,
    push=PRIVATE_PUSH,
)
# A revoked token is deleted, so the notice carries what it was.
@notifies(
    TOKEN_REVOKED,
    on=pgtrigger.Delete,
    snapshot=["user", "name"],
    audience=Field("user"),
    policy=Policy.MANDATORY,
    channels=OWNER_CHANNELS,
    push=PRIVATE_PUSH,
)
class PersonalAccessToken(BaseModel):
    """A token somebody made to call the API as themselves, within its scopes and what they hold. Only a
    checksum is kept."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="personal_access_tokens",
        help_text="Whose it is, and whom it acts as.",
        db_comment="The account the token acts as; its tokens go with it.",
    )
    name = models.CharField(
        max_length=100,
        help_text="What its owner called it, to tell it from their others.",
        db_comment="Free text from its owner.",
    )
    token_checksum = models.CharField(
        max_length=64,
        unique=True,
        help_text="The SHA-256 of the token, which is how a request presenting it is matched.",
        db_comment="Hex SHA-256 of the token; the token itself is never stored.",
    )
    scopes = models.ManyToManyField(
        "auth.Permission",
        related_name="personal_access_tokens",
        blank=True,
        help_text="What it may do, of what its owner holds.",
    )
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When it stops working, or empty if it works until it is deleted.",
        db_comment="Null for a token that never expires.",
    )
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When a request last presented it, or empty if none has.",
        db_comment="Written on every request that authenticates with it.",
    )

    objects = PersonalAccessTokenQuerySet.as_manager()

    class Meta:
        db_table = "users_personal_access_token"
