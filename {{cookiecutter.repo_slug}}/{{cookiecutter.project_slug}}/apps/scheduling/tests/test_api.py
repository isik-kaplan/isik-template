"""Staff see beat's tasks and do to each what its declaration allows; nobody else sees them."""

import pytest

from apps.common.links import api_path

from {{ cookiecutter.project_slug }}.celery import app


TASKS = api_path("scheduling:scheduled-tasks-list")


def _action(name, action):
    return api_path(f"scheduling:scheduled-tasks-{action}", name)


@pytest.fixture
def staff(signed_in):
    signed_in.is_staff = True
    signed_in.save(update_fields=["is_staff"])
    return signed_in


@pytest.mark.django_db
def test_staff_see_every_task_with_what_they_may_do_to_it(client, staff):
    tasks = {task["name"]: task for task in client.get(TASKS).json()["results"]}

    assert tasks["clear_expired_tokens"]["code"]["crontab"] == "30 4 * * *"
    assert tasks["clear_expired_tokens"]["may"] == ["view", "pause", "run_now"]
    assert tasks["isik.features.sweep"]["effective"]["every"] == 3600


@pytest.mark.django_db
def test_somebody_who_is_not_staff_sees_none_of_them(client, signed_in):
    assert client.get(TASKS).status_code == 403


@pytest.mark.django_db
def test_a_paused_task_stays_paused_until_resumed(client, staff):
    paused = client.post(_action("remove_unverified_accounts", "pause"))
    resumed = client.post(_action("remove_unverified_accounts", "resume"))

    assert (paused.status_code, paused.json()["effective"]["paused"]) == (200, True)
    assert resumed.json()["effective"]["paused"] is False


@pytest.mark.django_db
def test_running_a_task_now_sends_it_and_says_when(client, staff, monkeypatch):
    sent = []
    monkeypatch.setattr(app, "send_task", lambda name, **options: sent.append(name))

    response = client.post(_action("clear_expired_tokens", "run"))

    assert response.status_code == 200
    assert response.json()["run_by_hand_at"] is not None
    assert sent == ["clear_expired_tokens"]


@pytest.mark.django_db
def test_what_a_declaration_does_not_allow_is_refused(client, staff):
    task = client.get(_action("clear_expired_tokens", "detail"))

    response = client.patch(
        _action("clear_expired_tokens", "detail"),
        {"every": 60},
        content_type="application/json",
        HTTP_IF_MATCH=task["ETag"],
    )

    assert response.status_code == 403
