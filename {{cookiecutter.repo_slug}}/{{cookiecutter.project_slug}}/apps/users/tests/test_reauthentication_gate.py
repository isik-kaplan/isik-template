"""Which routed writes ask somebody to prove who they are, pinned against the acts in writing.

The gate is opt-in per view, so what is asserted is the exact set, both ways: an act that stops being
gated fails here, and a write route nobody has classified - a new viewset, an allauth upgrade adding
an endpoint, allauth.mfa being installed - fails until somebody decides whether it is an act.
"""

from django.urls import URLResolver, get_resolver

from apps.common.api.reauthentication import ProvesWhoTheyAre as ViewSetProvesWhoTheyAre
from apps.common.api.request_policies import RecentlyProvedWhoTheyAre
from apps.users.reauthentication.gate import ProvesWhoTheyAre as HeadlessProvesWhoTheyAre


URLCONFS = ("{{ cookiecutter.project_slug }}.urls.api", "{{ cookiecutter.project_slug }}.urls.auth")

# Included urlconfs left out of the write surface, and why.
NOT_WALKED = {
    # allauth's classic provider endpoints: under HEADLESS_ONLY a provider's login view answers 404,
    # its callback only finishes a flow a headless redirect started (gated where that is a connect),
    # and a token login is a login. Which of them exist depends on the providers a project enables.
    "allauth.urls",
}

# view -> the methods (allauth's views) or actions (DRF viewsets) on it that ask for a proof.
GATED = {
    # Setting a first password; changing one already demands the current one (see the view).
    "ChangePasswordView": {"POST"},
    # Adding, removing and making primary decide where a password reset is sent.
    "ManageEmailView": {"POST", "PATCH", "DELETE"},
    "ManagePhoneView": {"POST"},
    # Disconnecting a provider, and connecting one through either door.
    "ManageProvidersView": {"DELETE"},
    "RedirectToProviderView": {"POST"},
    "ProviderTokenView": {"POST"},
    # Ending somebody's other sessions.
    "SessionsView": {"DELETE"},
    # Turning a second factor on or off, a fresh set of recovery codes, and adding or removing a passkey.
    "ManageTOTPView": {"POST", "DELETE"},
    "ManageRecoveryCodesView": {"POST"},
    "ManageWebAuthnView": {"POST", "DELETE"},
}

# Every routed write that is not an act, and the reason. Together with GATED this accounts for the
# whole write surface - the half a per-view opt-in cannot give on its own.
NOT_AN_ACT = {
    ("AuthenticateView", "POST"): "the second factor of signing in, made before there is a session to protect",
    ("AuthenticateWebAuthnView", "POST"): "a passkey as the second factor of signing in, before there is a session",
    ("ConfirmLoginCodeView", "POST"): "a step of signing in, made before there is a session to protect",
    ("LoginView", "POST"): "signing in, which is how a session is earned in the first place",
    ("ManageEmailView", "PUT"): "resends a verification mail to an address already on the account",
    ("ManageWebAuthnView", "PUT"): "renames a passkey already on the account",
    ("ProveWithProviderView", "POST"): "sends somebody off to fetch the proof itself",
    ("ProviderSignupView", "POST"): "finishing a social signup, made before there is an account to protect",
    ("ReauthenticateView", "POST"): "this is the proof itself, a password (or a second factor's code) again",
    ("ReauthenticateWebAuthnView", "POST"): "this is the proof itself, a passkey used again",
    ("RefreshTokenView", "POST"): "renews the app's own token for the session it already holds",
    ("RequestPasswordResetView", "POST"): "mails a link to an address the account owns, proving nothing by itself",
    ("ResendEmailVerificationCodeView", "POST"): "resends a code during signup, before there is a session",
    ("ResendPhoneVerificationCodeView", "POST"): "resends a code during signup, before there is a session",
    ("ResetPasswordView", "POST"): "spends a key only the owner of the inbox could have read",
    ("SessionView", "DELETE"): "signing out, which only ever ends the session asking",
    ("SignupView", "POST"): "creating an account, before there is one to protect",
    ("UserViewSet", "create"): "refused for everybody by the read-only default permission",
    ("UserViewSet", "destroy"): "refused for everybody by the read-only default permission",
    ("UserViewSet", "update_me"): "a person's own name and language, neither of which grants anything",
    ("UserViewSet", "partial_update"): "refused for everybody by the read-only default permission",
    ("UserViewSet", "update"): "refused for everybody by the read-only default permission",
    ("VerifyEmailView", "POST"): "spends a key only the owner of the inbox could have read",
    ("VerifyPhoneView", "POST"): "spends a code only the owner of the phone could have read",
}

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _walk(patterns, prefix=""):
    for pattern in patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            # include() of a dotted path keeps the imported module; one of a plain list keeps the list.
            if getattr(pattern.urlconf_name, "__name__", None) not in NOT_WALKED:
                yield from _walk(pattern.url_patterns, route)
        else:
            yield route, pattern.callback


