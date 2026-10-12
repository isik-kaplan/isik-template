import pytest
from django.contrib.auth.hashers import check_password
from django.urls import reverse
from oauth2_provider.models import get_application_model

from apps.oauth_provider.tests.conftest import REDIRECT_URI
from apps.users.models.user import User


Application = get_application_model()

LIST = reverse("oauth-applications-list")
NEW = {"name": "Acme Notes", "client_type": "confidential", "redirect_uris": [REDIRECT_URI]}


def _detail(application):
    return reverse("oauth-applications-detail", args=[application.pk])


@pytest.fixture
def proven(signed_in, headless, provider):
    headless.prove()
    return signed_in


@pytest.mark.django_db
@pytest.mark.parametrize("mode", ["off", "internal"])
def test_somebody_who_may_not_register_is_refused_every_action(client, settings, signed_in, mode):
    settings.OAUTH_PROVIDER_MODE = mode

    assert client.get(LIST).status_code == 403
    assert client.post(LIST, NEW, content_type="application/json").status_code == 403


@pytest.mark.django_db
def test_staff_may_register_while_the_provider_is_internal(client, settings, signed_in, headless):
    settings.OAUTH_PROVIDER_MODE = "internal"
    signed_in.is_staff = True
    signed_in.save()
    headless.prove()

    assert client.post(LIST, NEW, content_type="application/json").status_code == 201


@pytest.mark.django_db
def test_registering_hands_out_the_secret_once_and_keeps_only_its_hash(client, proven):
    response = client.post(LIST, NEW, content_type="application/json")

    assert response.status_code == 201
    body = response.json()
    application = Application.objects.get(pk=body["id"])
    assert body["name"] == "Acme Notes"
    assert body["client_id"] == application.client_id
    assert body["redirect_uris"] == [REDIRECT_URI]
    assert check_password(body["client_secret"], application.client_secret)
    assert client.get(_detail(application)).json()["client_secret"] is None


@pytest.mark.django_db
def test_a_registered_application_can_only_use_the_code_flow_and_always_asks(client, proven):
    application = Application.objects.get(pk=client.post(LIST, NEW, content_type="application/json").json()["id"])

    assert application.user == proven
    assert application.authorization_grant_type == Application.GRANT_AUTHORIZATION_CODE
    assert application.algorithm == Application.RS256_ALGORITHM
    assert application.skip_authorization is False


@pytest.mark.django_db
def test_a_public_client_is_handed_no_secret_since_it_could_not_keep_one(client, proven):
    body = client.post(LIST, {**NEW, "client_type": "public"}, content_type="application/json").json()

    assert body["client_type"] == "public"
    assert body["client_secret"] is None


@pytest.mark.django_db
def test_registering_asks_somebody_to_prove_it_is_them_first(client, signed_in, provider):
    response = client.post(LIST, NEW, content_type="application/json")

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"
    assert not Application.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "redirect_uris",
    [[], ["not a uri"], ["ftp://client.example.test/callback"], ["https://client.example.test/cb#fragment"]],
)
def test_a_redirect_uri_an_application_could_not_safely_return_to_is_refused(client, proven, redirect_uris):
    response = client.post(LIST, {**NEW, "redirect_uris": redirect_uris}, content_type="application/json")

    assert response.status_code == 400
    assert "redirect_uris" in response.json()


@pytest.mark.django_db
def test_a_redirect_uri_names_its_scheme_problem(client, proven):
    response = client.post(
        LIST, {**NEW, "redirect_uris": ["ftp://client.example.test/cb"]}, content_type="application/json"
    )

    assert response.json() == {
        "redirect_uris": ["redirect uri URI Validation error. invalid_scheme: ftp://client.example.test/cb"]
    }


@pytest.mark.django_db
def test_a_redirect_uri_may_carry_a_query(client, proven):
    uri = "https://client.example.test/callback?from=acme"

    response = client.post(LIST, {**NEW, "redirect_uris": [uri]}, content_type="application/json")

    assert response.status_code == 201
    assert response.json()["redirect_uris"] == [uri]


