from django.http import HttpResponse
from isik.django.apps.common.middleware import Middleware


class HealthCheckMiddleware(Middleware):
    """First in MIDDLEWARE: the Docker healthcheck sends no real Host header."""

    def before(self, request):
        if request.path == "/health/":
            return HttpResponse("ok")
