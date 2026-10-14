import pytest
from django.conf import settings
from django.contrib.admin.sites import site
from django.urls import reverse

from apps.oauth_provider.admin import ApplicationAdmin
from apps.oauth_provider.tests.conftest import Application
from apps.users.models.user import User


ADMIN_URLCONF = "{{ cookiecutter.project_slug }}.urls.admin"
HOST = {"HTTP_HOST": f"admin.{settings.PARENT_HOST}"}


def _url(name, *args):
    return reverse(f"admin:oauth_provider_application_{name}", args=args, urlconf=ADMIN_URLCONF)


@pytest.fixture
def superuser(client, db):
    user = User.objects.create_superuser(username="root", email="root@example.test", password="x")
    client.force_login(user)
    return user


def test_the_admin_registered_for_applications_is_this_projects():
    assert type(site._registry[Application]) is ApplicationAdmin


@pytest.mark.django_db
def test_a_superuser_reads_an_application_in_the_admin_and_changes_nothing(client, superuser, application):
    response = client.get(_url("change", application.pk), **HOST)

    assert response.status_code == 200
    assert response.context["has_change_permission"] is False
    assert client.post(_url("change", application.pk), {"approval": "withdrawn"}, **HOST).status_code == 403
    application.refresh_from_db()
    assert application.approval == "approved"


@pytest.mark.django_db
def test_nobody_adds_an_application_in_the_admin(client, superuser):
    assert client.get(_url("add"), **HOST).status_code == 403


@pytest.mark.django_db
def test_a_superuser_may_still_delete_one_from_the_admin(client, superuser, application):
    response = client.post(_url("delete", application.pk), {"post": "yes"}, **HOST)

    assert response.status_code == 302
    assert not Application.objects.filter(pk=application.pk).exists()
