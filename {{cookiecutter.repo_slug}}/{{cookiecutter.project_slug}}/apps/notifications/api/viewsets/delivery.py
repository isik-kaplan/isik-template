from isik.django.apps.notifications import drf
{%- if cookiecutter.webhooks == "staff" %}

from apps.notifications.api.deployment import DeploymentEndpoints
{%- endif %}


class DeliveryViewSet({% if cookiecutter.webhooks == "staff" %}DeploymentEndpoints, {% endif %}drf.DeliveryViewSet):
{%- if cookiecutter.webhooks == "staff" %}
    """What the deployment's webhook endpoints were sent, for staff, each with its attempts. retry/ sends an abandoned
    one again."""
{%- else %}
    """What the signed-in person's webhook endpoints were sent, each with its attempts. retry/ sends an abandoned one
    again."""
{%- endif %}

    endpoint = "notification-deliveries"
{%- if cookiecutter.webhooks == "users" %}
    owner_field = "owner"
{%- endif %}
