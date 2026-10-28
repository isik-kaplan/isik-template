"""The keys the audience's models declare themselves, since isik's bases leave them to the project."""

from django.conf import settings
from django.db import models


def user_key(described):
    return models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
        help_text=f"The user {described}.",
        db_comment=f"The user {described}.",
    )


def kind_key():
    return models.ForeignKey(
        "notifications.NoticeKindPolicy",
        on_delete=models.PROTECT,
        related_name="+",
        help_text="The kind it's for.",
        db_comment="The kind it's for. Kinds are retired, never deleted.",
    )
