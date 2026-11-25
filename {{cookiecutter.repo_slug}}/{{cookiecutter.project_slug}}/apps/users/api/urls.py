from django.urls import path

from apps.common.api.routers import AppRouter
from apps.users.api.viewsets.account_deletion import AccountDeletionViewSet
from apps.users.api.viewsets.group import GroupViewSet
from apps.users.api.viewsets.personal_access_token import PersonalAccessTokenViewSet
from apps.users.api.viewsets.site_settings import SiteSettingsViewSet
from apps.users.api.viewsets.user import UserViewSet


app_name = "users"

router = AppRouter()
# Ahead of users/, so no route of theirs is tried on it first.
router.register("users/me", AccountDeletionViewSet, basename=AccountDeletionViewSet.endpoint)
# Explicit basename: BaseModelViewSet has no class-level `.queryset` to derive one from.
router.register("users", UserViewSet, basename=UserViewSet.endpoint)
router.register("groups", GroupViewSet, basename=GroupViewSet.endpoint)
router.register("personal-access-tokens", PersonalAccessTokenViewSet, basename=PersonalAccessTokenViewSet.endpoint)

urlpatterns = [
    *router.urls,
    path(
        "site-settings/",
        SiteSettingsViewSet.as_view({"get": "current", "patch": "update_current"}),
        name=f"{SiteSettingsViewSet.endpoint}-current",
    ),
]
