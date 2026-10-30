from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.features.api.viewsets.feature import FeatureViewSet
from apps.features.api.viewsets.setting import SettingViewSet
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
from apps.oauth_provider.api.viewsets.application import ApplicationViewSet
from apps.oauth_provider.api.viewsets.authorized_application import AuthorizedApplicationViewSet
from apps.oauth_provider.api.viewsets.device_authorization import DeviceAuthorizationViewSet
from apps.oauth_provider.api.viewsets.reviewed_application import ReviewedApplicationViewSet
from apps.users.api.viewsets.personal_access_token import PersonalAccessTokenViewSet
from apps.users.api.viewsets.user import UserViewSet


router = DefaultRouter()
# Explicit basename: BaseModelViewSet has no class-level `.queryset` to derive one from.
router.register("users", UserViewSet, basename=UserViewSet.endpoint)
router.register("personal-access-tokens", PersonalAccessTokenViewSet, basename=PersonalAccessTokenViewSet.endpoint)
# Registered whatever the mode, so the API document does not change with an environment variable.
router.register("oauth-applications", ApplicationViewSet, basename=ApplicationViewSet.endpoint)
router.register("oauth-application-reviews", ReviewedApplicationViewSet, basename=ReviewedApplicationViewSet.endpoint)
router.register("authorized-applications", AuthorizedApplicationViewSet, basename="authorized-applications")
router.register("device-authorizations", DeviceAuthorizationViewSet, basename="device-authorizations")
router.register("notifications/inbox", InboxViewSet, basename=InboxViewSet.endpoint)
router.register("notifications/subscriptions", SubscriptionViewSet, basename=SubscriptionViewSet.endpoint)
router.register("notifications/kinds", NoticeKindViewSet, basename=NoticeKindViewSet.endpoint)
router.register("notifications/devices", DeviceViewSet, basename=DeviceViewSet.endpoint)
router.register("features", FeatureViewSet, basename=FeatureViewSet.endpoint)
router.register("settings", SettingViewSet, basename=SettingViewSet.endpoint)
{%- if cookiecutter.webhooks != "none" %}
router.register("notifications/endpoints", EndpointViewSet, basename=EndpointViewSet.endpoint)
router.register("notifications/deliveries", DeliveryViewSet, basename=DeliveryViewSet.endpoint)
{%- endif %}

urlpatterns = [
    path("", include(router.urls)),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
