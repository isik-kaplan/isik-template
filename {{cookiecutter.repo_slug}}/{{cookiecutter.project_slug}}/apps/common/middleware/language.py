from django.conf import settings
from django.utils import translation
from isik.django.apps.common.middleware import Middleware


class UserLanguageMiddleware(Middleware):
    """The user's saved language, else the browser's; LocaleMiddleware cannot prefer a stored value."""

    def __call__(self, request):
        supported = dict(settings.LANGUAGES)
        user_language = getattr(request.user, "language", None)
        language = user_language if user_language in supported else translation.get_language_from_request(request)
        translation.activate(language)
        request.LANGUAGE_CODE = language
        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()
        # Name casing is unobservable (Django headers are case-insensitive); see mutation-equivalents.toml.
        response.headers["Content-Language"] = language
        return response
