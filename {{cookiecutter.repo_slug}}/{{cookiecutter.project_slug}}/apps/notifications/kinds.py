"""Every kind of notice this deployment can raise or record: a kind is a key and a protected row, so it is
named here rather than invented where it's raised."""

from isik.django.apps.notifications.audiences import Field
from isik.django.apps.notifications.choices import Policy
from isik.django.apps.notifications.kinds import Source, declare_kind


# What an owner hears of their own tokens and applications{% if cookiecutter.webhooks != "none" %}, which an endpoint may also be sent{% endif %}.
OWNER_CHANNELS = ("inbox", "email"{% if cookiecutter.webhooks != "none" %}, "webhook"{% endif %})

# Trigger-sourced: the database writes these, on the models that declare them.
TOKEN_CREATED = declare_kind("token_created")
TOKEN_REVOKED = declare_kind("token_revoked")
APPLICATION_REVIEWED = declare_kind("application_reviewed", variants=("approved", "withdrawn"))

# Raised by the application, for changes no row of ours shows.
SIGNED_OUT_BY_POLICY = declare_kind(
    "signed_out_by_policy", audience=Field("user"), policy=Policy.MANDATORY, channels=("inbox", "email")
)
# allauth already emails these, whatever anybody chooses; this puts them in the inbox too, unless turned off.
ACCOUNT_CHANGED = declare_kind(
    "account_changed",
    variants=(
        "password_changed",
        "password_set",
        "email_changed",
        "email_deleted",
        "totp_activated",
        "totp_deactivated",
        "recovery_codes_generated",
        "webauthn_added",
        "webauthn_removed",
        "account_connected",
        "account_disconnected",
    ),
    audience=Field("user"),
    policy=Policy.DEFAULT_ON,
    channels=("inbox",),
)

# allauth's own mail: sent at once, as allauth sends it, and recorded beside everything else sent.
RECORDED_MAIL = {
    prefix: declare_kind(f"mail_{prefix.rsplit('/', 1)[-1]}", source=Source.RECORDED)
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
