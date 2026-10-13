import pytest
from django.db import ProgrammingError, transaction

from apps.common.db import model_db_name
from apps.oauth_provider.models import ApprovedScope
from apps.oauth_provider.sql.scopes import approved_within_requested
from apps.oauth_provider.tests.conftest import REDIRECT_URI, Application, permission, set_approval


def _application(alice, **fields):
    return Application.objects.create(name="Acme", user=alice, redirect_uris=REDIRECT_URI, **fields)


@pytest.mark.django_db
def test_an_application_starts_out_waiting_for_a_superuser(alice):
    assert _application(alice).approval == "pending"


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["withdrawn", "disabled"])
def test_an_application_is_never_born_taken_down(alice, approval):
    with pytest.raises(ProgrammingError, match="born_pending_or_approved"), transaction.atomic():
        _application(alice, approval=approval)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("start", "end"),
    [("approved", "pending"), ("withdrawn", "pending"), ("disabled", "pending"), ("pending", "disabled")],
)
def test_an_application_moves_only_along_its_lifecycle(alice, start, end):
    application = _application(alice)
    set_approval(application, start)

    with pytest.raises(ProgrammingError, match="Invalid transition"), transaction.atomic():
        Application.objects.filter(pk=application.pk).update(approval=end)


@pytest.mark.django_db
def test_nothing_it_did_not_ask_for_is_ever_approved_however_it_is_written(alice):
    application = _application(alice)

    with pytest.raises(ProgrammingError, match="was never requested"), transaction.atomic():
        application.approved_scopes.add(permission("users:manage:user"))


@pytest.mark.django_db
def test_what_it_asked_for_may_be_approved(alice):
    application = _application(alice)
    application.requested_scopes.add(permission("users:manage:user"))

    application.approved_scopes.add(permission("users:manage:user"))

    assert list(application.approved_scopes.values_list("codename", flat=True)) == ["users:manage:user"]


@pytest.mark.django_db
@pytest.mark.parametrize(("approval", "usable"), [("pending", False), ("approved", True), ("withdrawn", False)])
def test_only_an_approved_application_is_one_dot_will_use(alice, approval, usable):
    assert Application(approval=approval).is_usable(None) is usable


def test_the_scope_ceiling_names_its_tables_and_columns_from_the_models():
    body = approved_within_requested(ApprovedScope)

    assert f"FROM {model_db_name(Application.requested_scopes.through)} r" in body
    assert "r.application_id = NEW.application_id" in body
    assert "r.permission_id = NEW.permission_id" in body
