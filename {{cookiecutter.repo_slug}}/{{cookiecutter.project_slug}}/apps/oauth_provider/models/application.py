import pgtrigger
from django.db import models
from django.db.models import Q
from isik.django.apps.common.db import VersionedModel, track_events
from isik.django.apps.notifications.audiences import Field
from isik.django.apps.notifications.choices import Policy
from isik.django.apps.notifications.kinds import notifies
from oauth2_provider.models import AbstractApplication

from apps.notifications.kinds import APPLICATION_REVIEWED, OWNER_CHANNELS, PRIVATE_PUSH


@track_events()
@notifies(
    APPLICATION_REVIEWED,
    on=pgtrigger.Update,
    variants={
        "approved": pgtrigger.Q(new__approval="approved") & ~pgtrigger.Q(old__approval="approved"),
        "withdrawn": pgtrigger.Q(new__approval="withdrawn") & ~pgtrigger.Q(old__approval="withdrawn"),
    },
    snapshot=["user", "name", "approval"],
    audience=Field("user"),
    policy=Policy.DEFAULT_ON,
    channels=OWNER_CHANNELS,
    push=PRIVATE_PUSH,
)
class Application(VersionedModel, AbstractApplication):
    """`user` is its owner, never whose account it acts in. Versioned, since DOT's `updated` is `auto_now`,
    which a QuerySet.update() never touches."""

    class Approval(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        WITHDRAWN = "withdrawn", "Withdrawn"
        # Apart from WITHDRAWN, so an owner cannot undo a withdrawal by switching it off and on.
        DISABLED = "disabled", "Disabled by its owner"

    description = models.TextField(
        blank=True,
        help_text="What it does, shown to everybody asked to let it in.",
        db_comment="Shown on the consent page beside the scopes it asks for.",
    )
    approval = models.CharField(
        max_length=32,
        choices=Approval.choices,
        default=Approval.PENDING,
        help_text="Where it stands. Only an approved application signs anybody in or holds working tokens.",
        db_comment="A state machine trigger governs the moves; OAUTH_PROVIDER__MODE=auto starts it approved.",
    )
    # Permissions, not strings: the foreign key refuses a bogus scope and cascades a retired one.
    requested_scopes = models.ManyToManyField(
        "auth.Permission",
        related_name="requested_by_applications",
        blank=True,
        help_text="What it asks to be able to do on somebody's behalf.",
    )
    approved_scopes = models.ManyToManyField(
        "auth.Permission",
        related_name="approved_for_applications",
        blank=True,
        help_text="What of that a superuser let it ask anybody for - never more than it requested.",
    )

    class Meta(AbstractApplication.Meta):
        swappable = "OAUTH2_PROVIDER_APPLICATION_MODEL"
        db_table = "oauth_provider_application"
        triggers = [
            # A state machine constrains UPDATE only, so a row's birth state needs its own guard.
            pgtrigger.FSM(
                name="approval_follows_the_lifecycle",
                field="approval",
                transitions=[
                    ("pending", "approved"),
                    ("pending", "withdrawn"),
                    ("approved", "withdrawn"),
                    ("approved", "disabled"),
                    ("disabled", "approved"),
                    ("withdrawn", "approved"),
                    ("disabled", "withdrawn"),
                ],
            ),
            # Only services.py opens these, so nothing else approves or takes one down without revoking.
            pgtrigger.Protect(
                name="approval_moves_only_through_its_services",
                operation=pgtrigger.Update,
                condition=pgtrigger.Q(old__approval__df=pgtrigger.F("new__approval")),
            ),
            pgtrigger.Protect(
                name="born_pending",
                operation=pgtrigger.Insert,
                condition=~pgtrigger.Q(new__approval="pending"),
            ),
        ]
        constraints = [
            # DOT's columns, which its admin offers to change.
            models.CheckConstraint(condition=Q(skip_authorization=False), name="always_asks"),
            models.CheckConstraint(
                condition=Q(
                    authorization_grant_type__in=[
                        AbstractApplication.GRANT_AUTHORIZATION_CODE,
                        AbstractApplication.GRANT_DEVICE_CODE,
                    ]
                ),
                name="served_grant_types",
            ),
        ]

    @property
    def is_approved(self):
        return self.approval == self.Approval.APPROVED

    def is_usable(self, request):
        """DOT asks this before every authorization, token, refresh and revocation."""
        return self.is_approved
