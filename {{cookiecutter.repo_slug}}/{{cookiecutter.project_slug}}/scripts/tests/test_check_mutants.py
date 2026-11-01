"""That a run which answered about only some of its mutants is not read as a pass."""

import json

import pytest

from scripts import check_mutants


@pytest.mark.parametrize(
    ("stats", "answered"),
    [
        ({}, 0),
        ({"total": 9, "killed": 1, "skipped": 1, "unending": 1, "caught_by_type_check": 1, "survived": 1}, 5),
        ({"total": 9, "timeout": 2, "not_checked": 7}, 2),
    ],
)
def test_what_counts_as_an_answer(stats, answered):
    assert check_mutants.verdicts_in(stats) == answered


@pytest.mark.parametrize(
    ("stats", "unrun"),
    [
        ({}, False),
        ({"total": 2}, True),
        ({"total": 2, "not_checked": 2}, True),
        # A shard of nothing but mutants that never end did run.
        ({"total": 2, "unending": 2}, False),
        ({"total": 2, "killed": 1, "unending": 1}, False),
    ],
)
def test_a_run_with_no_answers_at_all_is_unrun(stats, unrun):
    assert check_mutants.unrun(stats) is unrun


@pytest.mark.parametrize(
    ("stats", "short"),
    [
        ({}, 0),
        ({"total": 60, "killed": 58}, 2),
        ({"total": 60, "killed": 58, "unending": 2}, 0),
        # More answers than mutants is not a negative shortfall.
        ({"total": 1, "killed": 1, "survived": 1}, 0),
    ],
)
def test_how_many_a_run_never_answered_about(stats, short):
    assert check_mutants.unfinished(stats) == short


def test_unending_is_a_column_and_not_alive():
    assert "unending" in check_mutants.BUCKETS
    assert "unending" not in check_mutants.ALIVE


@pytest.fixture
def registries(tmp_path):
    equivalents, exemptions = tmp_path / "mutation-equivalents.toml", tmp_path / "mutation-exemptions.toml"
    equivalents.write_text('["m.x_one__mutmut_1"]\nreason = "r"\n')
    exemptions.write_text('["m.x_whole"]\nreason = "r"\n')
    return equivalents, exemptions


@pytest.fixture
def tree(tmp_path):
    (tmp_path / "mutants/m").mkdir(parents=True)
    return tmp_path / "mutants"


def _hold(tree, **codes):
    (tree / "m/mod.py.meta").write_text(json.dumps({"exit_code_by_key": codes}))


def test_the_tree_names_what_was_never_answered_less_the_registry_and_what_was_settled_elsewhere(tree, registries):
    _hold(
        tree,
        **{
            "m.x_dead__mutmut_1": 1,
            "m.x_lost__mutmut_1": None,
            "m.x_later__mutmut_1": None,
            "m.x_one__mutmut_1": None,
            "m.x_whole__mutmut_3": None,
        },
    )

    assert check_mutants.unanswered(tree, *registries, {"m.x_later__mutmut_1": "killed"}) == ["m.x_lost__mutmut_1"]


@pytest.fixture
def run(tmp_path, registries, monkeypatch):
    """`main` against files under `tmp_path`; the tree's layout is checked elsewhere."""
    monkeypatch.setattr(check_mutants, "tree_problems", lambda tree: [])

    def run(*stats, tree=tmp_path / "absent", extra=()):
        paths = []
        for index, numbers in enumerate(stats):
            path = tmp_path / f"shard{index}.json"
            path.write_text(json.dumps(numbers))
            paths.append(str(path))
        equivalents, exemptions = registries
        return check_mutants.main(
            [
                *paths,
                "--tree",
                str(tree),
                "--kills",
                str(tmp_path / "absent.jsonl"),
                "--equivalents",
                str(equivalents),
                "--exemptions",
                str(exemptions),
                *extra,
            ]
        )

    return run


def test_totals_that_fall_short_fail_when_they_are_all_there_is(run, capsys):
    assert run({"total": 60, "killed": 58}, {"total": 1, "killed": 1}) == 1
    assert capsys.readouterr().out.endswith(
        "shard0: checked 58 of 60 mutants - 2 were never answered about, so this run's silence is not a pass.\n"
    )


def test_a_single_run_without_its_tree_is_judged_by_its_totals(run, capsys):
    assert run({"total": 3, "killed": 2}) == 1
    assert "checked 2 of 3 mutants - 1 were never answered" in capsys.readouterr().out


def test_with_the_tree_on_disk_the_missing_are_named_instead(run, tree, capsys):
    _hold(tree, **{"m.x_dead__mutmut_1": 1, "m.x_lost__mutmut_1": None, "m.x_whole__mutmut_1": None})

    assert run({"total": 3, "killed": 1, "not_checked": 2}, tree=tree) == 1
    printed = capsys.readouterr().out
    assert printed.endswith(
        "1 mutant(s) were never answered about, so this run's silence is not a pass: m.x_lost__mutmut_1\n"
    )
    assert "checked 1 of 3" not in printed


def test_a_registry_mutant_phase_one_skipped_is_not_missing(run, tree, capsys):
    _hold(tree, **{"m.x_dead__mutmut_1": 1, "m.x_whole__mutmut_1": None})

    assert run({"total": 2, "killed": 1, "not_checked": 1}, tree=tree, extra=["--phase-one"]) == 0
    assert capsys.readouterr().out.endswith("0 mutant(s) for phase two to settle\n")


def test_a_mutant_phase_two_settled_is_not_missing(run, tree, tmp_path, capsys):
    _hold(tree, **{"m.x_dead__mutmut_1": 1, "m.x_later__mutmut_1": None})
    report = tmp_path / "confirmed.json"
    report.write_text(json.dumps({"m.x_later__mutmut_1": {"verdict": "killed"}}))

    assert run({"total": 2, "killed": 1, "not_checked": 1}, tree=tree, extra=["--confirmed", str(report)]) == 0
    assert capsys.readouterr().out.endswith("no surviving mutants (1 confirmed against the whole suite)\n")


def test_a_missing_phase_two_report_settles_nothing(run, tree, tmp_path, capsys):
    _hold(tree, **{"m.x_later__mutmut_1": None})

    assert run({"total": 1, "survived": 1}, tree=tree, extra=["--confirmed", str(tmp_path / "absent.json")]) == 1
    assert "m.x_later__mutmut_1" in capsys.readouterr().out


def test_a_run_that_answered_nothing_is_said_once(run, tree, capsys):
    _hold(tree, **{"m.x_lost__mutmut_1": None})

    assert run({"total": 1}, tree=tree) == 1
    printed = capsys.readouterr().out
    assert "none of the 1 mutants have a verdict" in printed
    assert "never answered about" not in printed


def test_a_run_of_mutants_that_never_end_passes_and_shows_them(run, tree, capsys):
    _hold(tree, **{"m.x_burned__mutmut_1": -24})

    assert run({"total": 1, "unending": 1}, tree=tree) == 0
    printed = capsys.readouterr().out
    assert printed.splitlines()[0].split() == ["run", *check_mutants.BUCKETS]
    assert printed.endswith("no surviving mutants\n")
