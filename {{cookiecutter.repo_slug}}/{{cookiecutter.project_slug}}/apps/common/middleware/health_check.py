from django.http import HttpResponse
from isik.django.apps.common.middleware import Middleware


class HealthCheckMiddleware(Middleware):
    """Runs first in MIDDLEWARE so the container-internal Docker healthcheck (which sends no real
    Host header) always gets a response, before anything else that might depend on one."""

    def before(self, request):
        if request.path == "/health/":
            return HttpResponse("ok")
