import pytest
from django.conf import settings

from apps.users.models.user import User


@pytest.mark.django_db
def test_admin_host_serves_the_django_admin_site(client):
    user = User.objects.create_superuser(username="admin", email="admin@example.test", password="x")
    client.force_login(user)
    response = client.get("/", HTTP_HOST=f"admin.{settings.PARENT_HOST}")
    assert response.status_code == 200
