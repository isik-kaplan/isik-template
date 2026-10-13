"""How the API document describes an application's token: on the operations that take one, and nowhere else."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class ApplicationTokenScheme(OpenApiAuthenticationExtension):
    target_class = "apps.oauth_provider.authentication.ApplicationTokenAuthentication"
    name = "applicationToken"

    def get_security_requirement(self, auto_schema):
        view = auto_schema.view
        if getattr(view, "action", None) in getattr(view, "application_token_actions", ()):
            return {self.name: []}
        return None

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "description": (
                "An access token an application was given at the authorization server's /o/token/, acting for "
                "whoever let it in and only within the scopes they let it have."
            ),
        }
