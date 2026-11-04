"""Every NameRequirement, whichever one this project was generated with."""

import pytest
from allauth.account.models import EmailAddress
from django.conf import settings as django_settings
from django.core.exceptions import ValidationError

from apps.users.adapters.account import AccountAdapter
from apps.users.models.user import User
from apps.users.names import NameRequirement, label
from apps.users.tests.conftest import PASSWORD
from conftest import versioned


@pytest.fixture(params=list(NameRequirement))
def requirement(request, settings):
    settings.NAME_REQUIREMENT = request.param
    settings.ACCOUNT_LOGIN_METHODS = request.param.login_methods
    return request.param


def _signup(headless, **names):
    return headless.call("POST", "account:signup", {"email": "new@example.test", "password": PASSWORD, **names})


def _errors(response):
    return {(error["param"], error["code"]) for error in response.json()["errors"]}


@pytest.mark.parametrize(
    ("requirement", "required", "offered"),
    [
        (NameRequirement.FULL_ONLY, {"first_name", "last_name"}, {"first_name", "last_name"}),
        (
            NameRequirement.FULL_AND_USERNAME,
            {"first_name", "last_name", "username"},
            {"first_name", "last_name", "username"},
        ),
        (
            NameRequirement.FULL_WITH_OPTIONAL_USERNAME,
            {"first_name", "last_name"},
            {"first_name", "last_name", "username"},
        ),
        (NameRequirement.USERNAME_WITH_OPTIONAL_FULL, {"username"}, {"first_name", "last_name", "username"}),
        (NameRequirement.USERNAME_ONLY, {"username"}, {"username"}),
    ],
)
def test_each_requirement_asks_for_its_own_fields(requirement, required, offered):
    assert set(requirement.required) == required
    assert set(requirement.offered) == offered


def test_nothing_required_goes_unoffered(requirement):
    assert set(requirement.required) <= set(requirement.offered)


def test_every_requirement_leaves_somebody_with_a_name_or_a_handle(requirement):
    assert {"first_name", "username"} & set(requirement.required)


def test_a_handle_logs_in_only_where_every_account_has_one(requirement):
    expected = {"email", "username"} if "username" in requirement.required else {"email"}
    assert requirement.login_methods == expected


def test_the_project_signs_in_the_way_its_requirement_says():
    assert django_settings.ACCOUNT_LOGIN_METHODS == NameRequirement.current().login_methods


def test_the_requirement_reads_the_setting(settings):
    settings.NAME_REQUIREMENT = "full_only"
    assert NameRequirement.current() is NameRequirement.FULL_ONLY


def test_a_refusal_names_what_is_missing_and_what_was_never_asked_for():
    refused = NameRequirement.USERNAME_ONLY.refusals({"username": "", "first_name": "Ada", "last_name": ""})

    assert {name: code for name, (_, code) in refused.items()} == {"username": "required", "first_name": "not_offered"}


@pytest.mark.django_db
def test_a_signup_carrying_everything_its_requirement_offers_is_let_through(headless, requirement):
    names = {"first_name": "Ada", "last_name": "Lovelace", "username": "ada"}

    response = _signup(headless, **{name: names[name] for name in requirement.offered})

    assert response.status_code == 401
    user = User.objects.get(email="new@example.test")
    assert user.username == ("ada" if "username" in requirement.offered else None)
    assert user.get_full_name() == ("Ada Lovelace" if "first_name" in requirement.offered else "")


@pytest.mark.django_db
def test_a_signup_missing_what_its_requirement_needs_is_refused_field_by_field(headless, requirement):
    response = _signup(headless)

    assert response.status_code == 400
    assert _errors(response) == {(name, "required") for name in requirement.required}
    assert not User.objects.exists()


@pytest.mark.django_db
def test_a_signup_carrying_what_its_requirement_never_asks_for_is_refused(headless, requirement):
    names = {"first_name": "Ada", "last_name": "Lovelace", "username": "ada"}

    response = _signup(headless, **names)

    unasked = set(names) - set(requirement.offered)
    assert (response.status_code == 400) is bool(unasked)
    if unasked:
        assert _errors(response) == {(name, "not_offered") for name in unasked}


@pytest.mark.django_db
def test_no_handle_is_ever_invented(headless, settings):
    settings.NAME_REQUIREMENT = NameRequirement.FULL_ONLY
    settings.ACCOUNT_LOGIN_METHODS = NameRequirement.FULL_ONLY.login_methods

    _signup(headless, first_name="Ada", last_name="Lovelace")

    assert User.objects.get().username is None


def test_populating_the_username_leaves_it_as_it_was():
    user = User(email="ada@example.test", first_name="Ada")

    AccountAdapter().populate_username(None, user)

    assert user.username is None


