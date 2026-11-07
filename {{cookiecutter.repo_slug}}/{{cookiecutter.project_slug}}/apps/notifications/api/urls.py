from apps.common.api.routers import AppRouter
{% if cookiecutter.webhooks != "none" -%}
from apps.notifications.api.viewsets.delivery import DeliveryViewSet
{% endif -%}
from apps.notifications.api.viewsets.device import DeviceViewSet
{% if cookiecutter.webhooks != "none" -%}
from apps.notifications.api.viewsets.endpoint import EndpointViewSet
{% endif -%}
from apps.notifications.api.viewsets.inbox import InboxViewSet
from apps.notifications.api.viewsets.notice_kind import NoticeKindViewSet
from apps.notifications.api.viewsets.subscription import SubscriptionViewSet


app_name = "notifications"

router = AppRouter()
router.register("notifications/inbox", InboxViewSet, basename=InboxViewSet.endpoint)
router.register("notifications/subscriptions", SubscriptionViewSet, basename=SubscriptionViewSet.endpoint)
router.register("notifications/kinds", NoticeKindViewSet, basename=NoticeKindViewSet.endpoint)
router.register("notifications/devices", DeviceViewSet, basename=DeviceViewSet.endpoint)
{%- if cookiecutter.webhooks != "none" %}
router.register("notifications/endpoints", EndpointViewSet, basename=EndpointViewSet.endpoint)
router.register("notifications/deliveries", DeliveryViewSet, basename=DeliveryViewSet.endpoint)
{%- endif %}

urlpatterns = router.urls
