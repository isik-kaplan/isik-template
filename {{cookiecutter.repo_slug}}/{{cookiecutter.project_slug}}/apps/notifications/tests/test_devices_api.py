"""A phone is registered by whoever signs in on it, seen only by them, and forgotten when they sign out there."""

import pytest
from django.urls import reverse

from apps.notifications.models import Device
from apps.users.models.user import User


DEVICES = reverse("notification-devices-list")
PHONE = {"platform": "apns", "token": "a1b2c3", "environment": "sandbox", "app_id": ""}


def _device(pk):
    return reverse("notification-devices-detail", args=[pk])


@pytest.mark.django_db
def test_signing_in_on_a_phone_registers_it_with_no_key(client, signed_in):
    response = client.post(DEVICES, PHONE, content_type="application/json")

    assert response.status_code == 201
    assert response.json() | {"id": None, "last_seen_at": None} == {
        **PHONE,
        "id": None,
        "is_active": True,
        "last_seen_at": None,
    }
    assert Device.objects.get().user == signed_in


@pytest.mark.django_db
def test_a_phone_signed_into_by_somebody_else_becomes_theirs(client, signed_in):
    bob = User.objects.create_user(username="bob", email="bob@example.test")
    Device.objects.create(user=bob, **PHONE, is_active=False)

    client.post(DEVICES, PHONE, content_type="application/json")

    device = Device.objects.get()
    assert (device.user, device.is_active) == (signed_in, True)


@pytest.mark.django_db
def test_only_your_own_phones_are_listed_or_forgotten(client, signed_in):
    bob = User.objects.create_user(username="bob", email="bob@example.test")
    theirs = Device.objects.create(user=bob, **{**PHONE, "token": "theirs"})
    mine = Device.objects.create(user=signed_in, **PHONE)

    assert [device["id"] for device in client.get(DEVICES).json()["results"]] == [str(mine.pk)]
    assert client.delete(_device(theirs.pk)).status_code == 404
    assert client.delete(_device(mine.pk)).status_code == 204
    assert list(Device.objects.all()) == [theirs]
