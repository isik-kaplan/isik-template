"""How the API document describes an application's token: on the operations that take one, and nowhere else."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension

from apps.common.api.token_actions import takes_a_token


class ApplicationTokenScheme(OpenApiAuthenticationExtension):
    target_class = "apps.oauth_provider.authentication.ApplicationTokenAuthentication"
    name = "applicationToken"

    def get_security_requirement(self, auto_schema):
        if takes_a_token(auto_schema.view):
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
