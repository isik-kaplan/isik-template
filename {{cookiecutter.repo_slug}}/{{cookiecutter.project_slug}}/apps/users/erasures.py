"""A person's rows, model by model, for deleting their account (ISIK['DJANGO']['ACCOUNTS']['ERASURES']).

Erasing deletes all of them anyway, by cascade. These say what anonymizing does: the account stays as a
tombstone with these fields cleared, and the rows below go, since each is the person or a way in as them.
Their groups and permissions, admin.LogEntry, and feature grants stay with the tombstone, which can no longer
sign in: they say what was done, and hold nothing personal.
"""

from isik.django.apps.accounts.erasures import erasure

from apps.users.models.user import User


erasure(
    User,
    anonymize={
        # Still unique, and .invalid can never be delivered to.
        "email": lambda user: f"deleted-{user.pk}@example.invalid",
        "username": None,
        "first_name": "",
        "last_name": "",
{%- if cookiecutter.phone != "none" %}
        "phone": None,
        "phone_verified": False,
{%- endif %}
        "language": "",
    },
)

for label in (
    "account.EmailAddress",
    "socialaccount.SocialAccount",
    "mfa.Authenticator",
    "usersessions.UserSession",
    "users.PersonalAccessToken",
    "oauth2_provider.AccessToken",
    "oauth2_provider.RefreshToken",
    "oauth2_provider.IDToken",
    "oauth2_provider.Grant",
    "oauth2_provider.DeviceGrant",
    "oauth_provider.Application",
{%- if cookiecutter.webhooks == "users" %}
    "notifications.Endpoint",
{%- endif %}
):
    erasure(label, delete=True)

erasure("common.IdempotencyClaim", via="claimed_by", delete=True)
