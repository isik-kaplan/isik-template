import pgtrigger
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import VersionedModel, if_unset, redeclare, track_events
from isik.django.apps.notifications.audiences import Field
from isik.django.apps.notifications.channels import Channel
from isik.django.apps.notifications.choices import Policy
from isik.django.apps.notifications.kinds import notifies
from oauth2_provider.models import AbstractApplication

from apps.notifications.audiences import Reviewers
from apps.notifications.kinds import (
    APPLICATION_REVIEWED,
    APPLICATION_TAKEN_DOWN,
    OWNER_CHANNELS,
    PRIVATE_PUSH,
    sent_on,
)


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
    channels=sent_on(Policy.DEFAULT_ON, *OWNER_CHANNELS),
    push=PRIVATE_PUSH,
)
# The other reviewers, so a withdrawal is known beyond whoever made it. DEFAULT_ON: watching every application is a
# job somebody may mute, unlike being told about your own.
@notifies(
    APPLICATION_TAKEN_DOWN,
    on=pgtrigger.Update,
    variants={
        "withdrawn": pgtrigger.Q(new__approval="withdrawn") & ~pgtrigger.Q(old__approval="withdrawn"),
        "disabled": pgtrigger.Q(new__approval="disabled") & ~pgtrigger.Q(old__approval="disabled"),
    },
    snapshot=["name", "approval"],
    audience=Reviewers(),
    channels=sent_on(Policy.DEFAULT_ON, Channel.INBOX, Channel.EMAIL, Channel.PUSH),
    push=PRIVATE_PUSH,
)
class Application(VersionedModel, AbstractApplication):
    """`user` is its owner, never whose account it acts in. Versioned, since DOT's `updated` is `auto_now`,
    which a QuerySet.update() never touches."""

    id = redeclare(
        AbstractApplication.id,
        verbose_name=_("ID"),
        help_text="Identifies this application here; what it presents to sign people in is client_id.",
        db_comment="Internal key; OAuth requests and tokens name the application by client_id instead.",
    )
    client_id = redeclare(
        AbstractApplication.client_id,
        help_text="What the application presents to sign people in, generated when it is registered.",
        db_comment="Unique and generated at registration; the client_id every OAuth request carries.",
    )
    user = redeclare(
        AbstractApplication.user,
        related_query_name="oauth_provider_application",
        help_text="Who registered this application and manages it, never whose account it acts in.",
        db_comment="The owner; deleting them deletes the applications they registered.",
    )
    redirect_uris = redeclare(
        AbstractApplication.redirect_uris,
        help_text=if_unset("Where a sign-in may return to."),
        db_comment="Space-separated; a code goes only to one of these exactly. Empty for a device code client.",
    )
    post_logout_redirect_uris = redeclare(
        AbstractApplication.post_logout_redirect_uris,
        help_text=if_unset("Where signing out may return to."),
        db_comment="Space-separated, and unused: signing out through an application isn't served here.",
    )
    client_type = redeclare(
        AbstractApplication.client_type,
        help_text="Whether it keeps a secret: confidential for a server, public for a browser, mobile or device app.",
        db_comment="RFC 6749 section 2.1. Only a confidential one is issued a secret; PKCE is required of both.",
    )
    authorization_grant_type = redeclare(
        AbstractApplication.authorization_grant_type,
        help_text="How it gets its tokens: through a person signing in, or a code they enter on another device.",
        db_comment="Held by served_grant_types to the authorization code and device code grants.",
    )
    client_secret = redeclare(
        AbstractApplication.client_secret,
        help_text=if_unset("What a confidential application proves itself with."),
        db_comment="A hash, so the secret itself is shown once, when it is issued or rotated.",
    )
    hash_client_secret = redeclare(
        AbstractApplication.hash_client_secret,
        help_text="Whether the secret is stored hashed; always, for an application registered here.",
        db_comment="DOT's default, which nothing here turns off: no stored secret can be read back.",
    )
    name = redeclare(
        AbstractApplication.name,
        help_text="What the application is called, shown to everybody asked to let it in.",
        db_comment="Chosen by its owner and required by the API; not unique.",
    )
    skip_authorization = redeclare(
        AbstractApplication.skip_authorization,
        help_text="Whether people are let in without being asked; never, here.",
        db_comment="Held false by always_asks.",
    )
    created = redeclare(
        AbstractApplication.created,
        help_text="When the application was registered.",
        db_comment="Set by DOT on insert (auto_now_add).",
    )
    updated = redeclare(
        AbstractApplication.updated,
        help_text="When the application was last saved.",
        db_comment="auto_now: a QuerySet.update() never moves it, which is why the row is versioned too.",
    )
    algorithm = redeclare(
        AbstractApplication.algorithm,
        help_text="How its OpenID Connect ID tokens are signed.",
        db_comment="RS256 for every application registered here, signed with OAUTH_PROVIDER__SIGNING_KEY.",
    )
    allowed_origins = redeclare(
        AbstractApplication.allowed_origins,
        help_text=if_unset("Browser origins allowed to call the token endpoint."),
        db_comment="Space-separated origins DOT lets reach the token endpoint from a browser; nothing here sets any.",
    )
    registration_source = redeclare(
        AbstractApplication.registration_source,
        help_text=if_unset("How this application was registered."),
        db_comment="manual for every application here: neither dynamic registration nor CIMD is served.",
    )
    cimd_expires_at = redeclare(
        AbstractApplication.cimd_expires_at,
        help_text=if_unset("When a Client ID Metadata Document should be fetched again."),
        db_comment="Null here: only a CIMD application has one, and CIMD isn't served.",
    )

    class Approval(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        WITHDRAWN = "withdrawn", "Withdrawn"
        # Apart from WITHDRAWN, so an owner cannot undo a withdrawal by switching it off and on.
        DISABLED = "disabled", "Disabled by its owner"

    description = models.TextField(
        verbose_name=_("description"),
        blank=True,
        help_text="What it does, shown to everybody asked to let it in.",
        db_comment="Shown on the consent page beside the scopes it asks for.",
    )
    approval = models.CharField(
        verbose_name=_("approval"),
        max_length=32,
        choices=Approval.choices,
        default=Approval.PENDING,
        help_text="Where it stands. Only an approved application signs anybody in or holds working tokens.",
        db_comment="A state machine trigger governs the moves; OAUTH_PROVIDER__MODE=auto starts it approved.",
    )
    # Permissions, not strings: the foreign key refuses a bogus scope and cascades a retired one.
    requested_scopes = models.ManyToManyField(
        "auth.Permission",
        through="oauth_provider.RequestedScope",
        related_name="requested_by_applications",
        related_query_name="requested_by_applications",
        verbose_name=_("requested scopes"),
        blank=True,
        help_text="What it asks to be able to do on somebody's behalf.",
    )
    approved_scopes = models.ManyToManyField(
        "auth.Permission",
        through="oauth_provider.ApprovedScope",
        related_name="approved_for_applications",
        related_query_name="approved_for_applications",
        verbose_name=_("approved scopes"),
        blank=True,
        help_text="What of that a superuser let it ask anybody for - never more than it requested.",
    )

    class Meta(AbstractApplication.Meta):
        swappable = "OAUTH2_PROVIDER_APPLICATION_MODEL"
        db_table = "oauth_provider_application"
        verbose_name = _("application")
        verbose_name_plural = _("applications")
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
            models.CheckConstraint(
                condition=Q(skip_authorization=False),
                name="always_asks",
                violation_error_message=_("An application always asks its user before it is let in."),
                violation_error_code="always_asks",
            ),
            models.CheckConstraint(
                condition=Q(
                    authorization_grant_type__in=[
                        AbstractApplication.GRANT_AUTHORIZATION_CODE,
                        AbstractApplication.GRANT_DEVICE_CODE,
                    ]
                ),
                name="served_grant_types",
                violation_error_message=_("This site serves only the authorization code and device code grants."),
                violation_error_code="served_grant_types",
            ),
        ]

    @property
    def is_approved(self):
        return self.approval == self.Approval.APPROVED

    def is_usable(self, request):
        """DOT asks this before every authorization, token, refresh and revocation."""
        return self.is_approved