def _writes_of(callback):
    """(view, method or action, gated) for each write `callback` answers."""
    viewset = getattr(callback, "cls", None)
    actions = getattr(callback, "actions", None)
    if actions is not None:
        exempt = getattr(viewset, "reauthentication_exempt_actions", {})
        for method, action in actions.items():
            # A router registers every method on every viewset, and Django answers 405 to the ones the
            # viewset refuses before anything runs - those are not acts anybody can perform.
            if method.upper() not in SAFE_METHODS and method in viewset.http_method_names:
                gated = issubclass(viewset, ViewSetProvesWhoTheyAre) and action not in exempt
                yield viewset.__name__, action, gated
        return
    view = getattr(callback, "view_class", None) or viewset
    for method in view.http_method_names:
        if method.upper() not in SAFE_METHODS and hasattr(view, method):
            gated = issubclass(view, HeadlessProvesWhoTheyAre) and method.upper() in view.reauthentication_methods
            yield view.__name__, method.upper(), gated


def _routed():
    """{(view, method or action): gated} for every write a caller can reach, across both hosts.

    A route seen twice resolves to the first pattern only, which is how the gated allauth views stand
    in for allauth's own - the shadowed one is never served, so it is not part of the surface.
    """
    found = {}
    for urlconf in URLCONFS:
        seen = set()
        for route, callback in _walk(get_resolver(urlconf).url_patterns):
            if route in seen:
                continue
            seen.add(route)
            for view, method, gated in _writes_of(callback):
                found[(view, method)] = gated
    return found


def test_exactly_the_acts_are_gated():
    gated = {}
    for (view, method), is_gated in _routed().items():
        if is_gated:
            gated.setdefault(view, set()).add(method)

    assert gated == GATED


def test_every_write_is_either_an_act_or_recorded_as_not_one():
    """The half an opt-in mixin cannot give: a view that holds an act and forgets the gate altogether
    would otherwise pass every test here."""
    acts = {(view, method) for view, methods in GATED.items() for method in methods}

    unclassified = sorted(set(_routed()) - acts - set(NOT_AN_ACT))

    assert unclassified == []


def test_nothing_is_recorded_twice_or_about_a_route_that_is_gone():
    acts = {(view, method) for view, methods in GATED.items() for method in methods}

    assert sorted(acts & set(NOT_AN_ACT)) == []
    assert sorted(set(NOT_AN_ACT) - set(_routed())) == []


def test_every_reason_is_a_sentence():
    """A reason somebody typed to get past the test is not a decision."""
    for reason in NOT_AN_ACT.values():
        assert len(reason.split()) >= 4, reason


def test_a_viewset_gated_through_the_policy_is_counted_as_gated():
    """The DRF half of the walk, which the generated project has no act for yet - so a viewset that
    opts in is not silently counted as ungated the day one is added."""

    class Callback:
        cls = type("SettingsViewSet", (ViewSetProvesWhoTheyAre,), {"http_method_names": ["get", "patch"]})
        actions = {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}

    assert list(_writes_of(Callback)) == [("SettingsViewSet", "partial_update", True)]
    assert RecentlyProvedWhoTheyAre in Callback.cls.request_policies


def test_an_exempt_action_on_a_gated_viewset_is_not_counted_as_gated():
    class Callback:
        cls = type(
            "SettingsViewSet",
            (ViewSetProvesWhoTheyAre,),
            {"http_method_names": ["post"], "reauthentication_exempt_actions": {"ping": "says nothing about anybody"}},
        )
        actions = {"post": "ping"}

    assert list(_writes_of(Callback)) == [("SettingsViewSet", "ping", False)]
