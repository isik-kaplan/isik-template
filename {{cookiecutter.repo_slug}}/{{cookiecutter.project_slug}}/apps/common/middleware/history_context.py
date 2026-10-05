from isik.django.apps.common.middleware import HistoryContextMiddleware as _HistoryContextMiddleware

from {{ cookiecutter.project_slug }} import __version__


class HistoryContextMiddleware(_HistoryContextMiddleware):
    """isik's, plus the version that served the request - so "was this written before or after the
    deploy that changed the behavior" is answered by the row itself, not by a deploy log."""

    def get_context(self, request):
        return {**super().get_context(request), "version": __version__}
