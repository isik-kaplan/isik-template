from apps.common.api.routers import AppRouter
from apps.features.api.viewsets.feature import FeatureViewSet
from apps.features.api.viewsets.setting import SettingViewSet


app_name = "features"

router = AppRouter()
router.register("features", FeatureViewSet, basename=FeatureViewSet.endpoint)
router.register("settings", SettingViewSet, basename=SettingViewSet.endpoint)

urlpatterns = router.urls
