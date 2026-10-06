from django.db import models
from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events

from apps.common.models.base import BaseModel
from apps.common.schema_docs import NoHelpText


@track_events()
class SiteSettings(BaseModel):
    """The site-wide settings an operator changes at runtime, as one row edited in the admin.

    There may be no row at all - `current()` then answers with the defaults, so nothing has to be
    seeded for a fresh install to behave.
    """

    class LoginPolicy(models.TextChoices):
        """Who may still sign in: an ordered ladder for incidents, named for who gets in rather than
        who is kept out. Raising it signs out everybody it no longer admits."""

        EVERYONE = "everyone", _("Everyone")
        STAFF = "staff", _("Staff and superusers")
        SUPERUSERS = "superusers", _("Superusers only")

        @classmethod
        def admits(cls, policy, *, is_staff, is_superuser):
            """Whether somebody holding these may still sign in. The ladder is the declaration order
            above, read off the enum rather than repeated."""
            ladder = [rung.value for rung in cls]
            held = cls.SUPERUSERS if is_superuser else cls.STAFF if is_staff else cls.EVERYONE
            return ladder.index(held.value) >= ladder.index(policy)

    login_policy = models.CharField(
        max_length=16,
        choices=LoginPolicy.choices,
        default=LoginPolicy.EVERYONE,
        verbose_name=_("who may sign in"),
        help_text=_("Raising it signs out everybody it no longer admits, straight away."),
        db_comment="Who may still sign in: everyone, staff (and superusers) or superusers only.",
    )
    # The whole of what makes this a singleton: one value, unique, so a second row cannot be written.
    singleton = models.BooleanField(
        default=True,
        editable=False,
        unique=True,
        help_text=NoHelpText(
            reason="Never editable and never serialized: an internal guard, not a value anybody reads."
        ),
        db_comment="Always true and unique, so the table can hold at most one row.",
    )

    class Meta:
        verbose_name = _("site settings")
        verbose_name_plural = _("site settings")
        constraints = [models.CheckConstraint(condition=models.Q(singleton=True), name="site_settings_singleton")]

    def __str__(self):
        return str(self._meta.verbose_name)

    @classmethod
    def current(cls):
        return cls.objects.first() or cls()
