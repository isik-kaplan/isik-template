"""The gate is opt-in per view, so the exact set of gated writes is pinned both ways: a new unclassified
write route fails until somebody decides whether it is an act."""

from types import ModuleType

from django.urls import path
from isik.django.drf.coverage import CoverageStatus, ViewKind, request_policy_coverage
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.routers import SimpleRouter

from apps.common.api.reauthentication import ProvesWhoTheyAre as ViewSetProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication, RecentlyProvedWhoTheyAre
from apps.users.reauthentication.gate import ProvesWhoTheyAre as HeadlessProvesWhoTheyAre


# The admin is left out: it is behind its own login.
URLCONFS = ("{{ cookiecutter.project_slug }}.urls.api", "{{ cookiecutter.project_slug }}.urls.auth")

# view -> methods (allauth) or actions (DRF) that ask for a proof.
GATED = {
    # Setting a first password; changing one already demands the current one.
    "ChangePasswordView": {"POST"},
    "ManageEmailView": {"POST", "PATCH", "DELETE"},
    "ManagePhoneView": {"POST"},
    "ManageProvidersView": {"DELETE"},
    "RedirectToProviderView": {"POST"},
    "ProviderTokenView": {"POST"},
    "SessionsView": {"DELETE"},
    "ManageTOTPView": {"POST", "DELETE"},
    "ManageRecoveryCodesView": {"POST"},
    "ManageWebAuthnView": {"POST", "DELETE"},
    "ApplicationViewSet": {"create", "partial_update", "destroy", "rotate_secret"},
    "AuthorizedApplicationViewSet": {"destroy"},
    "ReviewedApplicationViewSet": {"approve"},
    "UserViewSet": {"partial_update"},
    # A token that acts as you is as good as a password.
    "PersonalAccessTokenViewSet": {"create"},
{%- if cookiecutter.webhooks != "none" %}
    # Where notices go, and the secret that proves they came from here.
    "EndpointViewSet": {"create", "update", "partial_update", "rotate_secret"},
{%- endif %}
}

# Together with GATED, the whole write surface.
NOT_AN_ACT = {
    ("ApplicationViewSet", "disable"): NoReauthentication(
        reason="switching your own application off only takes access away"
    ),
    ("ApplicationViewSet", "restore"): NoReauthentication(
        reason="switching it back on gives it no more than the approval it already had"
    ),
    (
        "ReviewedApplicationViewSet",
        "create",
    ): NoReauthentication(reason="refused outright: a superuser reviews applications here, not authors them"),
    ("ReviewedApplicationViewSet", "withdraw"): NoReauthentication(
        reason="taking an approval back only takes access away"
    ),
    ("AuthorizationView", "POST"): (
        NoReauthentication(
            reason="consenting to an application, the step the whole flow exists for - an application wanting a fresh "
            "sign-in asks with prompt=login"
        )
    ),
    ("RevokeTokenView", "POST"): NoReauthentication(reason="an application giving up a token it holds"),
    ("DeviceAuthorizationView", "POST"): NoReauthentication(
        reason="a device asking for a code to show, with no session involved at all"
    ),
    ("DeviceAuthorizationViewSet", "approve"): (
        NoReauthentication(reason="the same consent the authorize page asks for, which nobody signs in again to give")
    ),
    ("DeviceAuthorizationViewSet", "deny"): NoReauthentication(
        reason="turning a device away only refuses it access it never had"
    ),
    ("SettingViewSet", "partial_update"): NoReauthentication(
        reason="a setting guarding the account asks for proof itself, through its own request policies"
    ),
    ("DeviceViewSet", "create"): NoReauthentication(
        reason="the app registering the phone it's signed in on, at every start - it sends that phone the "
        "notices it already shows"
    ),
    ("DeviceViewSet", "destroy"): NoReauthentication(reason="forgetting a phone only stops pushes to it"),
    ("InboxViewSet", "read"): NoReauthentication(
        reason="marking your own notification read, which tells nobody anything"
    ),
    ("InboxViewSet", "read_all"): NoReauthentication(
        reason="marking your own notifications read, which tells nobody anything"
    ),
    ("SubscriptionViewSet", "create"): NoReauthentication(
        reason="which notifications you get, and a mandatory one can't be turned off"
    ),
    ("SubscriptionViewSet", "destroy"): NoReauthentication(
        reason="forgetting a choice, so the kind's own default decides again"
    ),
{%- if cookiecutter.webhooks != "none" %}
    ("DeliveryViewSet", "retry"): NoReauthentication(
        reason="sends a notice again to the endpoint it was already sent to"
    ),
    ("EndpointViewSet", "destroy"): NoReauthentication(reason="deleting an endpoint only stops what it was being sent"),
    ("EndpointViewSet", "finish_rotation"): NoReauthentication(
        reason="dropping the old secret only takes a signing key away"
    ),
    ("EndpointViewSet", "unpark"): NoReauthentication(reason="sends again to the address it was already registered at"),
{%- endif %}
    ("PersonalAccessTokenViewSet", "destroy"): NoReauthentication(
        reason="deleting a token only takes away the access it gave"
    ),
    ("TokenView", "POST"): NoReauthentication(
        reason="an application trading a code or refresh token, with no session involved at all"
    ),
    ("UserInfoView", "POST"): NoReauthentication(
        reason="an application reading the claims its token was granted, which changes nothing"
    ),
    ("AuthenticateView", "POST"): NoReauthentication(
        reason="the second factor of signing in, made before there is a session to protect"
    ),
    ("AuthenticateWebAuthnView", "POST"): NoReauthentication(
        reason="a passkey as the second factor of signing in, before there is a session"
    ),
    ("ConfirmLoginCodeView", "POST"): NoReauthentication(
        reason="a step of signing in, made before there is a session to protect"
    ),
    ("LoginView", "POST"): NoReauthentication(reason="signing in, which is how a session is earned in the first place"),
    ("ManageEmailView", "PUT"): NoReauthentication(
        reason="resends a verification mail to an address already on the account"
    ),
    ("ManageWebAuthnView", "PUT"): NoReauthentication(reason="renames a passkey already on the account"),
    ("ProveWithProviderView", "POST"): NoReauthentication(reason="sends somebody off to fetch the proof itself"),
    ("ProviderSignupView", "POST"): NoReauthentication(
        reason="finishing a social signup, made before there is an account to protect"
    ),
    ("ReauthenticateView", "POST"): NoReauthentication(
        reason="this is the proof itself, a password (or a second factor's code) again"
    ),
    ("ReauthenticateWebAuthnView", "POST"): NoReauthentication(reason="this is the proof itself, a passkey used again"),
    ("RefreshTokenView", "POST"): NoReauthentication(
        reason="renews the app's own token for the session it already holds"
    ),
    ("RequestPasswordResetView", "POST"): NoReauthentication(
        reason="mails a link to an address the account owns, proving nothing by itself"
    ),
    ("ResendEmailVerificationCodeView", "POST"): NoReauthentication(
        reason="resends a code during signup, before there is a session"
    ),
    ("ResendPhoneVerificationCodeView", "POST"): NoReauthentication(
        reason="resends a code during signup, before there is a session"
    ),
    ("ResetPasswordView", "POST"): NoReauthentication(
        reason="spends a key only the owner of the inbox could have read"
    ),
    ("SessionView", "DELETE"): NoReauthentication(reason="signing out, which only ever ends the session asking"),
    ("SignupView", "POST"): NoReauthentication(reason="creating an account, before there is one to protect"),
    ("UserViewSet", "update_me"): NoReauthentication(
        reason="a person's own name and language, neither of which grants anything"
    ),
    ("VerifyEmailView", "POST"): NoReauthentication(reason="spends a key only the owner of the inbox could have read"),
    ("VerifyPhoneView", "POST"): NoReauthentication(reason="spends a code only the owner of the phone could have read"),
}

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _classic_allauth(view):
    """Left out: under HEADLESS_ONLY they 404 or only finish a flow a gated headless redirect started."""
    module = view.__module__
    return module.startswith("allauth.") and not module.startswith("allauth.headless.")


