from apps.common.api.routers import AppRouter
from apps.users.api.viewsets.account_deletion import AccountDeletionViewSet
from apps.users.api.viewsets.personal_access_token import PersonalAccessTokenViewSet
from apps.users.api.viewsets.user import UserViewSet


app_name = "users"

router = AppRouter()
# Ahead of users/, so no route of theirs is tried on it first.
router.register("users/me", AccountDeletionViewSet, basename=AccountDeletionViewSet.endpoint)
# Explicit basename: BaseModelViewSet has no class-level `.queryset` to derive one from.
router.register("users", UserViewSet, basename=UserViewSet.endpoint)
router.register("personal-access-tokens", PersonalAccessTokenViewSet, basename=PersonalAccessTokenViewSet.endpoint)

urlpatterns = router.urls
