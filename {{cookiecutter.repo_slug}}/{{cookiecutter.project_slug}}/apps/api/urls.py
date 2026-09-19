from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.users.api.viewsets.user import UserViewSet


router = DefaultRouter()
# basename is required explicitly: BaseModelViewSet has no class-level `.queryset` attribute
# (only a get_queryset() method), which is what DRF's router needs to auto-derive one.
router.register("users", UserViewSet, basename=UserViewSet.endpoint)

urlpatterns = [
    path("", include(router.urls)),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
