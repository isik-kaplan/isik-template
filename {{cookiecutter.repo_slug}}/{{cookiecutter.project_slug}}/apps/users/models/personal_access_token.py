from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Now
from isik.django.apps.common.db import track_events

from apps.common.models.base import BaseModel


class PersonalAccessTokenQuerySet(models.QuerySet):
    def unexpired(self):
        return self.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=Now()))


# When it was last used is not part of its history: every request would write an event.
@track_events(exclude=["last_used_at", "updated_at"])
class PersonalAccessToken(BaseModel):
    """A token somebody made for themselves, for a script or a command line to call the API as them - with
    only the scopes they gave it, and never more than they hold themselves when it is used.

    Only a checksum is kept: the token is shown once, when it is made, and a lost one is replaced.
    """

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
