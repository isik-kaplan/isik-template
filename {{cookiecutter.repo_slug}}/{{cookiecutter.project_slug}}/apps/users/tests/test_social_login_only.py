import json
import re

import pytest
from allauth.socialaccount.models import SocialAccount
from django.conf import settings
from django.contrib.auth import authenticate
from django.core import mail

from apps.common.links import api_path, auth_path
from apps.users import headless_urls
from apps.users.models.user import User
from apps.users.reauthentication.gate import REAUTHENTICATION_REQUIRED_HEADER
from apps.users.reauthentication.proof import PROVIDER_FLOW
from apps.users.tests.conftest import OIDC_PROVIDER_ID, PASSWORD


AUTH_HOST = f"auth.{settings.PARENT_HOST}"
ADMIN_HOST = f"admin.{settings.PARENT_HOST}"
WAYS_TO_PROVE = api_path("users:users-reauthentication")
# allauth's codes are capitals and digits, dashed by default, on a line of their own.
CODE = re.compile(r"^\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)\s*$", re.MULTILINE)


def _post(client, kind, name):
    url = auth_path(f"headless:{kind}:account:{name}")
    return client.post(url, "{}", content_type="application/json", HTTP_HOST=AUTH_HOST)


@pytest.mark.django_db
@pytest.mark.parametrize("kind", ["browser", "app"])
@pytest.mark.parametrize("name", sorted(headless_urls.PASSWORD_ROUTES))
def test_no_password_route_is_found_without_passwords(client, signed_in, social_login_only, kind, name):
    assert _post(client, kind, name).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("kind", ["browser", "app"])
@pytest.mark.parametrize("name", sorted(headless_urls.PASSWORD_ROUTES))
def test_every_password_route_answers_while_passwords_sign_in(client, signed_in, kind, name):
    assert _post(client, kind, name).status_code != 404


@pytest.mark.django_db
def test_the_rest_of_allauth_still_answers_without_passwords(client, signed_in, social_login_only):
    response = client.get(auth_path("headless:browser:account:current_session"), HTTP_HOST=AUTH_HOST)

    assert response.status_code == 200


@pytest.mark.django_db
def test_without_passwords_only_a_superuser_signs_in_with_one(social_login_only, alice):
    staff = User.objects.create_user(username="staff", email="staff@example.test", password=PASSWORD, is_staff=True)
    root = User.objects.create_superuser(username="root", email="root@example.test", password=PASSWORD)

    assert authenticate(None, username=alice.email, password=PASSWORD) is None
    assert authenticate(None, username=staff.email, password=PASSWORD) is None
    assert authenticate(None, username=root.email, password=PASSWORD) == root


@pytest.mark.django_db
def test_a_superuser_signs_in_to_the_admin_with_a_password_and_staff_do_not(client, social_login_only):
    User.objects.create_user(username="staff", email="staff@example.test", password=PASSWORD, is_staff=True)
    User.objects.create_superuser(username="root", email="root@example.test", password=PASSWORD)

    refused = client.post("/login/", {"username": "staff@example.test", "password": PASSWORD}, HTTP_HOST=ADMIN_HOST)
    admitted = client.post("/login/", {"username": "root@example.test", "password": PASSWORD}, HTTP_HOST=ADMIN_HOST)

    assert refused.status_code == 200
    assert "_auth_user_id" not in refused.wsgi_request.session
    assert admitted.status_code == 302


@pytest.mark.django_db
def test_without_passwords_a_code_by_email_is_offered_in_place_of_setting_one(
    client, alice, providers, social_login_only
):
    alice.set_unusable_password()
    alice.save()
    SocialAccount.objects.create(user=alice, provider=OIDC_PROVIDER_ID, uid="sub-1")
    client.force_login(alice)

{%- if cookiecutter.phone == "required" %}
    recipients = [{"email": "alice@example.test"}, {"phone": "+14155550100"}]
{%- else %}
    recipients = [{"email": "alice@example.test"}]
{%- endif %}
    assert client.get(WAYS_TO_PROVE).json() == [
        {"id": "reauthenticate_by_code", "recipients": recipients},
        {"id": PROVIDER_FLOW, "providers": [{"id": OIDC_PROVIDER_ID, "name": "Test IdP"}]},
    ]


@pytest.mark.django_db
def test_a_superusers_password_is_no_proof_outside_the_admin(client, social_login_only):
    root = User.objects.create_superuser(username="root", email="root@example.test", password=PASSWORD)
    client.force_login(root)

    assert "reauthenticate" not in [flow["id"] for flow in client.get(WAYS_TO_PROVE).json()]


@pytest.mark.django_db
def test_the_emailed_code_proves_it_for_one_act(headless, signed_in, social_login_only):
    def add_email(email):
        return headless.call("POST", "account:manage_email", {"email": email})

    assert add_email("second@example.test").get(REAUTHENTICATION_REQUIRED_HEADER) == "1"

    requested = headless.call("POST", "account:request_reauthentication_code", {"email": signed_in.email})
    (code,) = CODE.findall(mail.outbox[-1].body)
    confirmed = headless.call("POST", "account:confirm_reauthentication_code", {"code": code})

    assert (requested.status_code, confirmed.status_code) == (200, 200)
    assert add_email("second@example.test").status_code == 200
    assert add_email("third@example.test").get(REAUTHENTICATION_REQUIRED_HEADER) == "1"


@pytest.mark.django_db
def test_a_wrong_code_proves_nothing(headless, signed_in, social_login_only):
    headless.call("POST", "account:request_reauthentication_code", {"email": signed_in.email})

    response = headless.call("POST", "account:confirm_reauthentication_code", {"code": "WRONG1"})

    assert response.status_code == 400
    assert json.loads(response.content)["errors"][0]["param"] == "code"
