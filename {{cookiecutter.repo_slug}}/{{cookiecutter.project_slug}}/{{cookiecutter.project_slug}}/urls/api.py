from django.urls import include, path


urlpatterns = [
    path("v0/", include("apps.api.urls")),
]
