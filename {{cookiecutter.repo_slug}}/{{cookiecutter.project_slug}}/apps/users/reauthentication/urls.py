from django.urls import path

from apps.users.reauthentication.routing import gated_headless_urlpatterns
from apps.users.reauthentication.views.prove_with_provider import ProveWithProviderView


urlpatterns = [
    *gated_headless_urlpatterns(),
    path("browser/v1/auth/provider/reauthenticate", ProveWithProviderView.as_view(), name="prove_with_provider"),
]
