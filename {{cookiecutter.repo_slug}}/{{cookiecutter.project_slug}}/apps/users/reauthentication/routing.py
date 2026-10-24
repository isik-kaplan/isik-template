"""allauth's headless routes pointed at the gated subclasses; included first so these resolve.

Read off allauth's patterns, so a moved or added route isn't silently left ungated.
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
    """(full route, callback) for every view under `patterns`."""
    for pattern in patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from walk(pattern.url_patterns, route)
        else:
            yield route, pattern.callback


def gated_headless_urlpatterns():
    # Each gated view's other base is the allauth view it replaces.
    replacing = {next(base for base in view.__bases__ if base is not ProvesWhoTheyAre): view for view in GATED_VIEWS}
    return [
        path(route, replacing[callback.view_class].as_api_view(**callback.view_initkwargs))
        for route, callback in walk(headless_urls.urlpatterns)
        if callback.view_class in replacing
    ]
