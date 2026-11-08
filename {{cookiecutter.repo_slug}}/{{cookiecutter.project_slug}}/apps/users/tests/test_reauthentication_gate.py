"""The gate is opt-in per act, so the exact set of gated writes is pinned here: a write nobody declares
passes ungated, and that is deliberate."""

from types import ModuleType

from django.urls import path
from isik.django.drf.coverage import CoverageStatus, ViewKind, request_policy_coverage
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.routers import SimpleRouter

from apps.common.api.reauthentication import ProvesWhoTheyAre as ViewSetProvesWhoTheyAre
from apps.common.api.request_policies import RecentlyProvedWhoTheyAre
from apps.users.reauthentication.gate import ProvesWhoTheyAre as HeadlessProvesWhoTheyAre


# The admin is left out: it is behind its own login.
URLCONFS = ("{{ cookiecutter.project_slug }}.urls.api", "{{ cookiecutter.project_slug }}.urls.auth")

# view -> methods (allauth) or actions (DRF) that ask for a proof.
GATED = {
    # Setting a first password; changing one already demands the current one.
    "ChangePasswordView": {"POST"},
    "ManageEmailView": {"POST", "PATCH", "DELETE"},
{%- if cookiecutter.phone != "none" %}
    "ManagePhoneView": {"POST"},
{%- endif %}
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


def _gated(entry):
    # isik reads the policy off the viewset, not which of its actions are declared acts.
    action = entry.routed.action
    covered = entry.status is CoverageStatus.COVERED
    return covered if action is None else covered and action in entry.routed.view.reauthentication_acts


def _routed(urlconfs=URLCONFS):
    """{(view, method or action): gated} for every reachable write. A shadowed route is never served."""
    found, served = {}, {}
    for entry in request_policy_coverage(RecentlyProvedWhoTheyAre, list(urlconfs), plain_views=_gated_plain_view):
        routed = entry.routed
        if served.setdefault((routed.urlconf, routed.route), routed.view) is not routed.view:
            continue
        if not _classic_allauth(routed.view) and _is_write(routed):
            found[(routed.view.__name__, routed.action or routed.method)] = _gated(entry)
    return found


def test_exactly_the_acts_are_gated():
    gated = {}
    for (view, method), is_gated in _routed().items():
        if is_gated:
            gated.setdefault(view, set()).add(method)

    assert gated == GATED


def _urlconf(patterns):
    urlconf = ModuleType("urlconf")
    urlconf.urlpatterns = patterns
    return urlconf


def _routed_alone(viewset):
    router = SimpleRouter()
    router.register("settings", viewset, basename="settings")
    return _routed([_urlconf(router.urls)])


class _Settings(ViewSetProvesWhoTheyAre, viewsets.ViewSet):
    reauthentication_acts = {"partial_update": None, "ping": None}

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


def test_an_undeclared_write_on_a_gated_viewset_is_not_counted_as_gated():
    class SettingsViewSet(_Settings):
        http_method_names = ["get", "post"]
        reauthentication_acts = {}

    assert _routed_alone(SettingsViewSet) == {("SettingsViewSet", "ping"): False}


def test_a_function_view_is_not_counted_as_gated():
    """isik can't read a function's methods, so it is walked as a write the gate never sees."""

    def ping(request):
        raise NotImplementedError

    assert _routed([_urlconf([path("ping/", ping)])]) == {("ping", None): False}
