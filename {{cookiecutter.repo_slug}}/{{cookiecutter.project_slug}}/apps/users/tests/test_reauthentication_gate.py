"""Which routed writes ask somebody to prove who they are, pinned against the acts in writing.

The gate is opt-in per view, so what is asserted is the exact set, both ways: an act that stops being
gated fails here, and a write route nobody has classified - a new viewset, an allauth upgrade adding
an endpoint, allauth.mfa being installed - fails until somebody decides whether it is an act.
"""

from types import ModuleType

from django.urls import path
from isik.django.drf.coverage import CoverageStatus, ViewKind, request_policy_coverage
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.routers import SimpleRouter

from apps.common.api.reauthentication import ProvesWhoTheyAre as ViewSetProvesWhoTheyAre
from apps.common.api.request_policies import RecentlyProvedWhoTheyAre
from apps.users.reauthentication.gate import ProvesWhoTheyAre as HeadlessProvesWhoTheyAre


# The two hosts a signed-in person acts through. The admin is staff's own surface, behind its own login.
URLCONFS = ("{{ cookiecutter.project_slug }}.urls.api", "{{ cookiecutter.project_slug }}.urls.auth")

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


def _classic_allauth(view):
    """allauth's classic provider endpoints, left out of the write surface: under HEADLESS_ONLY a
    provider's login view answers 404, its callback only finishes a flow a headless redirect started
    (gated where that is a connect), and a token login is a login. Which of them exist depends on the
    providers a project enables."""
    module = view.__module__
    return module.startswith("allauth.") and not module.startswith("allauth.headless.")


def _gated_plain_view(routed):
    """What isik cannot read off a view that is not DRF's: allauth's views carry the gate as a mixin."""
    return (
        routed.kind is ViewKind.CLASS
        and issubclass(routed.view, HeadlessProvesWhoTheyAre)
        and routed.method in routed.view.reauthentication_methods
    )


def _is_write(routed):
    # Which methods a function answers cannot be read off it, so one is left for somebody to classify.
    if routed.kind is ViewKind.FUNCTION:
        return True
    # A router registers every method on every viewset, and Django answers 405 to the ones the viewset
    # refuses before anything runs - those are not acts anybody can perform.
    return routed.method not in SAFE_METHODS and routed.method.lower() in routed.view.http_method_names


def _routed(urlconfs=URLCONFS):
    """{(view, method or action): gated} for every write a caller can reach, across both hosts.

    A route seen twice resolves to the first pattern only, which is how the gated allauth views stand
    in for allauth's own - the shadowed one is never served, so it is not part of the surface.
    """
    found, served = {}, {}
    for entry in request_policy_coverage(RecentlyProvedWhoTheyAre, list(urlconfs), plain_views=_gated_plain_view):
        routed = entry.routed
        if served.setdefault((routed.urlconf, routed.route), routed.view) is not routed.view:
            continue
        if not _classic_allauth(routed.view) and _is_write(routed):
            found[(routed.view.__name__, routed.action or routed.method)] = entry.status is CoverageStatus.COVERED
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


def _urlconf(patterns):
    urlconf = ModuleType("urlconf")
    urlconf.urlpatterns = patterns
    return urlconf


def _routed_alone(viewset):
    router = SimpleRouter()
    router.register("settings", viewset, basename="settings")
    return _routed([_urlconf(router.urls)])


class _Settings(ViewSetProvesWhoTheyAre, viewsets.ViewSet):
    def retrieve(self, request, pk=None):
        raise NotImplementedError

    def partial_update(self, request, pk=None):
        raise NotImplementedError

    def destroy(self, request, pk=None):
        raise NotImplementedError

    @action(detail=False, methods=["post"])
    def ping(self, request):
        raise NotImplementedError


def test_a_viewset_gated_through_the_policy_is_counted_as_gated():
    """The DRF half of the walk, which the generated project has no act for yet - so a viewset that
    opts in is not silently counted as ungated the day one is added. DELETE is refused by
    `http_method_names` before anything runs, so it is no act."""

    class SettingsViewSet(_Settings):
        http_method_names = ["get", "patch", "post"]

    assert _routed_alone(SettingsViewSet) == {
        ("SettingsViewSet", "partial_update"): True,
        ("SettingsViewSet", "ping"): True,
    }


def test_an_exempt_action_on_a_gated_viewset_is_not_counted_as_gated():
    class SettingsViewSet(_Settings):
        http_method_names = ["get", "post"]
        reauthentication_exempt_actions = {"ping": "says nothing about anybody"}

    assert _routed_alone(SettingsViewSet) == {("SettingsViewSet", "ping"): False}


def test_a_function_view_is_left_for_somebody_to_classify():
    """isik cannot tell which methods a function answers, so it lands outside both GATED and NOT_AN_ACT."""

    def ping(request):
        raise NotImplementedError

    assert _routed([_urlconf([path("ping/", ping)])]) == {("ping", None): False}
