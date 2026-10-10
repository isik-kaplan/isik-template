"""Proving, again, that somebody is who the session says they are.

allauth's own answer (`did_recently_authenticate`) is a window over the session's authentication
records rather than a proof, and it answers True outright for an account it has nothing to challenge
with - a social-only account, which is what every social signup here creates. So the answer is
built here instead, from the same records:

- a proof is a challenge that really happened in this session (a password or a second factor typed,
  or a fresh sign-in at a provider that says it challenged them), younger than
  `ACCOUNT_REAUTHENTICATION_TIMEOUT`;
- it is single-use: the act it was asked for spends it, and the next act asks again.
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


# On the session rather than the user: a proof belongs to the sign-in that earned it.
SPENT_AT_SESSION_KEY = "reauthentication_spent_at"

# What goes in allauth's stashed provider state when a bounce is a re-authentication rather than a
# login. The state travels as the OAuth `state` parameter against the session, so nobody outside the
# session can write it.
PROVING_KEY = "proving_who_they_are"
ASKED_AT_KEY = "asked_at"

# Records allauth writes for a login that typed something. A social login is absent on purpose: a
# provider session can sign somebody in again without asking them anything.
CHALLENGED_METHODS = frozenset({"password", "mfa"})

# The flows `ways_to_prove()` adds to allauth's own "reauthenticate"/"mfa_reauthenticate".
PROVIDER_FLOW = "provider_reauthenticate"
SET_PASSWORD_BY_EMAIL_FLOW = "set_password_by_email"

# The query parameters the prove page reads when a provider bounce comes back.
PROVED_PARAM = "proved"
ERROR_PARAM = "error"
NOT_PROVED_ERROR = "reauthentication_failed"


def proving_state():
    """The `data` to stash when sending somebody to their provider to prove themselves.

    Whole seconds, because `auth_time` is: a truncated claim compared against a fractional ask would
    refuse a sign-in that really did happen after it, whenever the two land in the same second.
    """
    return {PROVING_KEY: True, ASKED_AT_KEY: int(time.time())}


def is_proving(sociallogin):
    """Whether this provider round trip was a proof we asked for, rather than a login or a connect."""
    data = (sociallogin.state or {}).get("data") or {}
    return bool(data.get(PROVING_KEY))


def can_prove_with(provider):
    """Only an OpenID Connect provider can be held to a fresh challenge: asked for `max_age`, the
    spec requires it to say when it last authenticated the person (`auth_time`). Anything else can
    hand back a silent sign-in from a session opened days ago, which proves nothing."""
    return isinstance(provider, OpenIDConnectProvider)


def authenticated_at_provider(sociallogin):
    """When the provider says it last actually challenged them, from the `auth_time` claim.

    allauth keeps the id_token and userinfo claim sets apart under `extra_data`; the id_token comes
    first because its signature is verified.
    """
    extra_data = sociallogin.account.extra_data or {}
    for source in ("id_token", "userinfo"):
        claims = extra_data.get(source)
        claimed = claims.get("auth_time") if isinstance(claims, dict) else None
        if isinstance(claimed, int | float) and not isinstance(claimed, bool):
            return claimed
    return None


def record_a_fresh_assertion(request, sociallogin):
    """Whether this provider round trip proved the signed-in person is who the session says.

    Three statements, all about this one flow rather than about how recently anything happened:
    the identity that came back is the signed-in person's own, we asked (the stashed state says so),
    and the provider challenged them after we asked (`auth_time` says so). A provider that ignored
    the request for a fresh challenge, or sends no `auth_time`, cannot be held to anything.
    """
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
    """Where a proving round trip lands: the prove page it started from, told how it went."""
    params = {PROVED_PARAM: "1"} if proved else {ERROR_PARAM: NOT_PROVED_ERROR}
    return with_query(sociallogin.state["next"], params)


def with_query(url, params):
    parts = urlsplit(url)
    query = "&".join(part for part in (parts.query, urlencode(params)) if part)
    return urlunsplit(parts._replace(query=query))


def is_a_challenge(record):
    return bool(record.get("reauthenticated")) or record["method"] in CHALLENGED_METHODS


def has_proven_who_they_are(request):
    """Whether this request may do something serious right now - see the module docstring."""
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        return False
    spent_at = request.session.get(SPENT_AT_SESSION_KEY, -math.inf)
    now = time.time()
    return any(
        is_a_challenge(record)
        and record["at"] > spent_at
        and now - record["at"] < account_settings.REAUTHENTICATION_TIMEOUT
        for record in get_authentication_records(request)
    )


def spend_the_proof(request, act):
    """Single-use by default: the act it was asked for is the act it covers, and the next one asks
    again. Everything recorded up to now stops counting, so no record has to be removed.

    `act` is what the proof bought, which is the whole content of the line - that one was spent is
    already knowable from the demand before it."""
    request.session[SPENT_AT_SESSION_KEY] = time.time()
    log(REAUTHENTICATION_SPENT, user=str(request.user.pk), act=act)


def ways_to_prove(request):
    """Every way the signed-in person can prove themselves right now, in allauth's flow vocabulary.

    allauth's own flows first (a password, and a second factor once allauth.mfa is installed), then
    each connected provider that can be held to a fresh challenge. Somebody with no password is also
    offered setting one by email - the way back for an account whose only provider cannot prove
    anything, so nobody is left with no way through.
    """
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