@pytest.mark.django_db
def test_plain_http_is_refused_where_only_https_is_allowed(client, proven, settings):
    settings.OAUTH2_PROVIDER = {**settings.OAUTH2_PROVIDER, "ALLOWED_REDIRECT_URI_SCHEMES": ["https"]}

    response = client.post(
        LIST, {**NEW, "redirect_uris": ["http://client.example.test/cb"]}, content_type="application/json"
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_several_redirect_uris_are_kept_in_order(client, proven):
    uris = [REDIRECT_URI, "https://client.example.test/other"]

    body = client.post(LIST, {**NEW, "redirect_uris": uris}, content_type="application/json").json()

    assert body["redirect_uris"] == uris
    assert Application.objects.get(pk=body["id"]).redirect_uris == " ".join(uris)


@pytest.mark.django_db
def test_an_application_needs_a_name(client, proven):
    response = client.post(LIST, {**NEW, "name": ""}, content_type="application/json")

    assert response.status_code == 400
    assert "name" in response.json()


@pytest.mark.django_db
def test_nobody_registers_more_than_their_share(client, signed_in, provider, headless, settings):
    settings.OAUTH_PROVIDER_APPLICATIONS_PER_USER = 2
    for _ in range(2):
        headless.prove()
        assert client.post(LIST, NEW, content_type="application/json").status_code == 201
    headless.prove()

    response = client.post(LIST, NEW, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == {"non_field_errors": ["You can register at most 2 applications."]}
    assert Application.objects.count() == 2


@pytest.mark.django_db
def test_the_share_is_counted_per_person(client, proven, settings, application):
    settings.OAUTH_PROVIDER_APPLICATIONS_PER_USER = 1
    application.user = User.objects.create_user(username="bob")
    application.save()

    assert client.post(LIST, NEW, content_type="application/json").status_code == 201


@pytest.mark.django_db
def test_somebody_sees_only_their_own_applications_newest_first(client, signed_in, provider, application):
    newer = Application.objects.create(name="Newer", user=signed_in, redirect_uris=REDIRECT_URI, client_type="public")
    Application.objects.create(name="Bob's", user=User.objects.create_user(username="bob"), redirect_uris=REDIRECT_URI)

    names = [row["name"] for row in client.get(LIST).json()["results"]]

    assert names == [newer.name, application.name]


@pytest.mark.django_db
def test_renaming_needs_no_proof(client, signed_in, provider, application):
    response = client.patch(_detail(application), {"name": "Acme Notes 2"}, content_type="application/json")

    assert response.status_code == 200
    application.refresh_from_db()
    assert application.name == "Acme Notes 2"


@pytest.mark.django_db
def test_pointing_its_sign_ins_elsewhere_needs_a_proof(client, signed_in, provider, application, headless):
    elsewhere = {"redirect_uris": ["https://elsewhere.example.test/cb"]}

    assert client.patch(_detail(application), elsewhere, content_type="application/json").status_code == 403
    headless.prove()
    assert client.patch(_detail(application), elsewhere, content_type="application/json").status_code == 200
    application.refresh_from_db()
    assert application.redirect_uris == "https://elsewhere.example.test/cb"


@pytest.mark.django_db
def test_the_client_type_is_settled_when_it_is_registered(client, signed_in, provider, application):
    client.patch(_detail(application), {"client_type": "public"}, content_type="application/json")

    application.refresh_from_db()
    assert application.client_type == Application.CLIENT_CONFIDENTIAL


@pytest.mark.django_db
def test_deleting_one_needs_a_proof_and_then_removes_it(client, signed_in, provider, application, headless):
    assert client.delete(_detail(application)).status_code == 403
    headless.prove()
    assert client.delete(_detail(application)).status_code == 204
    assert not Application.objects.exists()


@pytest.mark.django_db
def test_somebody_elses_application_is_not_found(client, proven, application):
    application.user = User.objects.create_user(username="bob")
    application.save()

    assert client.get(_detail(application)).status_code == 404
    assert client.delete(_detail(application)).status_code == 404
