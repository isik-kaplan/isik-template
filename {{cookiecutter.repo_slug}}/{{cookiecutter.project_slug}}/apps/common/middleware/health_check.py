from django.http import HttpResponse


class HealthCheckMiddleware:
    """Runs first in MIDDLEWARE so the container-internal Docker healthcheck (which sends no real
    Host header) always gets a response, before anything else that might depend on one."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/health/":
            return HttpResponse("ok")
        return self.get_response(request)
