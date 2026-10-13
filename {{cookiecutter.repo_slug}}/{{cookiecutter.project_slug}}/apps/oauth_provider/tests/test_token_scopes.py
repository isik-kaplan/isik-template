import pytest

from apps.oauth_provider.token_scopes import TokenScopes


def test_every_scope_is_worded_for_the_consent_page():
    assert TokenScopes().get_all_scopes() == {
        "openid": "Who you are",
        "profile": "Your name and username",
        "email": "Your email address",
        "users:grant:rights": "Change what other people may do",
        "users:manage:user": "See everybody's account, and activate or deactivate them",
    }


def test_with_no_application_only_signing_in_is_anybodys_to_ask_for():
    """What discovery publishes: nothing else is anybody's until a superuser says so for one application."""
    assert TokenScopes().get_available_scopes() == ["openid", "profile", "email"]


@pytest.mark.django_db
def test_an_application_may_ask_for_signing_in_and_what_it_was_approved_for(application):
    assert TokenScopes().get_available_scopes(application) == ["openid", "profile", "email", "users:manage:user"]


def test_asking_for_nothing_asks_for_who_they_are():
    assert TokenScopes().get_default_scopes() == ["openid"]
