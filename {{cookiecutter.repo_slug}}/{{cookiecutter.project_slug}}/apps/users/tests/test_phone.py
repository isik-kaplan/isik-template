"""Phone numbers through allauth's own flows, kept on User by the account adapter."""

import pytest
from django.core.cache import cache
from django.utils import translation
from isik.django import sms
from isik.django.sms import SMSRateLimited, Status
from isik.django.sms.backends.locmem import respond

from apps.users.adapters.account import AccountAdapter
from apps.users.models.user import User
from apps.users.tests.conftest import PASSWORD


NUMBER = "+14155550123"
ANOTHER = "+14155550199"


def _signup(headless, **fields):
    return headless.call(
        "POST", "account:signup", {"email": "new@example.test", "username": "new", "password": PASSWORD, **fields}
    )


def _pending(response):
    return {flow["id"] for flow in response.json()["data"]["flows"] if flow.get("is_pending")}


def _code():
    (message,) = sms.outbox
    return message.body.split(" ")[0]


@pytest.mark.django_db
def test_signup_texts_the_number_a_code_that_verifies_it(headless):
    response = _signup(headless, phone=NUMBER)

    assert _pending(response) == {"verify_phone"}
    (message,) = sms.outbox
    assert message.to == [NUMBER]
    assert User.objects.get(email="new@example.test").phone_verified is False

    verified = headless.call("POST", "account:verify_phone", {"code": _code()})

    # The address is confirmed next, as without a number.
    assert _pending(verified) == {"verify_email"}
    user = User.objects.get(email="new@example.test")
    assert (user.phone, user.phone_verified) == (NUMBER, True)


@pytest.mark.django_db
def test_a_code_that_never_arrived_can_be_sent_again(headless):
    _signup(headless, phone=NUMBER)
    # Thirty seconds on: allauth texts a number once every 30 seconds at most.
    cache.clear()

    response = headless.call("POST", "account:resend_phone_verification_code")

    assert response.status_code == 200
    assert [message.to for message in sms.outbox] == [[NUMBER], [NUMBER]]
    second = sms.outbox[-1]
    headless.call("POST", "account:verify_phone", {"code": second.body.split(" ")[0]})
    assert User.objects.get(email="new@example.test").phone_verified is True


@pytest.mark.django_db
def test_a_mistyped_number_is_corrected_at_the_code_step_without_a_proof(headless):
    _signup(headless, phone=ANOTHER)

    response = headless.call("POST", "account:manage_phone", {"phone": NUMBER})

    assert response.status_code == 202
    corrected = sms.outbox[-1]
    assert corrected.to == [NUMBER]
    headless.call("POST", "account:verify_phone", {"code": corrected.body.split(" ")[0]})
    user = User.objects.get(email="new@example.test")
    assert (user.phone, user.phone_verified) == (NUMBER, True)


@pytest.mark.django_db
def test_a_wrong_code_leaves_the_number_unverified(headless):
    _signup(headless, phone=NUMBER)

    response = headless.call("POST", "account:verify_phone", {"code": "WRONG-CODE"})

    assert response.status_code == 400
    assert User.objects.get(email="new@example.test").phone_verified is False
{%- if cookiecutter.phone == "required" %}


@pytest.mark.django_db
def test_signup_without_a_number_is_refused(headless):
    response = _signup(headless)

    assert response.status_code == 400
    assert {error["param"] for error in response.json()["errors"]} == {"phone"}


@pytest.mark.django_db
def test_the_number_signs_in_with_the_password(headless, alice):
    alice.phone, alice.phone_verified = NUMBER, True
    alice.save()

    response = headless.call("POST", "account:login", {"phone": NUMBER, "password": PASSWORD})

    assert response.status_code == 200
    assert response.json()["data"]["user"]["email"] == alice.email


@pytest.mark.django_db
def test_the_number_does_not_sign_in_with_a_wrong_password(headless, alice):
    alice.phone, alice.phone_verified = NUMBER, True
    alice.save()

    response = headless.call("POST", "account:login", {"phone": NUMBER, "password": "not-" + PASSWORD})

    assert response.status_code == 400
{%- else %}


@pytest.mark.django_db
def test_signup_without_a_number_texts_nothing(headless):
    response = _signup(headless)

    assert _pending(response) == {"verify_email"}
    assert sms.outbox == []


@pytest.mark.django_db
def test_the_number_never_signs_in(headless, alice):
    alice.phone, alice.phone_verified = NUMBER, True
    alice.save()

    response = headless.call("POST", "account:login", {"phone": NUMBER, "password": PASSWORD})

    assert response.status_code == 400
{%- endif %}


