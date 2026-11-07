from apps.common.api.routers import AppRouter
from apps.oauth_provider.api.viewsets.application import ApplicationViewSet
from apps.oauth_provider.api.viewsets.authorized_application import AuthorizedApplicationViewSet
from apps.oauth_provider.api.viewsets.device_authorization import DeviceAuthorizationViewSet
from apps.oauth_provider.api.viewsets.reviewed_application import ReviewedApplicationViewSet


app_name = "oauth_provider"

router = AppRouter()
# Registered whatever the mode, so the API document does not change with an environment variable.
router.register("oauth-applications", ApplicationViewSet, basename=ApplicationViewSet.endpoint)
router.register("oauth-application-reviews", ReviewedApplicationViewSet, basename=ReviewedApplicationViewSet.endpoint)
router.register("authorized-applications", AuthorizedApplicationViewSet, basename="authorized-applications")
router.register("device-authorizations", DeviceAuthorizationViewSet, basename="device-authorizations")

urlpatterns = router.urls
