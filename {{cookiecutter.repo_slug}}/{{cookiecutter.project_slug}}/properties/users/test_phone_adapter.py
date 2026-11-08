"""The account adapter's phone half: a number kept on the account, and the code texted to it."""

import pytest
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st
from isik.django import sms
from isik.django.sms import SMSRateLimited
from isik.django.sms.backends.locmem import empty, respond

from apps.users.adapters.account import AccountAdapter
from apps.users.models.user import User


LOCAL = st.text(alphabet="abcdefghijklmnop", min_size=1, max_size=12)
EMAILS = LOCAL.map(lambda local: f"{local}@example.test")
PHONES = st.integers(min_value=0, max_value=9999).map(lambda n: f"+1415555{n:04d}")
CODES = st.text(alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789", min_size=4, max_size=9)


@pytest.mark.django_db
@given(email=EMAILS, phone=PHONES, verified=st.booleans())
def test_a_number_set_on_an_account_is_read_back_and_finds_the_account(email, phone, verified):
    adapter = AccountAdapter()
    with transaction.atomic():
        user = User.objects.create_user(email=email)
        assert adapter.get_phone(user) is None

        adapter.set_phone(user, phone, verified)
        user.refresh_from_db()
        assert adapter.get_phone(user) == (phone, verified)
        assert adapter.get_user_by_phone(phone) == user

        adapter.set_phone_verified(user, phone)
        user.refresh_from_db()
        assert adapter.get_phone(user) == (phone, True)
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("refused", [False, True])
@given(email=EMAILS, phone=PHONES, code=CODES)
def test_a_code_is_texted_or_its_failure_logged_never_raised(logged, refused, email, phone, code):
    with transaction.atomic():
        empty()
        logged.clear()
        user = User.objects.create_user(email=email)
        if refused:
            respond(phone, SMSRateLimited("Slow down", retry_after=None))

        AccountAdapter().send_verification_code_sms(user, phone, code)

        failures = [line for line in logged if line["event"] == "sms.failed"]
        if refused:
            assert sms.outbox == []
            assert [(line["user"], line["error"]) for line in failures] == [(str(user.pk), "SMSRateLimited")]
        else:
            (message,) = sms.outbox
            assert message.to == [phone]
            assert code in message.body
            assert failures == []
        transaction.set_rollback(True)