@pytest.mark.django_db
def test_changing_the_number_asks_who_they_are_then_texts_the_new_one(headless, signed_in):
    signed_in.phone, signed_in.phone_verified = NUMBER, True
    signed_in.save()

    assert headless.call("POST", "account:manage_phone", {"phone": ANOTHER}).status_code == 401
    assert sms.outbox == []

    headless.prove()
    response = headless.call("POST", "account:manage_phone", {"phone": ANOTHER})

    assert response.status_code == 202
    (message,) = sms.outbox
    assert message.to == [ANOTHER]
    # Until the new number is verified, the old one stays.
    signed_in.refresh_from_db()
    assert (signed_in.phone, signed_in.phone_verified) == (NUMBER, True)

    verified = headless.call("POST", "account:verify_phone", {"code": _code()})

    assert verified.status_code == 200
    signed_in.refresh_from_db()
    assert (signed_in.phone, signed_in.phone_verified) == (ANOTHER, True)


@pytest.mark.django_db
def test_the_account_answers_with_its_number_and_whether_it_is_verified(headless, signed_in):
    signed_in.phone, signed_in.phone_verified = NUMBER, False
    signed_in.save()

    response = headless.call("GET", "account:manage_phone")

    assert response.json()["data"] == [{"phone": NUMBER, "verified": False}]


@pytest.mark.django_db
def test_an_account_with_no_number_has_none(alice):
    alice.phone = None

    assert AccountAdapter().get_phone(alice) is None


@pytest.mark.django_db
def test_no_number_is_stored_as_null_so_many_accounts_can_have_none(alice):
    alice.phone = ""
    alice.save()

    User.objects.create_user(email="bob@example.test", password=PASSWORD, phone="")

    assert User.objects.filter(phone__isnull=True).count() == 2


@pytest.mark.django_db
def test_verifying_a_new_number_puts_it_on_the_account_in_place_of_the_old(alice):
    alice.phone, alice.phone_verified = NUMBER, False
    alice.save()

    AccountAdapter().set_phone_verified(alice, ANOTHER)

    alice.refresh_from_db()
    assert (alice.phone, alice.phone_verified) == (ANOTHER, True)


@pytest.mark.django_db
def test_a_number_finds_only_its_own_account(alice):
    alice.phone = NUMBER
    alice.save()

    assert AccountAdapter().get_user_by_phone(NUMBER) == alice
    assert AccountAdapter().get_user_by_phone(ANOTHER) is None


@pytest.mark.django_db
def test_setting_a_number_writes_only_the_number(alice):
    """A field changed meanwhile, by another request, isn't put back."""
    User.objects.filter(pk=alice.pk).update(first_name="Changed")

    AccountAdapter().set_phone(alice, NUMBER, True)

    alice.refresh_from_db()
    assert (alice.first_name, alice.phone, alice.phone_verified) == ("Changed", NUMBER, True)


@pytest.mark.django_db
@pytest.mark.parametrize(("saved", "texted"), [("tr", "tr"), ("", "en")])
def test_the_code_is_in_the_language_its_recipient_saved(monkeypatch, alice, a_second_language, saved, texted):
    alice.language = saved
    alice.save()
    # Stands in for a catalog: the text is whichever language is active while it's written.
    monkeypatch.setattr("apps.users.adapters.account.gettext", lambda message: translation.get_language())

    with translation.override("en"):
        AccountAdapter().send_verification_code_sms(alice, NUMBER, "ABCD-EFGH")

    (message,) = sms.outbox
    assert message.body == texted


@pytest.mark.django_db
def test_the_code_names_the_project(settings, alice):
    AccountAdapter().send_verification_code_sms(alice, NUMBER, "ABCD-EFGH")

    (message,) = sms.outbox
    assert message.body == f"ABCD-EFGH is your {settings.PROJECT_NAME} code."


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("answer", "error"),
    [(Status.REJECTED, "SMSRecipientsRefused"), (SMSRateLimited("Slow down", retry_after=None), "SMSRateLimited")],
)
def test_a_text_the_provider_refuses_is_logged_rather_than_failing_the_request(alice, logged, answer, error):
    respond(NUMBER, answer)

    AccountAdapter().send_verification_code_sms(alice, NUMBER, "ABCD-EFGH")

    (line,) = [line for line in logged if line["event"] == "sms.failed"]
    assert line["user"] == str(alice.pk)
    assert line["error"] == error
    assert NUMBER not in str(line)
