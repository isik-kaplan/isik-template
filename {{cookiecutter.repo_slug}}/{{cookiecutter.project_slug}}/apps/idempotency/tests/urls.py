from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.idempotency.tests.writable_users import WritableUserViewSet


router = DefaultRouter()
router.register("users", WritableUserViewSet, basename="writable-users")

urlpatterns = [path("v0/", include(router.urls))]
