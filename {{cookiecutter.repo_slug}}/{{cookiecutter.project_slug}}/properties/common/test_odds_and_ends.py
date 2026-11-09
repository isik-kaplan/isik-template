"""Small guarantees of the common app, each stated over whatever it is handed."""

import uuid
from io import StringIO
from types import SimpleNamespace
{%- if cookiecutter.storage != "disk" %}
from urllib.parse import parse_qs, urlsplit
{%- endif %}

import pgtrigger
import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management import CommandError, call_command
from drf_spectacular.drainage import GENERATOR_STATS, warn
from hypothesis import given
from hypothesis import strategies as st
from isik.django.apps.common.db import APPEND_ONLY_TRIGGERS
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.common import checks
from apps.common.api.request_policies import RecentlyProvedWhoTheyAre
from apps.common.fields import EncryptedField
from apps.common.files import serve_file
from apps.common.logging.events import declare
from apps.common.sql import refuse_plaintext
from apps.core.management.commands import openapi_document
from apps.users.models.user import User


NAME = st.from_regex(r"[a-z]{1,8}", fullmatch=True)


@pytest.mark.parametrize("field_name", ["username", "email", "first_name"])
@given(prefix=st.from_regex(r"[a-z]{1,6}:", fullmatch=True))
def test_the_plaintext_guard_names_its_column_and_refuses_values_without_the_prefix(field_name, prefix):
    body = refuse_plaintext(field_name, prefix)(User)
    column = User._meta.get_field(field_name).column

    assert f"NEW.\"{column}\" NOT LIKE '{prefix}%'" in body
    assert "RAISE EXCEPTION" in body


# Every model guarded, or the first missing a guard: picked first, so a run has both.
@pytest.mark.parametrize("guarded", [True, False])
@given(
    models=st.dictionaries(
        NAME, st.sets(st.sampled_from([*APPEND_ONLY_TRIGGERS, "another"]), max_size=3), min_size=1, max_size=4
    ),
    dropped=st.sampled_from(APPEND_ONLY_TRIGGERS),
)
def test_every_event_model_missing_a_guard_is_named_and_only_those(monkeypatch, guarded, models, dropped):
    first = next(iter(models))
    if guarded:
        models = {name: held | set(APPEND_ONLY_TRIGGERS) for name, held in models.items()}
    else:
        models = {**models, first: models[first] - {dropped}}
    stubs = {name: type(name, (), {"_meta": SimpleNamespace(label=f"stub.{name}")}) for name in models}
    with monkeypatch.context() as patched:
        patched.setattr(checks, "event_models", lambda: list(stubs.values()))
        patched.setattr(
            pgtrigger,
            "registered",
            lambda: [(stubs[name], SimpleNamespace(name=trigger)) for name, held in models.items() for trigger in held],
        )
        errors = checks.event_models_are_append_only(app_configs=None)

    missing = sorted(f"stub.{name}" for name, held in models.items() if not set(APPEND_ONLY_TRIGGERS) <= held)
    if missing:
        (error,) = errors
        assert error.msg == f"These event models are not append-only: {', '.join(missing)}."
    else:
        assert errors == []


# An enciphered-looking row drawn too: only a row without the prefix reads back as it is.
@given(value=st.one_of(st.text(max_size=10), st.text(max_size=10).map(lambda text: EncryptedField.PREFIX + text)))
def test_without_a_key_a_secret_is_refused_unless_empty_and_an_unenciphered_row_reads_as_it_is(settings, value):
    settings.CREDENTIAL_KEY = ""
    field = EncryptedField()

    if value:
        with pytest.raises(ImproperlyConfigured):
            field.get_prep_value(value)
    else:
        assert field.get_prep_value(value) == value
    if not value.startswith(EncryptedField.PREFIX):
        assert field.from_db_value(value, None, None) == value


@given(name=st.text(max_size=12).filter(lambda name: not name.replace(".", "").replace("_", "").isalpha()))
def test_an_event_name_off_the_dotted_shape_is_never_declared(name):
    with pytest.raises(ValueError, match="dotted lowercase"):
        declare(name, 20)


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
@given(action=NAME)
def test_a_write_to_a_view_declaring_no_acts_is_always_one(method, action):
    request = Request(getattr(APIRequestFactory(), method)("/", {}, format="json"))
    view = SimpleNamespace(action=action)

    assert RecentlyProvedWhoTheyAre.names_a_serious_field(request, view) is True


@given(message=st.text(st.characters(codec="ascii", categories=["L"]), min_size=1, max_size=20))
def test_the_document_command_refuses_any_generator_warning(monkeypatch, message):
    def warns():
        warn(message)
        return {}

    with monkeypatch.context() as patched:
        patched.setitem(openapi_document.DOCUMENTS, "api", warns)
        try:
            with pytest.raises(CommandError, match="emitted warnings"):
                call_command("openapi_document", "api", stdout=StringIO())
        finally:
            GENERATOR_STATS.reset()


@pytest.fixture
def stored():
    name = default_storage.save(f"serve-file/{uuid.uuid4().hex}/stored.txt", ContentFile(b"hello"))
    yield name
    default_storage.delete(name)


@pytest.mark.parametrize("as_attachment", [False, True])
@given(filename=st.none() | st.from_regex(r"[A-Za-z0-9]{1,10}\.txt", fullmatch=True))
def test_a_file_is_left_to_nginx_under_its_own_name_or_the_given_one(stored, as_attachment, filename):
    response = serve_file(stored, as_attachment=as_attachment, filename=filename)

{%- if cookiecutter.storage == "disk" %}
    assert response["X-Accel-Redirect"] == f"/internal/media/{stored}"
    assert response["Content-Type"] == "text/plain"
{%- else %}
    assert response["X-Accel-Redirect"] == "/internal/storage/"
    assert parse_qs(urlsplit(response["X-Storage-Url"]).query)["X-Amz-Expires"] == ["60"]
{%- endif %}
    assert response.content == b""
    disposition = response["Content-Disposition"]
    assert disposition.startswith("attachment" if as_attachment else "inline")
    assert (filename or "stored.txt") in disposition
