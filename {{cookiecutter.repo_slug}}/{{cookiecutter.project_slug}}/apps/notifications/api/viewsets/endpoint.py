{% if cookiecutter.webhooks == "users" -%}
from django.contrib.auth import get_user_model
from django.utils.translation import gettext as _
from isik.django.apps.features.drf import HasFeature
from isik.django.apps.features.resolution import effective
{% endif -%}
from isik.django.apps.notifications import drf
{%- if cookiecutter.webhooks == "users" %}
from isik.django.drf.error_handling import refusal
{%- endif %}

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication
{%- if cookiecutter.webhooks == "users" %}
from apps.features.declarations import WEBHOOKS
{%- endif %}
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

    def get_permissions(self):
        # Registering one needs the feature; the ones somebody already has stay theirs to read and delete.
        if self.action == "create":
            return [*super().get_permissions(), HasFeature(WEBHOOKS)()]
        return super().get_permissions()

    def perform_create(self, serializer):
        # The owner's row is the lock, so two registrations at once can't both fit under the limit.
        owner = get_user_model()._default_manager.select_for_update().get(pk=self.request.user.pk)
        if self.owned_endpoints().count() >= effective(owner, "max_endpoints").value:
            raise refusal(_("You have as many webhook endpoints as you may."), code="endpoint_limit_reached")
        super().perform_create(serializer)
{%- endif %}
