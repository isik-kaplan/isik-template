from isik.django.apps.notifications import drf

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication
{%- if cookiecutter.webhooks == "staff" %}
from apps.notifications.api.deployment import DeploymentEndpoints
{%- endif %}


class EndpointViewSet({% if cookiecutter.webhooks == "staff" %}DeploymentEndpoints, {% endif %}ProvesWhoTheyAre, drf.EndpointViewSet):
{%- if cookiecutter.webhooks == "staff" %}
    """The deployment's webhook endpoints, for staff: each is sent the notices of the kinds it wants, signed with its
    secret, which is shown once."""
{%- else %}
    """The signed-in person's webhook endpoints: each is sent their notices of the kinds it wants, signed with its
    secret, which is shown once."""
{%- endif %}

    endpoint = "notification-endpoints"
    reauthentication_exempt_actions = {
        "list": NoReauthentication(reason="reading the endpoints takes nothing from anybody at all"),
        "retrieve": NoReauthentication(reason="reading an endpoint takes nothing from anybody at all"),
        "destroy": NoReauthentication(reason="deleting an endpoint only stops what it was being sent"),
        "finish_rotation": NoReauthentication(reason="dropping the old secret only takes a signing key away"),
        "unpark": NoReauthentication(reason="sends again to the address it was already registered at"),
    }
{%- if cookiecutter.webhooks == "users" %}
    owner_field = "owner"
{%- endif %}
