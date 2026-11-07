from rest_framework.routers import DefaultRouter


class AppRouter(DefaultRouter):
    """One app's routes, under its own namespace. Format suffixes kept, as the single router before it served
    them; the root view each would add is left out, since no app's listing is the API's."""

    include_root_view = False
