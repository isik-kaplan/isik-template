from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from isik.django.apps.common.db import track_events

from apps.common.models.base import BaseModel


def language_choices():
    return settings.LANGUAGES


@track_events()
class User(AbstractUser, BaseModel):
    # Blank, not a sentinel value - "no preference, follow the browser's Accept-Language" (see
    # UserLanguageMiddleware). Django's own blank-skips-choice-validation means "" stays valid even
    # though it's not itself one of the choices.
    #
    # choices=language_choices, not choices=settings.LANGUAGES directly: a callable keeps the field
    # re-reading what is configured. The CHECK isik derives from the choices is a list in the
    # migration all the same, so changing LANGUAGES means a migration that rewrites that constraint.
    language = models.CharField(
        max_length=15,
        choices=language_choices,
        blank=True,
        default="",
        help_text="The language this user chose for the interface, or blank to follow their browser's.",
        db_comment="A code from settings.LANGUAGES, or empty for no preference: Accept-Language decides then.",
    )
    # A column despite the history log: a later terms change asks whoever accepted an older version to accept again,
    # which makes this a live input rather than an audit record.
    terms_version = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="The version of the legal documents this user agreed to at signup, or blank if none were published.",
        db_comment="apps.users.terms.TERMS_VERSION when the account was created; empty if no documents existed.",
    )
    terms_accepted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this user agreed to the legal documents, or empty if none were published at signup.",
        db_comment="Set with terms_version at signup; null when there was nothing to agree to.",
    )

    class Meta(AbstractUser.Meta):
        swappable = "AUTH_USER_MODEL"