def _gated_plain_view(routed):
    """allauth's views carry the gate as a mixin, which isik cannot read."""
    return (
        routed.kind is ViewKind.CLASS
        and issubclass(routed.view, HeadlessProvesWhoTheyAre)
        and routed.method in routed.view.reauthentication_methods
    )


def _is_write(routed):
    # A function's methods can't be read off it, so it is left to classify.
    if routed.kind is ViewKind.FUNCTION:
        return True
    # Methods outside http_method_names 405 before anything runs.
    return routed.method not in SAFE_METHODS and routed.method.lower() in routed.view.http_method_names


def _routed(urlconfs=URLCONFS):
    """{(view, method or action): gated} for every reachable write. A shadowed route is never served."""
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
    acts = {(view, method) for view, methods in GATED.items() for method in methods}

    unclassified = sorted(set(_routed()) - acts - set(NOT_AN_ACT))

    assert unclassified == []


def test_nothing_is_recorded_twice_or_about_a_route_that_is_gone():
    acts = {(view, method) for view, methods in GATED.items() for method in methods}

    assert sorted(acts & set(NOT_AN_ACT)) == []
    assert sorted(set(NOT_AN_ACT) - set(_routed())) == []


def test_every_reason_is_typed():
    """Held to the same floor as the viewsets' own reasons."""
    assert [key for key, reason in NOT_AN_ACT.items() if not isinstance(reason, NoReauthentication)] == []


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
    """The DRF half of the walk. DELETE is refused by `http_method_names`, so it is no act."""

    class SettingsViewSet(_Settings):
        http_method_names = ["get", "patch", "post"]

    assert _routed_alone(SettingsViewSet) == {
        ("SettingsViewSet", "partial_update"): True,
        ("SettingsViewSet", "ping"): True,
    }


def test_an_exempt_action_on_a_gated_viewset_is_not_counted_as_gated():
    class SettingsViewSet(_Settings):
        http_method_names = ["get", "post"]
        reauthentication_exempt_actions = {
            "ping": NoReauthentication(reason="answers with nothing about anybody, so it is no act")
        }

    assert _routed_alone(SettingsViewSet) == {("SettingsViewSet", "ping"): False}


def test_a_function_view_is_left_for_somebody_to_classify():
    """It lands outside both GATED and NOT_AN_ACT."""

    def ping(request):
        raise NotImplementedError

    assert _routed([_urlconf([path("ping/", ping)])]) == {("ping", None): False}
