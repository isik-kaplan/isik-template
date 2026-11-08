from types import SimpleNamespace

import pytest
from allauth.core.context import request_context
from django.core import mail
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.test import RequestFactory
from hypothesis import given
from hypothesis import strategies as st

from apps.notifications.kinds import ACCOUNT_CHANGED
from apps.notifications.models import Notice
from apps.users.adapters.account import AccountAdapter
from apps.users.models.user import User


LOCAL = st.text(alphabet="abcdefghijklmnop", min_size=1, max_size=12)
EMAILS = LOCAL.map(lambda local: f"{local}@example.test")


@given(ip=st.ip_addresses().map(str), header=st.booleans())
def test_the_client_ip_is_whatever_nginx_or_the_socket_says(ip, header):
    meta = {"HTTP_X_CLIENT_IP": ip, "REMOTE_ADDR": ""} if header else {"REMOTE_ADDR": ip}

    assert AccountAdapter().get_client_ip(RequestFactory().get("/", **meta)) == ip


@given(junk=st.sampled_from(["", "not-an-ip", "999.1.1.1"]))
def test_a_request_with_no_address_at_all_is_refused(junk):
    request = RequestFactory().get("/", HTTP_X_CLIENT_IP=junk, REMOTE_ADDR="")

    with pytest.raises(PermissionDenied):
        AccountAdapter().get_client_ip(request)


@pytest.mark.django_db
@pytest.mark.parametrize("terms_version", ["", "terms-v1"])
@given(email=EMAILS, password=st.text(min_size=8, max_size=20))
def test_a_signup_records_the_terms_exactly_when_some_were_published(monkeypatch, terms_version, email, password):
    monkeypatch.setattr("apps.users.adapters.account.TERMS_VERSION", terms_version)
    with transaction.atomic():
        form = SimpleNamespace(cleaned_data={"email": email, "password1": password})

        user = AccountAdapter().save_user(RequestFactory().get("/"), User(), form)

        user.refresh_from_db()
        assert user.email == email
        assert user.check_password(password)
        assert user.username is None
        assert user.terms_version == terms_version
        assert (user.terms_accepted_at is not None) == bool(terms_version)
        transaction.set_rollback(True)


@pytest.mark.django_db
# allauth sends a mail about an account with its user, and one to an address nobody holds without.
@pytest.mark.parametrize(
    ("prefix", "has_user"),
    [
        ("account/email/email_confirmation", True),
        ("account/email/password_changed", True),
        ("account/email/email_changed", True),
        ("account/email/unknown_account", False),
    ],
)
@given(email=EMAILS)
def test_an_account_mail_reaches_its_address_and_a_change_reaches_the_inbox(prefix, has_user, email):
    with transaction.atomic():
        mail.outbox.clear()
        user = User.objects.create_user(email=email) if has_user else None

        with request_context(RequestFactory().get("/")):
            AccountAdapter().send_mail(prefix, email, {"user": user} if user else {})

        (sent,) = mail.outbox
        assert sent.to == [email]
        assert sent.subject
        changed = has_user and prefix.rsplit("/", 1)[-1] in ACCOUNT_CHANGED.variants
        assert any(notice.kind.name == "account_changed" for notice in Notice.objects.all()) == changed
        transaction.set_rollback(True)
