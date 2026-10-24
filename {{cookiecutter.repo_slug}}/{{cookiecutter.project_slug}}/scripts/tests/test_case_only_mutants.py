"""The check that flags two case spellings of one literal decided differently."""

import json
import textwrap
from pathlib import Path

import pytest

from scripts import case_only_mutants as module


def _tree(tmp_path, source, verdicts=None, name="thing.py"):
    (tmp_path / name).write_text(textwrap.dedent(source))
    (tmp_path / f"{name}.meta").write_text(json.dumps({"exit_code_by_key": verdicts or {}}))
    return tmp_path


KILLED, SURVIVED = 1, 0

TWO_SPELLINGS = """
    def x_fetch__mutmut_orig():
        return get_model("socialaccount", "SocialApp")

    def x_fetch__mutmut_1():
        return get_model("socialaccount", "SOCIALAPP")

    def x_fetch__mutmut_2():
        return get_model("socialaccount", "socialapp")
"""


def test_two_spellings_decided_the_same_way_are_not_flagged(tmp_path):
    tree = _tree(
        tmp_path,
        TWO_SPELLINGS,
        {"thing.x_fetch__mutmut_1": SURVIVED, "thing.x_fetch__mutmut_2": SURVIVED},
    )

    assert module.disagreements(tree, tmp_path / "absent.toml") == {}


def test_two_spellings_decided_differently_are_flagged(tmp_path):
    tree = _tree(
        tmp_path,
        TWO_SPELLINGS,
        {"thing.x_fetch__mutmut_1": KILLED, "thing.x_fetch__mutmut_2": SURVIVED},
    )

    assert module.disagreements(tree, tmp_path / "absent.toml") == {
        ("thing", "x_fetch", "SocialApp"): {
            "thing.x_fetch__mutmut_1": "killed",
            "thing.x_fetch__mutmut_2": "survived",
        }
    }


def test_a_site_with_one_spelling_is_not_a_site(tmp_path):
    tree = _tree(
        tmp_path,
        """
        def x_fetch__mutmut_orig():
            return get_model("socialapp")

        def x_fetch__mutmut_1():
            return get_model("SOCIALAPP")
        """,
        {"thing.x_fetch__mutmut_1": KILLED},
    )

    assert module.case_only_sites(tree) == {}


def test_a_literal_that_changed_for_another_reason_is_not_a_case_difference(tmp_path):
    tree = _tree(
        tmp_path,
        '\n    def x_wrapped__mutmut_orig():\n        return get_model("SocialApp")\n'
        '\n    def x_wrapped__mutmut_1():\n        return get_model("XXSocialAppXX")\n' + TWO_SPELLINGS,
        {"thing.x_fetch__mutmut_1": KILLED, "thing.x_fetch__mutmut_2": SURVIVED},
    )

    assert [site[1] for site in module.case_only_sites(tree)] == ["x_fetch"]


def test_a_docstring_is_not_a_site(tmp_path):
    tree = _tree(
        tmp_path,
        '''
        def x_fetch__mutmut_orig():
            """Fetch The Thing."""
            return 1

        def x_fetch__mutmut_1():
            """FETCH THE THING."""
            return 1

        def x_fetch__mutmut_2():
            """fetch the thing."""
            return 1
        ''',
        {"thing.x_fetch__mutmut_1": KILLED, "thing.x_fetch__mutmut_2": SURVIVED},
    )

    assert module.case_only_sites(tree) == {}


def test_an_exempt_mutant_counts_as_the_survival_its_entry_claims(tmp_path):
    tree = _tree(tmp_path, TWO_SPELLINGS, {"thing.x_fetch__mutmut_1": SURVIVED})
    equivalents = tmp_path / "equivalents.toml"
    equivalents.write_text('["thing.x_fetch__mutmut_2"]\nreason = "The upper-cased spelling."\n')

    assert module.disagreements(tree, equivalents) == {}


def test_a_tree_left_inside_the_tree_is_not_read(tmp_path):
    nested = tmp_path / "mutants"
    nested.mkdir()
    _tree(nested, TWO_SPELLINGS)
    # Sorts after it, so a `break` would lose it.
    _tree(tmp_path, TWO_SPELLINGS, name="zzz.py")

    assert [site[0] for site in module.case_only_sites(tmp_path)] == ["zzz"]


