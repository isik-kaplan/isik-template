from types import SimpleNamespace

import pytest
from allauth.socialaccount.models import SocialAccount, SocialLogin
from django.conf import settings
from django.contrib.sessions.middleware import SessionMiddleware
from django.test import RequestFactory
from django.utils import timezone

from apps.users.adapters.account import AccountAdapter
from apps.users.adapters.social_account import SocialAccountAdapter
from apps.users.models.user import User
from apps.users.tests.conftest import PASSWORD


VERSION = "0123456789ab"


@pytest.fixture
def published(monkeypatch):
    """The project as if its legal documents existed, whatever this checkout ships."""
    monkeypatch.setattr("apps.users.adapters.account.TERMS_VERSION", VERSION)


@pytest.fixture
def unpublished(monkeypatch):
    monkeypatch.setattr("apps.users.adapters.account.TERMS_VERSION", "")


def _sign_up(client, username):
    host = f"auth.{settings.PARENT_HOST}"
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)
    client.post(
        "/v0/browser/v1/auth/signup",
        data={"username": username, "email": f"{username}@example.test", "password": PASSWORD},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    return User.objects.get(username=username)


def _social_sign_up(username, form=None):
    request = RequestFactory().get("/")
    SessionMiddleware(lambda request: None).process_request(request)
    sociallogin = SocialLogin(
        user=User(username=username, email=f"{username}@example.test"),
        account=SocialAccount(provider="github", uid=f"uid-{username}"),
    )
    SocialAccountAdapter().save_user(request, sociallogin, form=form)
    return User.objects.get(pk=sociallogin.user.pk)


@pytest.mark.django_db
def test_a_password_signup_records_the_published_version_and_when(client, published):
    before = timezone.now()

    user = _sign_up(client, "jane")

    assert user.terms_version == VERSION
    assert before <= user.terms_accepted_at <= timezone.now()


@pytest.mark.django_db
def test_a_social_signup_records_the_published_version_and_when(published):
    before = timezone.now()

    user = _social_sign_up("sam")

    assert user.terms_version == VERSION
    assert before <= user.terms_accepted_at <= timezone.now()


@pytest.mark.django_db
def test_a_social_signup_finished_on_the_signup_form_keeps_what_the_form_chose(published):
    """The provider's suggestion is only a default: the form's answers are what the account is made with."""
    form = SimpleNamespace(cleaned_data={"username": "chosen", "email": "chosen@example.test"})

    user = _social_sign_up("suggested", form=form)

    assert user.username == "chosen"
    assert user.terms_version == VERSION


@pytest.mark.django_db
def test_a_signup_records_nothing_while_no_documents_are_published(client, unpublished):
    """Nobody can have agreed to documents that did not exist yet."""
    for user in (_sign_up(client, "jane"), _social_sign_up("sam")):
        assert user.terms_version == ""
        assert user.terms_accepted_at is None


@pytest.mark.django_db
def test_an_account_made_outside_signup_records_no_acceptance(published):
    user = User.objects.create_user(username="admin-made", email="admin-made@example.test", password=PASSWORD)

    assert user.terms_version == ""
    assert user.terms_accepted_at is None


@pytest.mark.django_db
def test_a_caller_that_saves_the_account_itself_gets_it_unsaved_with_the_acceptance_on_it(published):
    """`commit=False` is how a signup that still has fields to add asks for the account: recorded, not saved."""
    form = SimpleNamespace(cleaned_data={"username": "later", "email": "later@example.test", "password1": PASSWORD})

    user = AccountAdapter().save_user(RequestFactory().get("/"), User(), form, commit=False)

    assert (user.username, user.terms_version) == ("later", VERSION)
    assert not User.objects.filter(username="later").exists()
