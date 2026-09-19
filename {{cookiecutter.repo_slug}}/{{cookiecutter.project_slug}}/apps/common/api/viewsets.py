from django.conf import settings
from isik.django.drf.viewsets import BaseModelViewSet as _BaseModelViewSet


class BaseModelViewSet(_BaseModelViewSet):
    # Exempts this abstract class from the required-attributes check and forks a private
    # model->viewset registry, so subclasses register under this project's own base instead of
    # isik's shared default registry.
    is_base_class = True

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        # DRF downgrades an unauthenticated 401 to 403 (SessionAuthentication has no
        # WWW-Authenticate challenge), so a dead session looks identical to a real user lacking
        # permission - request.user.is_authenticated is what tells them apart.
        if response.status_code in (401, 403) and not request.user.is_authenticated:
            response.delete_cookie(settings.SESSION_COOKIE_NAME)
            # Set-Cookie is not readable from JS, and the status alone cannot tell "your session
            # is dead" apart from "logged in, just not allowed here" - both are 403.
            response["X-Session-Cleared"] = "1"
        return response
