from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.test import RequestFactory

from apps.common.middleware.language import UserLanguageMiddleware


class _User:
    def __init__(self, language):
        self.language = language


def _request(accept_language="", user=None):
    request = RequestFactory().get("/", HTTP_ACCEPT_LANGUAGE=accept_language)
    request.user = user if user is not None else AnonymousUser()
    return request


def test_a_signed_in_users_language_wins_over_the_browsers(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    seen = {}
    middleware = UserLanguageMiddleware(get_response=_capture(seen))

    middleware(_request(accept_language="en", user=_User("tr")))

    assert seen["language"] == "tr"


def test_the_browsers_language_is_used_when_the_user_has_no_preference(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    seen = {}
    middleware = UserLanguageMiddleware(get_response=_capture(seen))

    middleware(_request(accept_language="tr", user=_User("")))

    assert seen["language"] == "tr"


def test_anonymous_visitors_get_the_browsers_language_too(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    seen = {}
    middleware = UserLanguageMiddleware(get_response=_capture(seen))

    middleware(_request(accept_language="tr"))

    assert seen["language"] == "tr"


def test_falls_back_to_language_code_when_neither_names_a_supported_language(settings):
    settings.LANGUAGES = [("en", "English")]
    settings.LANGUAGE_CODE = "en"
    seen = {}
    middleware = UserLanguageMiddleware(get_response=_capture(seen))

    middleware(_request(accept_language="de", user=_User("")))

    assert seen["language"] == "en"


def test_a_users_language_not_in_the_currently_configured_set_is_ignored(settings):
    # A project reconfigured its languages after this user picked one no longer offered - stale
    # data, not a value to actually activate.
    settings.LANGUAGES = [("en", "English")]
    seen = {}
    middleware = UserLanguageMiddleware(get_response=_capture(seen))

    middleware(_request(accept_language="en", user=_User("tr")))

    assert seen["language"] == "en"


def test_the_request_itself_carries_the_resolved_language(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    seen = {}

    def get_response(request):
        seen["request_language_code"] = request.LANGUAGE_CODE
        return HttpResponse()

    UserLanguageMiddleware(get_response=get_response)(_request(accept_language="tr", user=_User("")))

    assert seen["request_language_code"] == "tr"


def test_the_response_carries_a_content_language_header(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    middleware = UserLanguageMiddleware(get_response=lambda request: HttpResponse())

    response = middleware(_request(accept_language="tr", user=_User("")))

    assert response.headers["Content-Language"] == "tr"


def test_translation_is_deactivated_even_if_the_view_raises():
    from django.utils import translation

    def _boom(request):
        raise ValueError("boom")

    middleware = UserLanguageMiddleware(get_response=_boom)
    try:
        middleware(_request(accept_language="tr", user=_User("")))
    except ValueError:
        pass

    # A leaked activation would leave "tr" active for whatever runs next on this thread.
    assert translation.get_language() != "tr"


def _capture(seen):
    from django.utils import translation

    def get_response(request):
        seen["language"] = translation.get_language()
        return HttpResponse()

    return get_response
