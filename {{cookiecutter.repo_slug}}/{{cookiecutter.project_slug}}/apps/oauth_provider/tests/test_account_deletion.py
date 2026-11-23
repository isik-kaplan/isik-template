"""Asking for an account to be deleted shuts every application out of it, whoever registered them."""

from datetime import timedelta

import pytest
from django.utils import timezone
from isik.django.apps.accounts.deletion import request_deletion

from apps.oauth_provider.services import AccessToken, RefreshToken


@pytest.mark.django_db
def test_asking_revokes_what_every_application_holds_for_them_and_nobody_elses(application, alice, django_user_model):
    later = timezone.now() + timedelta(hours=1)
    theirs = AccessToken.objects.create(user=alice, application=application, token="theirs", expires=later)
    RefreshToken.objects.create(user=alice, application=application, token="their-refresh", access_token=theirs)
    # One with no refresh token of its own, as the client credentials grant leaves.
    AccessToken.objects.create(user=alice, application=application, token="alone", expires=later)
    bob = django_user_model.objects.create_user(email="bob@example.test")
    others = AccessToken.objects.create(user=bob, application=application, token="others", expires=later)

    request_deletion(alice)

    assert not AccessToken.objects.filter(user=alice).exists()
    assert RefreshToken.objects.get(token="their-refresh").revoked is not None
    assert AccessToken.objects.filter(pk=others.pk).exists()
