from django.urls import include, path


urlpatterns = [
    # Classic (non-headless) allauth urls are still needed for the actual OAuth provider redirect
    # target (allauth's SocialLoginView/SocialConnectView), even in HEADLESS_ONLY mode - the
    # provider itself redirects the browser here, not to a headless JSON endpoint.
    path("v0/provider-callback/", include("allauth.urls")),
    # Ahead of allauth's own, so the routes that carry an act resolve to the views that gate them.
    path("v0/", include("apps.users.reauthentication.urls")),
    path("v0/", include("allauth.headless.urls")),
]
