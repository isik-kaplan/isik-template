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
        # None, not "": neither is itself a real language code, so both fail the membership check
        # the same way - AnonymousUser (no .language at all) and a signed-in user with no saved
        # preference (.language == "") end up on the exact same branch below either way.
        user_language = getattr(request.user, "language", None)
        language = user_language if user_language in supported else translation.get_language_from_request(request)
        translation.activate(language)
        request.LANGUAGE_CODE = language
        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()
        # This header's own name-casing has no test that could ever observe it - Django's response
        # headers are case-insensitive on both read and write - see mutation-equivalents.toml.
        response.headers["Content-Language"] = language
        return response