def test_a_mutant_whose_original_is_not_beside_it_is_skipped(tmp_path):
    tree = _tree(
        tmp_path,
        """
        def x_fetch__mutmut_1():
            return get_model("SOCIALAPP")
        """,
    )

    assert module.case_only_sites(tree) == {}


def test_a_mutant_that_added_a_literal_is_not_compared_by_position(tmp_path):
    tree = _tree(
        tmp_path,
        '\n    def x_added__mutmut_orig():\n        return get_model("SocialApp")\n'
        '\n    def x_added__mutmut_1():\n        return get_model("SocialApp", "extra")\n' + TWO_SPELLINGS,
    )

    # `continue`, not `break`.
    assert [site[1] for site in module.case_only_sites(tree)] == ["x_fetch"]


def test_a_mutant_that_recased_one_literal_and_added_another_is_not_a_site(tmp_path):
    """Truncating to the shorter list would pair the re-cased literal with its original."""
    tree = _tree(
        tmp_path,
        '\n    def x_both__mutmut_orig():\n        return get_model("SocialApp")\n'
        '\n    def x_both__mutmut_1():\n        return get_model("SOCIALAPP", "extra")\n',
    )

    assert module.case_only_sites(tree) == {}


def test_a_meta_that_is_not_json_is_skipped(tmp_path):
    (tmp_path / "thing.py.meta").write_text("{not json")

    assert module.verdicts(tmp_path, tmp_path / "absent.toml") == {}


def test_a_file_that_does_not_parse_is_skipped(tmp_path):
    (tmp_path / "broken.py").write_text("def (:\n")

    assert module.case_only_sites(tmp_path) == {}


@pytest.mark.parametrize(
    ("verdicts", "code"),
    [
        ({"thing.x_fetch__mutmut_1": SURVIVED, "thing.x_fetch__mutmut_2": SURVIVED}, 0),
        ({"thing.x_fetch__mutmut_1": KILLED, "thing.x_fetch__mutmut_2": SURVIVED}, 1),
    ],
)
def test_the_command_exits_on_whether_it_found_anything(tmp_path, capsys, verdicts, code):
    tree = _tree(tmp_path, TWO_SPELLINGS, verdicts)

    assert module.main(["--tree", str(tree)]) == code
    assert ("x_fetch" in capsys.readouterr().out) is bool(code)


def test_a_clean_run_says_so_and_nothing_else(tmp_path, capsys):
    _tree(tmp_path, TWO_SPELLINGS, {"thing.x_fetch__mutmut_1": SURVIVED, "thing.x_fetch__mutmut_2": SURVIVED})

    assert module.main(["--tree", str(tmp_path)]) == 0
    assert capsys.readouterr().out == f"{module.CLEAN}\n"


def test_a_flagged_run_names_the_site_the_change_and_each_verdict(tmp_path, capsys):
    _tree(tmp_path, TWO_SPELLINGS, {"thing.x_fetch__mutmut_1": KILLED, "thing.x_fetch__mutmut_2": SURVIVED})

    assert module.main(["--tree", str(tmp_path)]) == 1
    assert capsys.readouterr().out == (
        "1 site(s) where two spellings of one literal were decided differently.\n"
        f"{module.PREAMBLE}\n"
        "thing.x_fetch - 'SocialApp'\n"
        "    killed     thing.x_fetch__mutmut_1\n"
        "    survived   thing.x_fetch__mutmut_2\n"
    )


def test_the_tree_it_reads_is_a_path_and_defaults_to_the_one_beside_it(monkeypatch):
    asked = []
    monkeypatch.setattr(module, "disagreements", lambda tree: asked.append(tree) or {})

    module.main([])
    module.main(["--tree", "/elsewhere"])

    assert asked == [module.DEFAULT_TREE, Path("/elsewhere")]
    assert all(isinstance(tree, Path) for tree in asked)


