from django.conf import settings


def test_every_request_runs_in_a_transaction():
    """Idempotency claims commit inside it; a view opts out only with isik's not_atomic(reason)."""
    assert all(database["ATOMIC_REQUESTS"] for database in settings.DATABASES.values())
