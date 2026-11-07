from apps.common.api.routers import AppRouter
from apps.users.api.viewsets.personal_access_token import PersonalAccessTokenViewSet
from apps.users.api.viewsets.user import UserViewSet


app_name = "users"

router = AppRouter()
# Explicit basename: BaseModelViewSet has no class-level `.queryset` to derive one from.
router.register("users", UserViewSet, basename=UserViewSet.endpoint)
router.register("personal-access-tokens", PersonalAccessTokenViewSet, basename=PersonalAccessTokenViewSet.endpoint)

urlpatterns = router.urls
