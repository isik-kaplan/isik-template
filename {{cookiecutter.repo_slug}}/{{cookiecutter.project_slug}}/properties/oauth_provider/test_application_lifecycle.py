"""Any sequence of the application services keeps the lifecycle's rules after every step.

The rules are written out here a second time, apart from the triggers that enforce them: which moves
the lifecycle allows, that approved scopes stay within the requested ones, and that an application
taken down holds no working token.
"""

from datetime import timedelta

import pytest
from django.contrib.auth.models import Permission
from django.db import DatabaseError, transaction
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from oauth2_provider.models import get_access_token_model, get_refresh_token_model

from apps.oauth_provider import services
from apps.oauth_provider.models import Application
from apps.users.models.user import User
from apps.users.permissions import VOCABULARY


pytestmark = pytest.mark.django_db

AccessToken = get_access_token_model()
RefreshToken = get_refresh_token_model()
Approval = Application.Approval

MOVES = {
    (Approval.PENDING, Approval.APPROVED),
    (Approval.PENDING, Approval.WITHDRAWN),
    (Approval.APPROVED, Approval.WITHDRAWN),
    (Approval.APPROVED, Approval.DISABLED),
    (Approval.DISABLED, Approval.APPROVED),
    (Approval.WITHDRAWN, Approval.APPROVED),
    (Approval.DISABLED, Approval.WITHDRAWN),
}
TARGETS = {
    "approve": Approval.APPROVED,
    "restore": Approval.APPROVED,
    "withdraw": Approval.WITHDRAWN,
    "disable": Approval.DISABLED,
}
TAKEN_DOWN = (Approval.WITHDRAWN, Approval.DISABLED)

# Every scope there is: a Permission row exists only for a declared name.
POOL = range(len(VOCABULARY.by_name))
SCOPES = st.sets(st.sampled_from(POOL))
STEPS = st.lists(
    st.one_of(
        st.tuples(st.sampled_from(sorted(TARGETS)), SCOPES),
        st.tuples(st.just("request"), SCOPES),
        st.tuples(st.just("rotate"), st.booleans()),
        st.tuples(st.just("mint"), st.none()),
    ),
    max_size=8,
)


@pytest.fixture
def pool(db):
    rows = list(Permission.objects.order_by("pk"))
    assert len(rows) == len(POOL)
    return rows


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="owner", email="owner@example.test")


def _scopes(pool, indexes):
    return {pool[index] for index in indexes}


def _live_tokens(application):
    return (
        AccessToken.objects.filter(application=application).count()
        + RefreshToken.objects.filter(application=application, revoked__isnull=True).count()
    )


def _mint(application, owner, n):
    access = AccessToken.objects.create(
        user=owner, application=application, token=f"access-{n}", expires=timezone.now() + timedelta(hours=1)
    )
    RefreshToken.objects.create(user=owner, application=application, token=f"refresh-{n}", access_token=access)


def _apply(step, argument, application, pool, owner, n):
    if step in TARGETS:
        action = {
            "approve": lambda: services.approve_application(application, _scopes(pool, argument)),
            "restore": lambda: services.restore_application(application),
            "withdraw": lambda: services.withdraw_application(application),
            "disable": lambda: services.disable_application(application),
        }[step]
        action()
    elif step == "request":
        services.change_requested_scopes(application, _scopes(pool, argument))
    elif step == "rotate":
        services.rotate_client_secret(application, revoke=argument)
    else:
        _mint(application, owner, n)


def _expected_refusal(step, argument, before, requested):
    if step not in TARGETS:
        return False
    target = TARGETS[step]
    if before != target and (before, target) not in MOVES:
        return True
    return step == "approve" and not argument <= requested


# Each run also starts with a move the lifecycle refuses, which a drawn sequence meets only some of the time.
@pytest.mark.parametrize("lead", [(), (("disable", set()),), (("withdraw", set()), ("disable", set()))])
@pytest.mark.parametrize("mode", ["approval", "auto"])
@given(drawn=STEPS, first_request=SCOPES)
def test_every_step_keeps_the_lifecycle_rules(lead, drawn, first_request, mode, pool, owner, settings):
    steps = [*lead, *drawn]
    settings.OAUTH_PROVIDER_MODE = mode
    with transaction.atomic():
        application = services.register_application(
            user=owner,
            name="Fuzzed",
            redirect_uris="https://client.example.test/cb",
            requested_scopes=_scopes(pool, first_request),
        )
        assert application.approval == (Approval.APPROVED if mode == "auto" else Approval.PENDING)

        for n, (step, argument) in enumerate(steps):
            application.refresh_from_db()
            before = application.approval
            requested = {pool.index(scope) for scope in application.requested_scopes.all()}
            tokens_before = _live_tokens(application)
            refused = False
            try:
                with transaction.atomic():
                    _apply(step, argument, application, pool, owner, n)
            except DatabaseError:
                refused = True
            application.refresh_from_db()

            assert refused == _expected_refusal(step, argument, before, requested), (step, argument, before)
            if refused:
                assert application.approval == before
                assert _live_tokens(application) == tokens_before
            elif step in TARGETS:
                assert application.approval == TARGETS[step]
            takes_down = step in ("withdraw", "disable") and not refused
            if takes_down or (step == "rotate" and argument):
                assert _live_tokens(application) == 0
            elif step == "rotate":
                assert _live_tokens(application) == tokens_before
            if step == "request" and mode == "auto" and before in (Approval.APPROVED, Approval.DISABLED):
                assert set(application.approved_scopes.all()) == set(application.requested_scopes.all())

            assert set(application.approved_scopes.all()) <= set(application.requested_scopes.all())

        transaction.set_rollback(True)