@pytest.mark.django_db
def test_a_handle_signs_in_where_the_requirement_says_so(headless, requirement):
    user = User.objects.create_user(email="ada@example.test", username="ada", password=PASSWORD)
    EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)

    by_handle = headless.call("POST", "account:login", {"username": "ada", "password": PASSWORD})

    assert (by_handle.status_code == 200) is ("username" in requirement.login_methods)


@pytest.mark.django_db
def test_an_address_signs_in_under_every_requirement(headless, requirement):
    user = User.objects.create_user(email="ada@example.test", password=PASSWORD)
    EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)

    response = headless.call("POST", "account:login", {"email": "ada@example.test", "password": PASSWORD})

    assert response.status_code == 200


@pytest.mark.django_db
def test_many_people_may_have_no_handle():
    User.objects.create_user(email="ada@example.test", username="")
    User.objects.create_user(email="grace@example.test")

    assert list(User.objects.values_list("username", flat=True)) == [None, None]


@pytest.mark.django_db
def test_no_two_people_share_a_handle():
    User.objects.create_user(email="ada@example.test", username="ada")

    with pytest.raises(ValidationError, match="username already exists"):
        User.objects.create_user(email="other@example.test", username="ada")


@pytest.mark.django_db
def test_a_handle_is_normalized_like_django_does():
    user = User.objects.create_user(email="ada@example.test", username="ａｄａ")

    assert user.username == "ada"


def test_nobody_is_made_without_an_address():
    with pytest.raises(ValueError, match="email must be set"):
        User.objects.create_user(email="", username="ada")


@pytest.mark.django_db
def test_a_superuser_needs_only_an_address():
    user = User.objects.create_superuser(email="root@example.test", password=PASSWORD)

    assert (user.username, user.is_staff, user.is_superuser) == (None, True, True)


@pytest.mark.django_db
def test_a_superuser_may_still_have_a_handle():
    assert User.objects.create_superuser(email="root@example.test", username="root").username == "root"


@pytest.mark.parametrize(
    ("first_name", "last_name", "username", "expected"),
    [
        ("Ada", "Lovelace", "ada", "Ada Lovelace"),
        ("", "", "ada", "ada"),
        ("", "", None, "ada@example.test"),
    ],
)
def test_a_label_is_the_name_then_the_handle_then_the_address(first_name, last_name, username, expected):
    user = User(email="ada@example.test", first_name=first_name, last_name=last_name, username=username)

    assert label(user) == expected


def _me(client, user, data):
    return client.patch("/v0/users/me/", data, content_type="application/json", headers=versioned(user))


@pytest.mark.django_db
def test_somebody_with_no_handle_may_choose_one_later(client, requirement):
    user = User.objects.create_user(email="ada@example.test", first_name="Ada", last_name="Lovelace")
    client.force_login(user)

    response = _me(client, user, {"username": "ada"})

    user.refresh_from_db()
    offered = "username" in requirement.offered
    assert response.status_code == (200 if offered else 400)
    assert user.username == ("ada" if offered else None)


@pytest.mark.django_db
def test_a_handle_once_chosen_stays(client):
    user = User.objects.create_user(email="ada@example.test", username="ada")
    client.force_login(user)

    response = _me(client, user, {"username": "lovelace"})

    user.refresh_from_db()
    assert response.status_code == 200
    assert user.username == "ada"


@pytest.mark.django_db
def test_a_required_name_cannot_be_taken_back_off(client, requirement):
    user = User.objects.create_user(email="ada@example.test", username="ada", first_name="Ada", last_name="Lovelace")
    client.force_login(user)

    response = _me(client, user, {"first_name": "", "last_name": ""})

    if "first_name" in requirement.required:
        assert response.status_code == 400
        assert set(response.json()) >= {"first_name", "last_name"}
    else:
        assert response.status_code == 200


@pytest.mark.django_db
def test_a_name_the_requirement_never_asks_for_cannot_be_given(client, requirement):
    user = User.objects.create_user(email="ada@example.test", username="ada")
    client.force_login(user)

    response = _me(client, user, {"first_name": "Ada"})

    offered = "first_name" in requirement.offered
    assert response.status_code == (200 if offered else 400)
    if not offered:
        assert response.json() == {"first_name": ["This project does not ask for one."]}


@pytest.mark.django_db
def test_the_session_labels_somebody_with_no_handle_by_name(headless):
    user = User.objects.create_user(email="ada@example.test", first_name="Ada", last_name="Lovelace", password=PASSWORD)
    EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)

    response = headless.call("POST", "account:login", {"email": "ada@example.test", "password": PASSWORD})

    assert response.json()["data"]["user"]["display"] == "Ada Lovelace"
    assert "username" not in response.json()["data"]["user"]
