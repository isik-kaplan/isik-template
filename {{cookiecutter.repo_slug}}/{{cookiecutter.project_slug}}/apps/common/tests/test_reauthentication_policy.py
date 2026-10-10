"""The DRF half of the re-authentication gate, on a viewset made up for the purpose - the generated
project has no DRF act of its own yet, and the first one it adds should find this already proven."""

import time

import pytest
from allauth.account.internal.flows.login import AUTHENTICATION_METHODS_SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import RecentlyProvedWhoTheyAre
from apps.users.models.user import User
from apps.users.reauthentication.proof import SPENT_AT_SESSION_KEY


class GatedViewSet(ProvesWhoTheyAre, viewsets.ViewSet):
    permission_classes = [AllowAny]
    reauthentication_exempt_actions = {"list": "reading the list takes nothing from anybody"}
    reauthentication_fields = {"partial_update": {"is_active"}}

    def list(self, request):
        return Response([])

    def create(self, request):
        return Response({}, status=201)

    def partial_update(self, request, pk=None):
        return Response({})

    def destroy(self, request, pk=None):
        return Response(status=204)

    def refuse_before_proving(self, request):
        if request.query_params.get("pk") == "missing":
            return {"detail": "There is nothing there to remove."}
        return super().refuse_before_proving(request)


@pytest.fixture
def session(db):
    store = SessionStore()
    store[AUTHENTICATION_METHODS_SESSION_KEY] = []
    return store


@pytest.fixture
def call(session):
    user = User.objects.create_user(username="alice", email="alice@example.test")

    def call(method, action, data=None, pk=None):
        path = f"/?pk={pk}" if pk else "/"
        request = getattr(APIRequestFactory(), method)(path, data, format="json")
        request.session = session
        force_authenticate(request, user)
        kwargs = {"pk": pk} if pk else {}
        return GatedViewSet.as_view({method: action})(request, **kwargs)

    call.user = user
    return call


def _prove(session):
    session[AUTHENTICATION_METHODS_SESSION_KEY] = [{"method": "password", "at": time.time()}]


def _refused(response):
    return response.status_code == 403 and response["X-Reauthentication-Required"] == "1"


def _acts(logged, event):
    return [(line["user"], line["act"]) for line in logged if line["event"] == event]


def test_demanding_a_proof_is_written_down_against_the_act_that_asked(call, logged):
    call("post", "create")

    assert _acts(logged, "reauthentication.demanded") == [(str(call.user.pk), "create")]
    assert _acts(logged, "reauthentication.spent") == []


def test_spending_a_proof_is_written_down_against_the_act_it_bought(call, session, logged):
    _prove(session)

    call("patch", "partial_update", {"is_active": False}, pk="1")

    assert _acts(logged, "reauthentication.spent") == [(str(call.user.pk), "partial_update")]
    assert _acts(logged, "reauthentication.demanded") == []


def test_an_act_is_refused_without_a_proof_and_says_which_gate_stopped_it(call):
    response = call("post", "create")

    assert _refused(response)
    assert response.data["detail"].code == RecentlyProvedWhoTheyAre.code


def test_a_proof_buys_one_act_and_the_next_one_asks_again(call, session):
    _prove(session)

    first = call("post", "create")
    second = call("post", "create")

    assert first.status_code == 201
    assert _refused(second)


def test_an_exempt_action_neither_asks_for_a_proof_nor_spends_one(call, session):
    _prove(session)

    assert call("get", "list").status_code == 200
    assert SPENT_AT_SESSION_KEY not in session
    assert call("post", "create").status_code == 201


def test_an_ordinary_field_is_not_an_act_but_a_serious_one_is(call, session):
    _prove(session)

    rename = call("patch", "partial_update", {"name": "Renamed"}, pk="1")
    spent_by_renaming = SPENT_AT_SESSION_KEY in session
    deactivate = call("patch", "partial_update", {"is_active": False}, pk="1")

    assert rename.status_code == 200
    assert not spent_by_renaming
    assert deactivate.status_code == 200
    assert _refused(call("patch", "partial_update", {"is_active": False}, pk="1"))


def test_an_act_that_would_be_refused_anyway_says_so_without_asking_for_a_proof(call):
    response = call("delete", "destroy", pk="missing")

    assert response.status_code == 400
    assert response.data == {"detail": "There is nothing there to remove."}
    assert "X-Reauthentication-Required" not in response
    assert _refused(call("delete", "destroy", pk="there"))


def test_an_act_refused_for_another_reason_keeps_the_proof(call, session):
    _prove(session)

    refused = call("delete", "destroy", pk="missing")
    spent_by_the_refusal = SPENT_AT_SESSION_KEY in session

    assert refused.status_code == 400
    assert not spent_by_the_refusal
    assert call("delete", "destroy", pk="there").status_code == 204


def test_an_act_with_nothing_to_refuse_early_is_proved_as_usual(call, session):
    _prove(session)

    assert call("delete", "destroy", pk="there").status_code == 204


class _RecordsFinalizing:
    def finalize_response(self, request, response, *args, **kwargs):
        self.handed = (request, response, args, kwargs)
        return response


class _GatedRecording(ProvesWhoTheyAre, _RecordsFinalizing):
    action = "create"


def test_finalizing_hands_drf_everything_it_was_given():
    view = _GatedRecording()
    request, response = APIRequestFactory().post("/"), Response(status=400)

    assert view.finalize_response(request, response, "positional", key="keyword") is response
    assert view.handed == (request, response, ("positional",), {"key": "keyword"})
