"""Every kind of notice this deployment can raise or record: a kind is a key and a protected row, so it is
named here rather than invented where it's raised. Each says what it is, in the request's language, so a client
renders it from the API alone."""

from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import conf
from isik.django.apps.notifications.audiences import Field
from isik.django.apps.notifications.choices import Policy
from isik.django.apps.notifications.kinds import PushContent, Source, declare_kind


# On once a push service has credentials ({{ cookiecutter.project_slug }}.settings.PUSH_CREDENTIALS): a kind
# sent on push without them won't start.
PUSH = ("push",) if "push" in conf.setting("CHANNELS") else ()
# Names people typed stay off lock screens and Apple's and Google's servers: a push says what kind of thing
# happened, and the app shows the rest.
PRIVATE_PUSH = PushContent(private=True, badge=True)

# What an owner hears of their own tokens and applications{% if cookiecutter.webhooks != "none" %}, which an endpoint may also be sent{% endif %}.
OWNER_CHANNELS = ("inbox", "email"{% if cookiecutter.webhooks != "none" %}, "webhook"{% endif %}, *PUSH)

# Trigger-sourced: the database writes these, on the models that declare them.
TOKEN_CREATED = declare_kind(
    "token_created",
    label=_("New personal access tokens"),
    description=_("When a personal access token is made for your account."),
    message=_('A personal access token named "%(name)s" was created.'),
)
TOKEN_REVOKED = declare_kind(
    "token_revoked",
    label=_("Revoked personal access tokens"),
    description=_("When one of your personal access tokens is revoked."),
    message=_('The personal access token named "%(name)s" was revoked.'),
)
APPLICATION_REVIEWED = declare_kind(
    "application_reviewed",
    variants=("approved", "withdrawn"),
    label=_("Your applications being approved or withdrawn"),
    description=_("When staff approve or withdraw an application you registered."),
    message=lambda data, variant: (
        _('Your application "%(name)s" was approved.')
        if variant == "approved"
        else _('Your application "%(name)s" was withdrawn.')
    )
    % data,
)

# Raised by the application, for changes no row of ours shows.
SIGNED_OUT_BY_POLICY = declare_kind(
    "signed_out_by_policy",
    audience=Field("user"),
    policy=Policy.MANDATORY,
    channels=("inbox", "email", *PUSH),
    push=PushContent(badge=True),
    label=_("Signed out by policy"),
    description=_("When signing in is restricted and you are signed out."),
    message=_("Signing in is restricted for the moment, so you were signed out."),
)
NOTIFICATION_SETTINGS_FORCED = declare_kind(
    "notification_settings_forced",
    audience=Field("user"),
    policy=Policy.MANDATORY,
    channels=("inbox",),
    label=_("Notification settings changed by staff"),
    description=_("When staff turn one of your notifications on or off for you, or let you choose again."),
    message=_("Staff changed one of your notification settings."),
)
ACCOUNT_CHANGES = {
    "password_changed": _("Your password was changed."),
    "password_set": _("A password was set on your account."),
    "email_changed": _("Your primary email address was changed."),
    "email_deleted": _("An email address was removed from your account."),
    "totp_activated": _("An authenticator app was turned on."),
    "totp_deactivated": _("An authenticator app was turned off."),
    "recovery_codes_generated": _("New recovery codes were made."),
    "webauthn_added": _("A passkey was added."),
    "webauthn_removed": _("A passkey was removed."),
    "account_connected": _("A sign-in provider was connected."),
    "account_disconnected": _("A sign-in provider was disconnected."),
}
# allauth already emails these, whatever anybody chooses; this puts them in the inbox too, unless turned off.
ACCOUNT_CHANGED = declare_kind(
    "account_changed",
    variants=tuple(ACCOUNT_CHANGES),
    audience=Field("user"),
    policy=Policy.DEFAULT_ON,
    channels=("inbox", *PUSH),
    push=PushContent(badge=True),
    label=_("Changes to your account, in your inbox"),
    description=_("Password, email, two-factor and sign-in provider changes."),
    message=lambda data, variant: ACCOUNT_CHANGES.get(variant, _("Something changed on your account.")),
)

# allauth's own mail: sent at once, as allauth sends it, and recorded beside everything else sent.
RECORDED_MAIL = {
    prefix: declare_kind(
        f"mail_{prefix.rsplit('/', 1)[-1]}",
        source=Source.RECORDED,
        # Kept out of the kinds people see (apps.notifications.visible_kinds), so its label is staff's alone.
        label=f"allauth mail: {prefix}",
    )
    for prefix in (
        "account/email/account_already_exists",
        "account/email/email_changed",
        "account/email/email_confirm",
        "account/email/email_confirmation",
        "account/email/email_confirmation_signup",
        "account/email/email_deleted",
        "account/email/login_code",
        "account/email/password_changed",
        "account/email/password_reset",
        "account/email/password_reset_code",
        "account/email/password_reset_key",
        "account/email/password_set",
        "account/email/unknown_account",
        "mfa/email/recovery_codes_generated",
        "mfa/email/totp_activated",
        "mfa/email/totp_deactivated",
        "mfa/email/webauthn_added",
        "mfa/email/webauthn_removed",
        "socialaccount/email/account_connected",
        "socialaccount/email/account_disconnected",
    )
}
