"""`manage.py triggers`: what each trigger does, read off its compiled body. Each reading is pinned to a real trigger,
since a pattern that matches nothing passes as quietly as a correct one."""

import json
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from apps.common.management.commands.triggers import Command, _effects


def _run(**options):
    out = StringIO()
    call_command("triggers", stdout=out, **options)
    return out.getvalue()


def _named(model, name, **options):
    rows = json.loads(_run(format="json", model=model, **options))
    return [trigger for row in rows if row["model"] == model for trigger in row["triggers"] if trigger["name"] == name]


def test_every_trigger_says_what_it_does():
    """`see --sql` is a gap in the patterns, not a trigger that does nothing."""
    rows = json.loads(_run(format="json"))

    assert rows
    assert [
        f"{row['model']}:{trigger['name']}"
        for row in rows
        for trigger in row["triggers"]
        if trigger["does"] == ["see --sql"]
    ] == []


@pytest.mark.parametrize(
    ("model", "name", "effect"),
    [
        ("features.Feature", "protect_feature_delete", "refuses the write"),
        ("oauth_provider.Application", "insert_insert", "writes oauth_provider_application_event"),
        ("oauth_provider.Application", "bump_version", "stamps version"),
        ("users.UserGroupsConcurrencyLock", "lock_groups_owner", "locks users_user"),
    ],
)
def test_a_body_is_described_by_what_it_does(model, name, effect):
    (trigger,) = _named(model, name)

    assert effect in trigger["does"]


def test_a_comparison_is_not_read_as_an_assignment():
    """The notice trigger compares NEW."approval" inside an IF before it writes."""
    (notice,) = _named("oauth_provider.Application", "notify_application_taken_down")

    assert notice["does"] == ["writes notifications_notice"]


def test_a_condition_is_rendered_rather_than_repred():
    (trigger,) = _named("oauth_provider.Application", "born_pending")

    assert trigger["condition"] == "NOT (NEW.\"approval\" = 'pending')"


def test_a_body_nothing_matches_says_so():
    assert _effects("RETURN NEW;") == ["see --sql"]


def test_the_model_filter_matches_part_of_the_label():
    rows = json.loads(_run(format="json", model="oauth_provider.application"))

    assert [row["model"] for row in rows] == ["oauth_provider.Application", "oauth_provider.ApplicationEvent"]
    assert rows[0]["table"] == "oauth_provider_application"


def test_the_sql_is_carried_only_when_asked_for():
    (quiet,) = _named("oauth_provider.Application", "bump_version")
    (loud,) = _named("oauth_provider.Application", "bump_version", sql=True)

    assert "sql" not in quiet
    assert "NEW." in loud["sql"]


def test_the_text_groups_triggers_under_their_table():
    printed = _run(model="oauth_provider.Application")

    assert "oauth_provider.Application  (oauth_provider_application)" in printed
    assert "  update_update  AFTER UPDATE ROW" in printed
    assert "    when OLD.* IS DISTINCT FROM NEW.*" in printed
    assert "    writes oauth_provider_application_event" in printed
    assert "RETURN NULL;" not in printed
    assert "RETURN NULL;" in _run(model="oauth_provider.Application", sql=True)


def test_the_options_are_parsed_as_documented():
    """Through argv, as manage.py hands them over: keyword options skip the parser's choices and defaults."""
    parser = Command().create_parser("manage.py", "triggers")
    # Read off the actions: the printed help wraps a line wherever the terminal width puts it.
    helps = {action.dest: action.help for action in parser._actions}

    assert helps["model"] == "Only models whose label contains this, case-insensitively."
    assert helps["sql"] == "Print each trigger's compiled body."
    assert "--format {text,json}" in parser.format_usage()
    assert {"model": None, "sql": False, "format": "text"}.items() <= vars(parser.parse_args([])).items()
    assert parser.parse_args(["--sql"]).sql is True


def test_a_format_it_does_not_know_is_refused():
    with pytest.raises(CommandError, match="invalid choice: 'xml'"):
        call_command("triggers", "--format=xml", stdout=StringIO())


def test_the_json_is_indented_and_names_each_triggers_installed_name():
    out = StringIO()
    call_command("triggers", "--format=json", "--model=oauth_provider.application", stdout=out)
    rows = json.loads(out.getvalue())

    assert out.getvalue() == json.dumps(rows, indent=2) + "\n"
    (bump,) = [trigger for trigger in rows[0]["triggers"] if trigger["name"] == "bump_version"]
    assert bump["installed_as"].startswith("pgtrigger_bump_version_")
    assert bump["timing"] == "BEFORE UPDATE ROW"


def test_the_sql_flag_reaches_the_text_output_from_the_command_line():
    out = StringIO()
    call_command("triggers", "--sql", "--model=oauth_provider.application", stdout=out)

    assert "RETURN NULL;" in out.getvalue()
