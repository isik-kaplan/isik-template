from django.conf import settings
from django.contrib.auth.models import AbstractUser, _user_has_module_perms, _user_has_perm
from django.db import models
from isik.django.apps.common.db import track_events

from apps.common.models.base import BaseModel
from apps.users.permissions import Permission


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

    @property
    def acting_through_a_token(self):
        """Set for one request by the authenticator that took a token - an application's or one of their own
        personal access tokens - acting for this person with only the scopes that token was given."""
        return getattr(self, "token_scopes", None) is not None

    @property
    def may_see_every_account(self):
        """Staff read every account, and holders of `users:manage:user` - but a token acting for somebody
        only by the permission: being staff is a rank, never something a token was let have."""
        if self.has_perm(Permission.USERS_MANAGE_USER):
            return True
        return self.is_staff and not self.acting_through_a_token

    def has_perm(self, perm, obj=None):
        """Django's, without its superuser shortcut for a token acting for one: being a superuser is a rank,
        and what a token may do is only ever the permissions it was given."""
        if self.acting_through_a_token:
            return self.is_active and _user_has_perm(self, perm, obj)
        return super().has_perm(perm, obj)

    def has_module_perms(self, app_label):
        if self.acting_through_a_token:
            return self.is_active and _user_has_module_perms(self, app_label)
        return super().has_module_perms(app_label)
