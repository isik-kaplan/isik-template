from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings

from apps.common.api.viewsets import BaseModelViewSet, _BaseModelViewSet


def _finalize(status_code, is_authenticated):
    request = MagicMock()
    request.user.is_authenticated = is_authenticated
    response = MagicMock()
    response.status_code = status_code
    with patch.object(_BaseModelViewSet, "finalize_response", return_value=response):
        BaseModelViewSet().finalize_response(request, response)
    return response


@pytest.mark.parametrize("status_code", [401, 403])
def test_clears_the_session_cookie_for_an_unauthenticated_401_or_403(status_code):
    response = _finalize(status_code, is_authenticated=False)

    response.delete_cookie.assert_called_once_with(settings.SESSION_COOKIE_NAME)
    response.__setitem__.assert_called_once_with("X-Session-Cleared", "1")


def test_leaves_the_cookie_alone_when_the_user_is_authenticated():
    response = _finalize(403, is_authenticated=True)

    response.delete_cookie.assert_not_called()
    response.__setitem__.assert_not_called()


@pytest.mark.parametrize("status_code", [200, 400, 404, 500])
def test_leaves_the_cookie_alone_outside_401_and_403(status_code):
    response = _finalize(status_code, is_authenticated=False)

    response.delete_cookie.assert_not_called()
    response.__setitem__.assert_not_called()


def test_returns_the_response_super_produced():
    request = MagicMock()
    request.user.is_authenticated = True
    response = MagicMock(status_code=200)

    with patch.object(_BaseModelViewSet, "finalize_response", return_value=response) as mocked_super:
        result = BaseModelViewSet().finalize_response(request, response, "arg", kwarg="value")

    mocked_super.assert_called_once_with(request, response, "arg", kwarg="value")
    assert result is response
