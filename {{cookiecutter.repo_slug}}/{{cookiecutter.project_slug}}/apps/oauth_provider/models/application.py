import pgtrigger
from django.db import models
from isik.django.apps.common.db import track_events
from oauth2_provider.models import AbstractApplication


@track_events()
class Application(AbstractApplication):
    """An application somebody registered so its users can sign in with this project, and later act here
    on their behalf within the scopes each of them lets it have.

    DOT's own row, swapped for this one so the review state and the scopes sit on it. `user` is DOT's
    column for the person who registered it - its owner, who answers for it, never whose account it acts
    in: that is whoever lets it in.
    """

    class Approval(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        # A superuser taking an application down, for cause.
        WITHDRAWN = "withdrawn", "Withdrawn"
        # Its owner's own off switch, kept apart from WITHDRAWN so the owner cannot undo a withdrawal by
        # switching it off and on again.
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
    # Permissions rather than strings, so a scope naming nothing is refused by the foreign key and retiring
    # one cascades out with no sweep to write.
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
                    # Reinstating is a superuser's to do.
                    ("withdrawn", "approved"),
                    # A superuser may still take down something its owner already switched off.
                    ("disabled", "withdrawn"),
                ],
            ),
            pgtrigger.Protect(
                name="born_pending_or_approved",
                operation=pgtrigger.Insert,
                condition=pgtrigger.Q(new__approval__in=["withdrawn", "disabled"]),
            ),
        ]

    @property
    def is_approved(self):
        return self.approval == self.Approval.APPROVED

    def is_usable(self, request):
        """DOT asks this before every authorization, token, refresh and revocation, so an application not
        approved - pending, withdrawn or switched off by its owner - is a client that does not exist."""
        return self.is_approved
