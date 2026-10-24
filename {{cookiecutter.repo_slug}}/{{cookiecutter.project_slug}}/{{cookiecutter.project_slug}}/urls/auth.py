from django.urls import include, path


urlpatterns = [
    # Classic allauth urls, even headless: the OAuth provider redirects the browser here.
    path("v0/provider-callback/", include("allauth.urls")),
    # Ahead of allauth's own, so the gated routes resolve to the gating views.
    path("v0/", include("apps.users.reauthentication.urls")),
    path("v0/", include("allauth.headless.urls")),
    # Every route 404s while the provider is off.
    path("o/", include("apps.oauth_provider.urls")),
]
