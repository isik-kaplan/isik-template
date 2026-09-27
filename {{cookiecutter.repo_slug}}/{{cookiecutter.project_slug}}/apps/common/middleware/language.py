from django.conf import settings
from django.utils import translation


class UserLanguageMiddleware:
    """Activates the signed-in user's saved language, or the browser's, or the default.

    Not Django's own LocaleMiddleware: that only ever looks at the cookie/session/Accept-Language
    header, with no way to prefer a value stored on the user themselves.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supported = dict(settings.LANGUAGES)
        user_language = getattr(request.user, "language", "") or ""
        language = user_language if user_language in supported else translation.get_language_from_request(request)
        translation.activate(language)
        request.LANGUAGE_CODE = language
        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()
        response.headers["Content-Language"] = language
        return response
