"""SCOPES_BACKEND_CLASS: what an application may ever ask for."""

from oauth2_provider.scopes import BaseScopes, SettingsScopes

from apps.users.permissions import VOCABULARY


class TokenScopes(BaseScopes):
    """The sign-in scopes in SCOPES for every application, and the delegatable permissions for the one a
    superuser approved them for - under the same names, so a token's scopes are permission names."""

    def __init__(self):
        self._settings_scopes = SettingsScopes()

    def get_all_scopes(self):
        """Every scope that could appear anywhere, with what it means, for the consent page."""
        return {
            **self._settings_scopes.get_all_scopes(),
            **{str(declaration): declaration.label for declaration in VOCABULARY.delegatable()},
        }

    def get_available_scopes(self, application=None, request=None, *args, **kwargs):
        """With no application - discovery, the API document - only the sign-in scopes: nothing else is
        anybody's to ask for until a superuser says so for one application."""
        # SettingsScopes answers from the settings alone, whatever it is asked about.
        sign_in = self._settings_scopes.get_available_scopes()
        if application is None:
            return sign_in
        return [*sign_in, *application.approved_scopes.values_list("codename", flat=True).order_by("codename")]

    def get_default_scopes(self, application=None, request=None, *args, **kwargs):
        return self._settings_scopes.get_default_scopes()
