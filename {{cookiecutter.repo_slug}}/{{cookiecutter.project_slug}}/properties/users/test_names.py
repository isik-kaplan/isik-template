from hypothesis import given
from hypothesis import strategies as st

from apps.users.models.user import User
from apps.users.names import NAMES, NOT_OFFERED, REQUIRED, NameRequirement, label


REQUIREMENTS = st.sampled_from(NameRequirement)
# Empty, blank-but-given and given: a signup sends all three.
VALUE = st.sampled_from(["", "a", " "])
VALUES = st.dictionaries(st.sampled_from(NAMES), VALUE)


@given(requirement=REQUIREMENTS)
def test_whatever_is_required_is_also_offered(requirement):
    assert set(requirement.required) <= set(requirement.offered) <= set(NAMES)


@given(requirement=REQUIREMENTS)
def test_nobody_can_be_left_without_a_name(requirement):
    required = set(requirement.required)
    assert {"first_name", "last_name"} <= required or "username" in required


@given(requirement=REQUIREMENTS, values=VALUES)
def test_a_field_is_refused_exactly_when_missing_and_required_or_given_and_not_offered(requirement, values):
    expected = {}
    for name, value in values.items():
        if name in requirement.required and value == "":
            expected[name] = REQUIRED
        if name not in requirement.offered and value != "":
            expected[name] = NOT_OFFERED

    assert requirement.refusals(values) == expected


@given(requirement=REQUIREMENTS)
def test_a_handle_logs_in_only_where_every_signup_has_one(requirement):
    assert ("username" in requirement.login_methods) == ("username" in requirement.required)
    assert "email" in requirement.login_methods


NAME = st.sampled_from(["", "Ada", "Lovelace"])


@given(first=NAME, last=NAME, username=st.sampled_from([None, "ada"]))
def test_a_label_is_the_name_then_the_handle_then_the_address(first, last, username):
    person = User(first_name=first, last_name=last, username=username, email="ada@example.test")

    full = " ".join(part for part in (first, last) if part)
    assert label(person) == (full or username or "ada@example.test")
