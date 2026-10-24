"""Personal access token auth, shown only on the operations that take one."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension

from apps.common.api.token_actions import takes_a_token


class PersonalAccessTokenScheme(OpenApiAuthenticationExtension):
    target_class = "apps.users.authentication.PersonalAccessTokenAuthentication"
    name = "personalAccessToken"

    def get_security_requirement(self, auto_schema):
        if takes_a_token(auto_schema.view):
            return {self.name: []}
        return None

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "description": (
                "A personal access token somebody made for themselves on their profile, acting as them within "
                "the scopes they gave it."
            ),
        }
