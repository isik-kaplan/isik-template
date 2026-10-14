from datetime import timedelta

import pytest
from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from django.utils import timezone
from oauth2_provider.models import get_access_token_model, get_application_model
from rest_framework.exceptions import ValidationError

from apps.oauth_provider.api.viewsets.application import ApplicationViewSet
from apps.oauth_provider.tests.conftest import REDIRECT_URI, make_application, set_approval
from apps.users.models.user import User


AccessToken = get_access_token_model()
Application = get_application_model()

LIST = reverse("oauth-applications-list")
NEW = {"name": "Acme Notes", "client_type": "confidential", "redirect_uris": [REDIRECT_URI]}


MANAGE = "users:manage:user"
GRANT = "users:grant:rights"


def _detail(application):
    return reverse("oauth-applications-detail", args=[application.pk])


def _action(application, name):
    return reverse(f"oauth-applications-{name}", args=[application.pk])


def _later():
    return timezone.now() + timedelta(hours=1)


@pytest.fixture
def proven(signed_in, headless, provider):
    headless.prove()
    return signed_in


@pytest.mark.django_db
def test_nobody_registers_while_the_provider_is_off(client, settings, signed_in):
    settings.OAUTH_PROVIDER_MODE = "off"

    assert client.get(LIST).status_code == 403
    assert client.post(LIST, NEW, content_type="application/json").status_code == 403


@pytest.mark.django_db
def test_a_new_application_waits_for_a_superuser_while_the_provider_asks_for_approval(client, proven):
    body = client.post(LIST, {**NEW, "requested_scopes": [MANAGE]}, content_type="application/json").json()

    assert body["approval"] == "pending"
    assert body["requested_scopes"] == [MANAGE]
    assert body["approved_scopes"] == []


@pytest.mark.django_db
def test_a_new_application_is_approved_for_what_it_asks_while_the_provider_approves_by_itself(client, proven, settings):
    settings.OAUTH_PROVIDER_MODE = "auto"

    body = client.post(LIST, {**NEW, "requested_scopes": [MANAGE]}, content_type="application/json").json()

    assert body["approval"] == "approved"
    assert body["approved_scopes"] == [MANAGE]


@pytest.mark.django_db
def test_an_application_asks_for_nothing_beyond_signing_people_in_unless_it_says_so(client, proven):
    body = client.post(LIST, NEW, content_type="application/json").json()

    assert body["requested_scopes"] == []


@pytest.mark.django_db
@pytest.mark.parametrize("scope", ["users:delete:everything", "openid"])
def test_only_a_scope_an_application_may_be_given_can_be_asked_for(client, proven, scope):
    response = client.post(LIST, {**NEW, "requested_scopes": [scope]}, content_type="application/json")

    assert response.status_code == 400
    assert "requested_scopes" in response.json()


@pytest.mark.django_db
def test_the_scopes_an_application_may_ask_for_are_listed_with_what_they_mean(client, signed_in, provider):
    response = client.get(reverse("oauth-applications-delegatable-scopes"))

    assert response.json() == [
        {"name": "users:grant:rights", "label": "Change what other people may do"},
        {"name": "users:manage:user", "label": "See everybody's account, and activate or deactivate them"},
    ]


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


DEVICE = {"name": "Acme CLI", "client_type": "public", "authorization_grant_type": Application.GRANT_DEVICE_CODE}


@pytest.mark.django_db
def test_a_command_line_registers_for_the_device_grant_with_nowhere_to_return_to(client, proven):
    response = client.post(LIST, DEVICE, content_type="application/json")

    assert response.status_code == 201
    body = response.json()
    assert body["authorization_grant_type"] == Application.GRANT_DEVICE_CODE
    assert body["redirect_uris"] == []
    assert body["client_secret"] is None
    assert Application.objects.get(pk=body["id"]).authorization_grant_type == Application.GRANT_DEVICE_CODE


