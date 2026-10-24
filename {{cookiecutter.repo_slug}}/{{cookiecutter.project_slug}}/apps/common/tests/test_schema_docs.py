"""The exemption types for a field with nothing honest to say, which isik's documentation check accepts."""

import pytest
from django.conf import settings
from isik.django.apps.common.checks import Check, CheckOption

from apps.common.schema_docs import NoComment, NoHelpText


REASON = "Named for what it points at, and the caller just read the row it names."


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_it_is_empty_to_everything_that_reads_it(sentinel):
    """Django writes it to the column and drf-spectacular publishes it, so a sentinel that rendered
    would leak into both."""
    assert sentinel(reason=REASON) == ""


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_the_reason_is_kept_where_the_check_looks(sentinel):
    assert sentinel(reason=REASON).reason == REASON


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_a_placeholder_is_not_a_reason(sentinel):
    with pytest.raises(ValueError, match="at least 40 characters"):
        sentinel(reason="n/a")


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_it_deconstructs_as_itself(sentinel):
    """Written out as the empty string it equals, the migration state rebuilds `help_text`'s own
    default and `makemigrations` asks for the same change forever."""
    path, args, kwargs = sentinel(reason=REASON).deconstruct()

    assert path == f"apps.common.schema_docs.{sentinel.__name__}"
    assert (args, kwargs) == ((), {"reason": REASON})


def test_isiks_documentation_check_accepts_only_these_as_reasons_and_skips_library_fields():
    assert settings.ISIK_CHECKS[Check.DOCUMENTATION][CheckOption.EXEMPTION_TYPES] == [
        "apps.common.schema_docs.NoHelpText",
        "apps.common.schema_docs.NoComment",
    ]
    assert settings.ISIK_CHECKS[Check.DOCUMENTATION][CheckOption.INHERITED_FROM_LIBRARIES] is False
