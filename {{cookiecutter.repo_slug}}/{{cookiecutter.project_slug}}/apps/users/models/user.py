from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.common.models.base import BaseModel
from apps.common.tracking import track_events


def language_choices():
    return settings.LANGUAGES


@track_events()
class User(AbstractUser, BaseModel):
    # Blank, not a sentinel value - "no preference, follow the browser's Accept-Language" (see
    # UserLanguageMiddleware). Django's own blank-skips-choice-validation means "" stays valid even
    # though it's not itself one of the choices.
    #
    # choices=language_choices, not choices=settings.LANGUAGES directly: a plain list gets frozen
    # into the migration that adds this field, which would commit to whatever "languages" this
    # project happened to be generated with - a callable keeps choices re-read from settings live,
    # so it can never drift from what's actually configured (and the migration stays generic
    # enough to check into the template unmodified, regardless of a project's own answer).
    language = models.CharField(
        max_length=15,
        choices=language_choices,
        blank=True,
        default="",
        help_text="The language this user chose for the interface, or blank to follow their browser's.",
        db_comment="A code from settings.LANGUAGES, or empty for no preference: Accept-Language decides then.",
    )

    class Meta(AbstractUser.Meta):
        swappable = "AUTH_USER_MODEL"
