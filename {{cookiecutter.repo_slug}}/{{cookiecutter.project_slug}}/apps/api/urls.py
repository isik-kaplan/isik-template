from django.urls import include, path
from drf_spectacular.views import SpectacularRedocView, SpectacularSwaggerView
from isik.django.drf.schema_views import SpectacularAPIView


urlpatterns = [
    # One router per app, each its own namespace, so a route's name says which app serves it: users:users-list.
    path("", include("apps.users.api.urls")),
    path("", include("apps.oauth_provider.api.urls")),
    path("", include("apps.notifications.api.urls")),
    path("", include("apps.features.api.urls")),
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
    path("", include("apps.scheduling.api.urls")),
{%- endif %}
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
