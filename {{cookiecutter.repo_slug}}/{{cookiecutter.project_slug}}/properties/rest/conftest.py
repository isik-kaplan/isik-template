import pytest

from apps.users.models.user import User


@pytest.fixture(params=["superuser", "member", "anonymous"])
def caller(request, client, db):
    """Anonymous reaches the permission layer instead of the view, which is the half a stranger can reach."""
    if request.param != "anonymous":
        superuser = request.param == "superuser"
        person = User.objects.create_user(
            email="fuzz@example.test", username="fuzz", is_staff=superuser, is_superuser=superuser
        )
        client.force_login(person)
    return client
