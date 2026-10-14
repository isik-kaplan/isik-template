import pytest
from django.db import IntegrityError, ProgrammingError, transaction

from apps.common.db import model_db_name
from apps.oauth_provider.models import ApprovedScope
from apps.oauth_provider.services import deciding
from apps.oauth_provider.sql.scopes import approved_within_requested
from apps.oauth_provider.tests.conftest import Application, make_application, permission, set_approval


def _application(alice, **fields):
    return make_application(name="Acme", user=alice, **fields)


@pytest.mark.django_db
def test_an_application_starts_out_waiting_for_a_superuser(alice):
    assert _application(alice).approval == "pending"


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["approved", "withdrawn", "disabled"])
def test_an_application_is_born_waiting_however_it_is_written(alice, approval):
    with pytest.raises(ProgrammingError, match="born_pending"), transaction.atomic():
        _application(alice, approval=approval)


@pytest.mark.django_db
def test_registering_in_auto_mode_may_bring_one_into_the_world_approved(alice):
    with deciding():
        assert _application(alice, approval="approved").approval == "approved"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("start", "end"), [("pending", "approved"), ("approved", "withdrawn"), ("approved", "disabled")]
)
def test_its_approval_moves_only_through_the_services_even_along_its_lifecycle(alice, start, end):
    application = _application(alice)
    set_approval(application, start)

    with pytest.raises(ProgrammingError, match="approval_moves_only_through_its_services"), transaction.atomic():
        Application.objects.filter(pk=application.pk).update(approval=end)


@pytest.mark.django_db
def test_the_rest_of_it_is_written_like_any_row(alice):
    application = _application(alice)

    Application.objects.filter(pk=application.pk).update(name="Renamed")

    assert Application.objects.get(pk=application.pk).name == "Renamed"


@pytest.mark.django_db
def test_nobody_is_ever_let_in_without_being_asked(alice):
    with pytest.raises(IntegrityError, match="always_asks"), transaction.atomic():
        _application(alice, skip_authorization=True)


@pytest.mark.django_db
@pytest.mark.parametrize("grant", ["client-credentials", "password", "implicit", "openid-hybrid"])
def test_only_the_grants_this_provider_serves_are_ever_stored(alice, grant):
    with pytest.raises(IntegrityError, match="served_grant_types"), transaction.atomic():
        _application(alice, authorization_grant_type=grant)


@pytest.mark.django_db
def test_a_device_application_is_stored(alice):
    application = _application(alice, authorization_grant_type=Application.GRANT_DEVICE_CODE, redirect_uris="")

    assert application.authorization_grant_type == Application.GRANT_DEVICE_CODE


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("start", "end"),
    [("approved", "pending"), ("withdrawn", "pending"), ("disabled", "pending"), ("pending", "disabled")],
)
def test_an_application_moves_only_along_its_lifecycle(alice, start, end):
    application = _application(alice)
    set_approval(application, start)

    with pytest.raises(ProgrammingError, match="Invalid transition"), deciding(), transaction.atomic():
        Application.objects.filter(pk=application.pk).update(approval=end)


@pytest.mark.django_db
def test_nothing_it_did_not_ask_for_is_ever_approved_however_it_is_written(alice):
    application = _application(alice)

    with pytest.raises(ProgrammingError, match="was never requested"), deciding(), transaction.atomic():
        application.approved_scopes.add(permission("users:manage:user"))


@pytest.mark.django_db
def test_what_it_asked_for_may_be_approved(alice):
    application = _application(alice)
    application.requested_scopes.add(permission("users:manage:user"))

    with deciding():
        application.approved_scopes.add(permission("users:manage:user"))

    assert list(application.approved_scopes.values_list("codename", flat=True)) == ["users:manage:user"]


@pytest.mark.django_db
def test_approving_a_scope_is_refused_outside_the_services(alice):
    application = _application(alice)
    application.requested_scopes.add(permission("users:manage:user"))

    with pytest.raises(ProgrammingError, match="approved_only_through_its_services"), transaction.atomic():
        application.approved_scopes.add(permission("users:manage:user"))


@pytest.mark.django_db
def test_taking_an_approved_scope_away_is_anybodys(application):
    application.approved_scopes.clear()

    assert not application.approved_scopes.exists()


@pytest.mark.django_db
@pytest.mark.parametrize(("approval", "usable"), [("pending", False), ("approved", True), ("withdrawn", False)])
def test_only_an_approved_application_is_one_dot_will_use(alice, approval, usable):
    assert Application(approval=approval).is_usable(None) is usable


def test_the_scope_ceiling_names_its_tables_and_columns_from_the_models():
    body = approved_within_requested(ApprovedScope)

    assert f"FROM {model_db_name(Application.requested_scopes.through)} r" in body
    assert "r.application_id = NEW.application_id" in body
    assert "r.permission_id = NEW.permission_id" in body
