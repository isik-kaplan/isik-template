"""Proving again that somebody is who the session says.

Not allauth's `did_recently_authenticate`, which answers True outright for a social-only account. A proof
is a real re-authentication in this session (not a sign-in) younger than `ACCOUNT_REAUTHENTICATION_TIMEOUT`,
and is single-use.
"""

import math
import time
from urllib.parse import urlencode, urlsplit, urlunsplit

from allauth.account import app_settings as account_settings
from allauth.account.authentication import get_authentication_records
from allauth.account.internal.flows.login import record_authentication
from allauth.account.internal.flows.reauthentication import get_reauthentication_flows
from allauth.socialaccount.models import SocialAccount
from allauth.socialaccount.providers.openid_connect.provider import OpenIDConnectProvider

from apps.common.logging import REAUTHENTICATION_PROVED, REAUTHENTICATION_SPENT, log


# On the session: a proof belongs to the sign-in that earned it.
SPENT_AT_SESSION_KEY = "reauthentication_spent_at"

# Stashed provider state, bound to the session, so nobody outside it can write it.
PROVING_KEY = "proving_who_they_are"
ASKED_AT_KEY = "asked_at"

PROVIDER_FLOW = "provider_reauthenticate"
SET_PASSWORD_BY_EMAIL_FLOW = "set_password_by_email"

PROVED_PARAM = "proved"
ERROR_PARAM = "error"
NOT_PROVED_ERROR = "reauthentication_failed"


def proving_state():
    """Whole seconds, like `auth_time`, or a challenge in the same second would compare as earlier."""
    return {PROVING_KEY: True, ASKED_AT_KEY: int(time.time())}


def is_proving(sociallogin):
    data = (sociallogin.state or {}).get("data") or {}
    return bool(data.get(PROVING_KEY))


def can_prove_with(provider):
    """Only OIDC must report `auth_time`; anything else can return a silent sign-in from days ago."""
    return isinstance(provider, OpenIDConnectProvider)


def authenticated_at_provider(sociallogin):
    """The `auth_time` claim; id_token first, since its signature is verified."""
    extra_data = sociallogin.account.extra_data or {}
    for source in ("id_token", "userinfo"):
        claims = extra_data.get(source)
        claimed = claims.get("auth_time") if isinstance(claims, dict) else None
        if isinstance(claimed, int | float) and not isinstance(claimed, bool):
            return claimed
    return None


def record_a_fresh_assertion(request, sociallogin):
    """Proved when the identity is the signed-in person's and `auth_time` is after we asked."""
    user = request.user
    if not (user.is_authenticated and sociallogin.is_existing and sociallogin.user.pk == user.pk):
        return False
    challenged_at = authenticated_at_provider(sociallogin)
    if challenged_at is None or challenged_at < sociallogin.state["data"][ASKED_AT_KEY]:
        return False
    account = sociallogin.account
    record_authentication(
        request, user, "socialaccount", reauthenticated=True, provider=account.provider, uid=account.uid
    )
    log(REAUTHENTICATION_PROVED, user=str(user.pk), method="socialaccount")
    return True


def proof_outcome_url(sociallogin, proved):
    """Back to the prove page it started from, told how it went."""
    params = {PROVED_PARAM: "1"} if proved else {ERROR_PARAM: NOT_PROVED_ERROR}
    return with_query(sociallogin.state["next"], params)


def with_query(url, params):
    parts = urlsplit(url)
    query = "&".join(part for part in (parts.query, urlencode(params)) if part)
    return urlunsplit(parts._replace(query=query))


def is_a_challenge(record):
    # A login's record is never marked, whatever was typed for it.
    return bool(record.get("reauthenticated"))


def has_proven_who_they_are(request):
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        return False
    spent_at = request.session.get(SPENT_AT_SESSION_KEY, -math.inf)
    now = time.time()
    return any(
        is_a_challenge(record)
        and record["at"] > spent_at
        and now - record["at"] < account_settings.REAUTHENTICATION_TIMEOUT
        for record in get_authentication_records(request, request.user)
    )


def spend_the_proof(request, act):
    """Everything recorded up to now stops counting, so no record has to be removed."""
    request.session[SPENT_AT_SESSION_KEY] = time.time()
    log(REAUTHENTICATION_SPENT, user=str(request.user.pk), act=act)


def ways_to_prove(request):
    """In allauth's flow vocabulary. Without a password, setting one by email is offered, so nobody is
    left with no way through."""
    user = request.user
    flows = get_reauthentication_flows(user)
    providers = []
    for account in SocialAccount.objects.filter(user=user):
        provider = account.get_provider()
        if can_prove_with(provider):
            providers.append({"id": account.provider, "name": provider.name})
    if providers:
        flows.append({"id": PROVIDER_FLOW, "providers": providers})
    if not user.has_usable_password() and user.email:
        flows.append({"id": SET_PASSWORD_BY_EMAIL_FLOW, "email": user.email})
    return flows
