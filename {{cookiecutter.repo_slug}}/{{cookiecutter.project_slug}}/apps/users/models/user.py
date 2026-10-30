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
    # The derived CHECK is still a fixed list in the migration: changing LANGUAGES needs a new migration.
    language = models.CharField(
        max_length=15,
        choices=language_choices,
        blank=True,
        default="",
        help_text="The language this user chose for the interface, or blank to follow their browser's.",
        db_comment="A code from settings.LANGUAGES, or empty for no preference: Accept-Language decides then.",
    )
    # A column despite the history log: a terms change re-asks whoever accepted an older version.
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

    # The write version covers grants too, so a stale page can't quietly undo an admin grant.
    concurrency_relations = ("groups", "user_permissions")

    class Meta(AbstractUser.Meta):
        swappable = "AUTH_USER_MODEL"
        db_table = "users_user"

    @property
    def acting_through_a_token(self):
        return getattr(self, "token_scopes", None) is not None

    @property
    def may_see_every_account(self):
        """A token counts only the permission: staff is a rank, never delegated."""
        if self.has_perm(Permission.USERS_MANAGE_USER):
            return True
        return self.is_staff and not self.acting_through_a_token

    def has_perm(self, perm, obj=None):
        """Without Django's superuser shortcut for a token: a token holds only its scopes."""
        if self.acting_through_a_token:
            return self.is_active and _user_has_perm(self, perm, obj)
        return super().has_perm(perm, obj)

    def has_module_perms(self, app_label):
        if self.acting_through_a_token:
            return self.is_active and _user_has_module_perms(self, app_label)
        return super().has_module_perms(app_label)
