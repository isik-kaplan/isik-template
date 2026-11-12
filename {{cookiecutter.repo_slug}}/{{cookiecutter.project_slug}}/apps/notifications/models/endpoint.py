from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events
from isik.django.apps.notifications.audience import bases

from apps.common.models.base import primary_key
{%- if cookiecutter.webhooks == "users" %}
from apps.notifications.keys import user_key
{%- endif %}


# Registering or repointing one already asks for proof of who you are; this records who did it.
@track_events()
class Endpoint(bases.AbstractEndpoint):
    id = primary_key()
{%- if cookiecutter.webhooks == "users" %}
    owner = user_key("who registered it, and whose notices it receives", verbose_name=_("owner"))
{%- endif %}

    class Meta(bases.AbstractEndpoint.Meta):
        db_table = "notifications_endpoint"
        verbose_name = _("endpoint")
        verbose_name_plural = _("endpoints")
