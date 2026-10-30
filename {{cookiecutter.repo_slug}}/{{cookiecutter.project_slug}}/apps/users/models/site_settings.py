from django.core.cache import cache
from django.db import models, transaction
from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events

from apps.common.models.base import BaseModel
from apps.common.schema_docs import NoHelpText


@track_events()
class SiteSettings(BaseModel):
    """Runtime site-wide settings, one row (or none: `current()` returns defaults). `cached()` may lag a
    save by up to `CACHE_SECONDS` in a process with its own cache."""

    CACHE_KEY = "site_settings"
    CACHE_SECONDS = 5

    class LoginPolicy(models.TextChoices):
        """Who may still sign in: an ordered ladder for incidents, in declaration order."""

        EVERYONE = "everyone", _("Everyone")
        STAFF = "staff", _("Staff and superusers")
        SUPERUSERS = "superusers", _("Superusers only")

        @classmethod
        def admits(cls, policy, *, is_staff, is_superuser):
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
        db_table = "users_site_settings"
        verbose_name = _("site settings")
        verbose_name_plural = _("site settings")
        constraints = [models.CheckConstraint(condition=models.Q(singleton=True), name="site_settings_singleton")]

    def __str__(self):
        return str(self._meta.verbose_name)

    @classmethod
    def current(cls):
        return cls.objects.first() or cls()

    @classmethod
    def cached(cls):
        found = cache.get(cls.CACHE_KEY)
        if found is None:
            found = cls.current()
            cache.set(cls.CACHE_KEY, found, cls.CACHE_SECONDS)
        return found

    def save(self, **kwargs):
        super().save(**kwargs)
        # Again at commit: another thread may re-cache the old row before this write is visible.
        cache.delete(self.CACHE_KEY)
        transaction.on_commit(lambda: cache.delete(self.CACHE_KEY))
