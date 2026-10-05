import pytest
from allauth.socialaccount.models import SocialAccount
from allauth.socialaccount.providers.github.provider import GitHubProvider
from django.urls import reverse

from apps.users.reauthentication.proof import PROVIDER_FLOW, SET_PASSWORD_BY_EMAIL_FLOW
from apps.users.tests.conftest import OIDC_PROVIDER_ID


URL = reverse("users-reauthentication")


@pytest.mark.django_db
def test_the_ways_to_prove_it_are_only_for_somebody_signed_in(client):
    assert client.get(URL).status_code in (401, 403)


@pytest.mark.django_db
def test_somebody_with_a_password_is_told_to_type_it(client, signed_in, providers):
    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == [{"id": "reauthenticate"}]


@pytest.mark.django_db
def test_somebody_with_no_password_is_told_their_provider_and_the_way_back_by_email(client, alice, providers):
    alice.set_unusable_password()
    alice.save()
    SocialAccount.objects.create(user=alice, provider=OIDC_PROVIDER_ID, uid="sub-1")
    SocialAccount.objects.create(user=alice, provider=GitHubProvider.id, uid="2")
    client.force_login(alice)

    assert client.get(URL).json() == [
        {"id": PROVIDER_FLOW, "providers": [{"id": OIDC_PROVIDER_ID, "name": "Test IdP"}]},
        {"id": SET_PASSWORD_BY_EMAIL_FLOW, "email": "alice@example.test"},
    ]
