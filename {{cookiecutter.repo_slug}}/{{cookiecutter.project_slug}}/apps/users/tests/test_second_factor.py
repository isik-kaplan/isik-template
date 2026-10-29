"""While somebody keeps two-factor sign-in on, their last second factor stays - whichever kind it is."""

import pytest
from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from isik.django.apps.features.operations import set_setting

from apps.users.second_factor import KeepingDeleteWebAuthnInput


def _factor(user, kind):
    return Authenticator.objects.create(user=user, type=kind, data={})


@pytest.mark.django_db
def test_without_it_any_factor_may_go(alice):
    totp = _factor(alice, Authenticator.Type.TOTP)

    assert get_adapter().can_delete_authenticator(totp) is True


@pytest.mark.django_db
def test_with_it_the_last_factor_stays_and_one_of_two_may_go(alice):
    set_setting(alice, "two_factor_required", True)
    totp = _factor(alice, Authenticator.Type.TOTP)

    assert get_adapter().can_delete_authenticator(totp) is False
    _factor(alice, Authenticator.Type.WEBAUTHN)
    assert get_adapter().can_delete_authenticator(totp) is True


@pytest.mark.django_db
def test_deleting_every_passkey_at_once_is_refused_when_nothing_else_is_left(alice):
    set_setting(alice, "two_factor_required", True)
    passkeys = [_factor(alice, Authenticator.Type.WEBAUTHN) for _ in range(2)]

    every = KeepingDeleteWebAuthnInput({"authenticators": [each.pk for each in passkeys]}, user=alice)
    one = KeepingDeleteWebAuthnInput({"authenticators": [passkeys[0].pk]}, user=alice)

    assert (every.is_valid(), one.is_valid()) == (False, True)


@pytest.mark.django_db
def test_only_their_own_factors_and_only_factors_count(alice):
    set_setting(alice, "two_factor_required", True)
    totp = _factor(alice, Authenticator.Type.TOTP)
    _factor(alice, Authenticator.Type.RECOVERY_CODES)
    bob = alice.__class__.objects.create_user(username="bob", email="bob@example.test")
    _factor(bob, Authenticator.Type.WEBAUTHN)

    assert get_adapter().can_delete_authenticator(totp) is False


@pytest.mark.django_db
def test_naming_no_passkey_is_refused_as_input_rather_than_failing(alice):
    set_setting(alice, "two_factor_required", True)

    assert KeepingDeleteWebAuthnInput({}, user=alice).is_valid() is False
