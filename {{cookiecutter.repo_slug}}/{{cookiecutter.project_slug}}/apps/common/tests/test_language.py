from types import SimpleNamespace

import pytest

from apps.common.language import saved_language


@pytest.fixture
def two_languages(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]


def test_a_shipped_choice_is_returned(two_languages):
    assert saved_language(SimpleNamespace(language="tr")) == "tr"


def test_a_regional_choice_finds_the_shipped_language(two_languages):
    assert saved_language(SimpleNamespace(language="tr-cy")) == "tr"


def test_a_choice_no_longer_shipped_is_none(two_languages):
    assert saved_language(SimpleNamespace(language="de")) is None


def test_no_choice_is_none(two_languages):
    assert saved_language(SimpleNamespace(language="")) is None


def test_someone_with_no_language_at_all_is_none(two_languages):
    """No user (a send with no recipient account) and AnonymousUser both lack the attribute."""
    assert saved_language(None) is None
