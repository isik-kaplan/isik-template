from apps.users.tasks.health_check import ping


def test_ping_task_returns_pong():
    # Calling a Task instance directly runs it synchronously, in-process - no broker needed.
    assert ping() == "pong"