def test_its_own_description_is_what_help_prints(capsys):
    with pytest.raises(SystemExit):
        module.main(["--help"])

    assert "differ only in the case of a string literal" in capsys.readouterr().out


def test_a_file_it_cannot_read_does_not_stop_the_walk(tmp_path):
    (tmp_path / "aaa_broken.py").write_text("def (:\n")
    _tree(tmp_path, TWO_SPELLINGS, {}, name="zzz_thing.py")

    assert len(module.case_only_sites(tmp_path)) == 1


def test_a_function_it_skips_does_not_stop_the_file(tmp_path):
    _tree(tmp_path, '\n    def x_alone__mutmut_1():\n        return get_model("SOCIALAPP")\n' + TWO_SPELLINGS)

    assert len(module.case_only_sites(tmp_path)) == 1


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("thing.py", "thing"),
        ("deep/down/thing.py", "deep.down.thing"),
        ("deep/__init__.py", "deep"),
    ],
    ids=["flat", "nested", "a package's own module"],
)
def test_a_file_is_named_the_way_the_queue_and_the_registry_name_it(tmp_path, path, expected):
    target = tmp_path / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(textwrap.dedent(TWO_SPELLINGS))

    assert [site[0] for site in module.case_only_sites(tmp_path)] == [expected]


def test_a_meta_without_the_key_is_skipped_and_the_next_one_is_not(tmp_path):
    (tmp_path / "aaa.py.meta").write_text(json.dumps({"something_else": {}}))
    _tree(tmp_path, TWO_SPELLINGS, {"thing.x_fetch__mutmut_1": SURVIVED}, name="zzz.py")

    assert module.verdicts(tmp_path, tmp_path / "absent.toml") == {"thing.x_fetch__mutmut_1": "survived"}


def test_an_unreadable_meta_is_skipped_and_the_next_one_is_not(tmp_path):
    (tmp_path / "aaa.py.meta").write_text("{not json")
    _tree(tmp_path, TWO_SPELLINGS, {"thing.x_fetch__mutmut_1": KILLED}, name="zzz.py")

    assert module.verdicts(tmp_path, tmp_path / "absent.toml") == {"thing.x_fetch__mutmut_1": "killed"}


def test_the_registry_is_the_only_word_on_a_mutant_the_run_never_ran(tmp_path):
    tree = _tree(tmp_path, TWO_SPELLINGS, {"thing.x_fetch__mutmut_1": KILLED})
    equivalents = tmp_path / "equivalents.toml"
    equivalents.write_text('["thing.x_fetch__mutmut_2"]\nreason = "The lower-cased spelling."\n')

    assert module.disagreements(tree, equivalents) == {
        ("thing", "x_fetch", "SocialApp"): {
            "thing.x_fetch__mutmut_1": "killed",
            "thing.x_fetch__mutmut_2": "survived",
        }
    }
    # Without the registry, one verdict never disagrees.
    assert module.disagreements(tree, tmp_path / "absent.toml") == {}


def test_a_registry_entry_never_overrules_a_verdict_the_run_recorded(tmp_path):
    equivalents = tmp_path / "equivalents.toml"
    equivalents.write_text('["thing.x_fetch__mutmut_1"]\nreason = "Claimed unkillable."\n')
    tree = _tree(tmp_path, TWO_SPELLINGS, {"thing.x_fetch__mutmut_1": KILLED})

    assert module.verdicts(tree, equivalents)["thing.x_fetch__mutmut_1"] == "killed"


def test_a_function_with_a_docstring_is_read_from_its_first_real_statement(tmp_path):
    _tree(
        tmp_path,
        "\n".join(
            [
                "",
                "    def x_fetch__mutmut_orig():",
                '        """What it fetches."""',
                '        return get_model("SocialApp")',
                "",
                "    def x_fetch__mutmut_1():",
                '        """What it fetches."""',
                '        return get_model("SOCIALAPP")',
                "",
                "    def x_fetch__mutmut_2():",
                '        """What it fetches."""',
                '        return get_model("socialapp")',
                "",
            ]
        ),
    )

    assert [site[2] for site in module.case_only_sites(tmp_path)] == ["SocialApp"]
