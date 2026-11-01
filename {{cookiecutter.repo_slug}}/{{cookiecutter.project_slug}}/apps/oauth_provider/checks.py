from django.core.checks import Error, register

from apps.oauth_provider import urls


@register()
def every_toolkit_route_is_decided(app_configs, **kwargs):
    """Both directions: a route DOT added that nobody chose, and a name DOT no longer ships (how a rename puts a
    removed route back)."""
    shipped, decided = urls.shipped_route_names(), urls.SERVED | urls.OVERRIDDEN | urls.NOT_SERVED
    errors = []
    if undecided := sorted(shipped - decided):
        errors.append(
            Error(
                f"django-oauth-toolkit ships routes nobody decided about: {', '.join(undecided)}.",
                hint="Name each in SERVED or NOT_SERVED in apps/oauth_provider/urls.py.",
                id="oauth_provider.E002",
            )
        )
    if gone := sorted(decided - shipped):
        errors.append(
            Error(
                f"apps/oauth_provider/urls.py decides about routes django-oauth-toolkit no longer ships: "
                f"{', '.join(gone)}.",
                hint="Drop each, and check whether a rename put back a route that was not served.",
                id="oauth_provider.E003",
            )
        )
    return errors
