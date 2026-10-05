"""allauth's own headless routes for the views that carry an act, pointed at the subclasses that gate
them - included ahead of `allauth.headless.urls` (see urls.py), so these are the ones that resolve.

Read off allauth's patterns rather than written out again, so a route allauth moves or a client it
adds is followed here instead of silently left ungated. `test_reauthentication_gate.py` pins which
routes end up gated.
"""

from allauth.headless import urls as headless_urls
from django.urls import URLResolver, path

from apps.users.reauthentication.gate import ProvesWhoTheyAre
from apps.users.reauthentication.views.change_password import ChangePasswordView
from apps.users.reauthentication.views.manage_email import ManageEmailView
from apps.users.reauthentication.views.manage_phone import ManagePhoneView
from apps.users.reauthentication.views.manage_providers import ManageProvidersView
from apps.users.reauthentication.views.manage_recovery_codes import ManageRecoveryCodesView
from apps.users.reauthentication.views.manage_totp import ManageTOTPView
from apps.users.reauthentication.views.manage_webauthn import ManageWebAuthnView
from apps.users.reauthentication.views.provider_token import ProviderTokenView
from apps.users.reauthentication.views.redirect_to_provider import RedirectToProviderView
from apps.users.reauthentication.views.sessions import SessionsView


GATED_VIEWS = (
    ChangePasswordView,
    ManageEmailView,
    ManagePhoneView,
    ManageProvidersView,
    ManageRecoveryCodesView,
    ManageTOTPView,
    ManageWebAuthnView,
    ProviderTokenView,
    RedirectToProviderView,
    SessionsView,
)


def walk(patterns, prefix=""):
    """(route, callback) for every view under `patterns`, its route spelled out from the top."""
    for pattern in patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from walk(pattern.url_patterns, route)
        else:
            yield route, pattern.callback


def gated_headless_urlpatterns():
    # Each gated view's other base is the allauth view it stands in for; every headless route is one.
    replacing = {next(base for base in view.__bases__ if base is not ProvesWhoTheyAre): view for view in GATED_VIEWS}
    return [
        path(route, replacing[callback.view_class].as_api_view(**callback.view_initkwargs))
        for route, callback in walk(headless_urls.urlpatterns)
        if callback.view_class in replacing
    ]