@pytest.mark.django_db
def test_a_device_is_never_sent_back_anywhere(client, proven):
    response = client.post(LIST, {**DEVICE, "redirect_uris": [REDIRECT_URI]}, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == {"redirect_uris": ["A device is never sent back anywhere."]}


@pytest.mark.django_db
def test_a_device_keeps_no_secret(client, proven):
    response = client.post(LIST, {**DEVICE, "client_type": "confidential"}, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == {"client_type": ["A device keeps no secret: register it as public."]}


@pytest.mark.django_db
@pytest.mark.parametrize("redirect_uris", [[], None])
def test_signing_people_in_by_redirect_needs_somewhere_to_return_to(client, proven, redirect_uris):
    body = {key: value for key, value in NEW.items() if key != "redirect_uris"}
    if redirect_uris is not None:
        body["redirect_uris"] = redirect_uris

    response = client.post(LIST, body, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == {"redirect_uris": ["Give at least one place to return to."]}


@pytest.mark.django_db
def test_a_device_given_somewhere_to_return_to_later_is_refused_too(client, proven, headless):
    application = Application.objects.get(pk=client.post(LIST, DEVICE, content_type="application/json").json()["id"])
    headless.prove()

    response = client.patch(_detail(application), {"redirect_uris": [REDIRECT_URI]}, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == {"redirect_uris": ["A device is never sent back anywhere."]}


@pytest.mark.django_db
def test_an_application_taking_away_everywhere_it_returns_to_is_refused(client, proven, application):
    application.user = proven
    application.save()

    response = client.patch(_detail(application), {"redirect_uris": []}, content_type="application/json")

    assert response.json() == {"redirect_uris": ["Give at least one place to return to."]}


@pytest.mark.django_db
def test_how_it_signs_people_in_is_settled_when_it_is_registered(client, proven, application, headless):
    application.user = proven
    application.save()

    client.patch(
        _detail(application),
        {"authorization_grant_type": Application.GRANT_DEVICE_CODE},
        content_type="application/json",
    )

    application.refresh_from_db()
    assert application.authorization_grant_type == Application.GRANT_AUTHORIZATION_CODE


@pytest.mark.django_db
def test_no_other_grant_is_registered(client, proven):
    response = client.post(
        LIST, {**NEW, "authorization_grant_type": "client-credentials"}, content_type="application/json"
    )

    assert response.status_code == 400
    assert list(response.json()) == ["authorization_grant_type"]


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
    newer = make_application(name="Newer", user=signed_in, client_type="public")
    make_application(name="Bob's", user=User.objects.create_user(username="bob"))

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
    client.post(_action(application, "disable"))

    assert client.delete(_detail(application)).status_code == 403
    headless.prove()
    assert client.delete(_detail(application)).status_code == 204
    assert not Application.objects.exists()


@pytest.mark.django_db
def test_one_still_switched_on_is_not_deleted_and_nobody_proves_themselves_to_hear_it(
    client, signed_in, provider, application
):
    response = client.delete(_detail(application))

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Switch it off first: deleting it is for an application nobody is using any more."
    }
    assert Application.objects.exists()


@pytest.mark.django_db
def test_one_still_switched_on_is_not_deleted_even_by_somebody_who_proved_themselves(
    client, proven, application, monkeypatch
):
    # Past the early refusal, as a race with switching it back on would be.
    monkeypatch.setattr(ApplicationViewSet, "refuse_before_proving", lambda self, request: None)

    response = client.delete(_detail(application))

    assert response.status_code == 400
    assert Application.objects.exists()


@pytest.mark.django_db
def test_switching_it_off_takes_every_token_with_it(client, signed_in, provider, application):
    token = AccessToken.objects.create(user=signed_in, application=application, token="t", expires=_later())

    body = client.post(_action(application, "disable")).json()

    assert body["approval"] == "disabled"
    assert not AccessToken.objects.filter(pk=token.pk).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["pending", "withdrawn"])
def test_only_an_approved_application_is_switched_off(client, signed_in, provider, application, approval):
    set_approval(application, approval)

    response = client.post(_action(application, "disable"))

    assert response.status_code == 400
    assert response.json() == {"detail": "Only an approved application can be switched off."}


@pytest.mark.django_db
def test_switching_it_back_on_restores_what_it_was_approved_for(client, signed_in, provider, application):
    client.post(_action(application, "disable"))

    body = client.post(_action(application, "restore")).json()

    assert body["approval"] == "approved"
    assert body["approved_scopes"] == [MANAGE]


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["approved", "withdrawn"])
def test_only_an_application_its_owner_switched_off_is_switched_back_on(
    client, signed_in, provider, application, approval
):
    """A withdrawn one especially: switching it back on is a superuser's to do."""
    set_approval(application, approval)

    response = client.post(_action(application, "restore"))

    assert response.status_code == 400
    assert response.json() == {"detail": "Only an application its owner switched off can be switched back on."}
    application.refresh_from_db()
    assert application.approval == approval


@pytest.mark.django_db
def test_rotating_the_secret_hands_out_a_new_one_once_and_leaves_tokens_alone(client, proven, application):
    token = AccessToken.objects.create(user=proven, application=application, token="t", expires=_later())

    response = client.post(_action(application, "rotate-secret"), {}, content_type="application/json")

    assert response.status_code == 200
    application.refresh_from_db()
    assert check_password(response.json()["client_secret"], application.client_secret)
    assert not check_password("the-client-secret", application.client_secret)
    token.refresh_from_db()
    assert not token.is_expired()


@pytest.mark.django_db
def test_rotating_the_secret_can_take_the_tokens_down_with_it(client, proven, application):
    token = AccessToken.objects.create(user=proven, application=application, token="t", expires=_later())

    client.post(_action(application, "rotate-secret"), {"revoke_tokens": True}, content_type="application/json")

    assert not AccessToken.objects.filter(pk=token.pk).exists()


@pytest.mark.django_db
def test_rotating_the_secret_needs_a_proof(client, signed_in, provider, application):
    response = client.post(_action(application, "rotate-secret"), {}, content_type="application/json")

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"


@pytest.mark.django_db
def test_a_rotation_asked_for_in_nonsense_is_refused(client, proven, application):
    application.user = proven
    application.save()

    response = client.post(
        _action(application, "rotate-secret"), {"revoke_tokens": "perhaps"}, content_type="application/json"
    )

    assert response.status_code == 400
    assert list(response.json()) == ["revoke_tokens"]


@pytest.mark.django_db
def test_one_still_switched_on_is_not_deleted_whatever_reaches_the_delete(proven, application):
    """The check before proving answers first; this is the one standing behind it."""
    with pytest.raises(ValidationError) as refused:
        ApplicationViewSet().perform_destroy(application)

    assert refused.value.detail == {
        "detail": "Switch it off first: deleting it is for an application nobody is using any more."
    }
    assert Application.objects.filter(pk=application.pk).exists()


@pytest.mark.django_db
def test_a_device_is_edited_without_saying_again_that_it_is_public(client, proven):
    application = Application.objects.get(pk=client.post(LIST, DEVICE, content_type="application/json").json()["id"])

    response = client.patch(_detail(application), {"name": "Renamed CLI"}, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed CLI"


@pytest.mark.django_db
def test_a_public_application_has_no_secret_to_rotate(client, proven, application):
    Application.objects.filter(pk=application.pk).update(client_type=Application.CLIENT_PUBLIC)

    response = client.post(_action(application, "rotate-secret"), {}, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == {"detail": "A public application has no secret to rotate."}


@pytest.mark.django_db
def test_asking_for_less_narrows_what_it_was_approved_for_at_once(client, proven, application):
    response = client.patch(_detail(application), {"requested_scopes": []}, content_type="application/json")

    assert response.json()["requested_scopes"] == []
    assert response.json()["approved_scopes"] == []


@pytest.mark.django_db
def test_asking_for_more_waits_for_a_superuser_while_the_provider_asks_for_approval(client, proven, application):
    both = [GRANT, MANAGE]

    body = client.patch(_detail(application), {"requested_scopes": both}, content_type="application/json").json()

    assert body["requested_scopes"] == both
    assert body["approved_scopes"] == [MANAGE]
    assert body["approval"] == "approved"


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["approved", "disabled"])
def test_asking_for_more_is_approved_at_once_while_the_provider_approves_by_itself(
    client, proven, application, settings, approval
):
    settings.OAUTH_PROVIDER_MODE = "auto"
    set_approval(application, approval)

    body = client.patch(
        _detail(application), {"requested_scopes": [GRANT, MANAGE]}, content_type="application/json"
    ).json()

    assert body["approved_scopes"] == [GRANT, MANAGE]


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["pending", "withdrawn"])
def test_asking_for_more_waits_for_a_superuser_whose_answer_is_still_due_or_was_no(
    client, proven, application, settings, approval
):
    settings.OAUTH_PROVIDER_MODE = "auto"
    set_approval(application, approval)

    body = client.patch(
        _detail(application), {"requested_scopes": [GRANT, MANAGE]}, content_type="application/json"
    ).json()

    assert body["approved_scopes"] == [MANAGE]


@pytest.mark.django_db
def test_asking_for_more_needs_a_proof(client, signed_in, provider, application):
    response = client.patch(_detail(application), {"requested_scopes": [GRANT]}, content_type="application/json")

    assert response.status_code == 403


@pytest.mark.django_db
def test_somebody_elses_application_is_not_found(client, proven, application):
    application.user = User.objects.create_user(username="bob")
    application.save()

    assert client.get(_detail(application)).status_code == 404
    assert client.delete(_detail(application)).status_code == 404


@pytest.mark.django_db
def test_a_scope_is_the_declared_permission_and_no_namesake(client, proven):
    """A row of the same codename under another content type - a third-party app's, say - is not it."""
    Permission.objects.create(content_type=ContentType.objects.get_for_model(User), codename=MANAGE, name="A namesake")

    response = client.post(LIST, {**NEW, "requested_scopes": [MANAGE]}, content_type="application/json")

    assert response.status_code == 201
    assert response.json()["requested_scopes"] == [MANAGE]


@pytest.mark.django_db
def test_a_permission_row_nobody_declared_is_no_scope(client, proven):
    stray = Permission.objects.create(
        content_type=ContentType.objects.get_for_model(Permission), codename="stray:left:behind", name="Stray"
    )

    response = client.post(LIST, {**NEW, "requested_scopes": [stray.codename]}, content_type="application/json")

    assert response.status_code == 400
    assert list(response.json()) == ["requested_scopes"]
