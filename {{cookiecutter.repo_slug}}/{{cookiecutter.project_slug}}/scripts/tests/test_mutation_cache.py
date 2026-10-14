"""That a restored cache forgets exactly what it must, and keeps the rest.

Both halves are load-bearing and they fail in opposite directions. Forgetting too little leaves a
kill standing that no test earns any more, which reads as a pass; forgetting too much throws away
the hours the cache exists to save.
"""

import json

import pytest

from scripts import mutation_cache


MODELS = "apps/users/models.py"
TEST_A = "apps/users/tests/test_a.py"
TEST_A_ID = f"{TEST_A}::test_a"
OTHER_ID = "apps/other/tests/test_b.py::test_b"


def _stats():
    return {
        "duration_by_test": {TEST_A_ID: 0.1, OTHER_ID: 0.2},
        "tests_by_mangled_function_name": {
            "apps.users.models.save": [TEST_A_ID],
            "apps.other.models.load": [OTHER_ID],
            # Traced by nothing, which is what a mutant recorded as having no tests looks like.
            "apps.users.models.lonely": [],
        },
        "watched_file_hashes": {"pyproject.toml": "abc"},
        "git_commit": "deadbeef",
    }


def _verdicts():
    return {
        "apps.users.models.save__mutmut_1": 1,
        "apps.other.models.load__mutmut_1": 1,
        "apps.users.models.lonely__mutmut_1": 33,
        "apps.users.models.gone__mutmut_1": 0,
        "apps.users.models.typed__mutmut_1": 37,
        "apps.users.models.fresh__mutmut_1": None,
    }


@pytest.fixture
def tree(tmp_path):
    """A repository with a cache in it, laid out the way a restore leaves one."""
    (tmp_path / "apps/users/tests").mkdir(parents=True)
    (tmp_path / "mutants/apps/users").mkdir(parents=True)
    (tmp_path / TEST_A).write_text("def test_a():\n    pass\n")
    (tmp_path / "apps/users/tests/conftest.py").write_text("import pytest\n")
    (tmp_path / "apps/users/tests/factories.py").write_text("USER = 1\n")
    (tmp_path / MODELS).write_text("def save():\n    pass\n")
    (tmp_path / "mutants/mutmut-stats.json").write_text(json.dumps(_stats()))
    (tmp_path / f"mutants/{MODELS}.meta").write_text(
        json.dumps(
            {
                "exit_code_by_key": _verdicts(),
                "hash_by_function_name": {},
                "type_check_error_by_key": {},
                "durations_by_key": {},
                "estimated_durations_by_key": {},
            }
        )
    )
    return tmp_path


@pytest.fixture
def paths(tree):
    return {
        "root": tree,
        "baseline": tree / "mutants/.test-hashes.json",
        "stats_path": tree / "mutants/mutmut-stats.json",
        "tree": tree / "mutants",
    }


def _stamp(paths):
    """Put the baseline where a previous run would have left it."""
    _, current = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])
    mutation_cache.write_baseline(current, paths["baseline"])


def _codes(paths):
    return json.loads((paths["tree"] / f"{MODELS}.meta").read_text())["exit_code_by_key"]


def test_a_restored_cache_with_no_baseline_is_distrusted_whole(paths):
    """The one failure that is silent. Verdicts are on disk and nothing says which tests earned
    them, so the only safe reading is that none of them can be vouched for."""
    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert TEST_A in changed
    assert "apps/users/tests/conftest.py" in changed


def test_a_cold_tree_with_no_baseline_has_nothing_to_distrust(tmp_path):
    """No cache means no verdict to be wrong about, so a first run must not be charged for one."""
    (tmp_path / "apps/users/tests").mkdir(parents=True)
    (tmp_path / TEST_A).write_text("def test_a():\n    pass\n")

    changed, current = mutation_cache.changed_watched_files(root=tmp_path, baseline=tmp_path / "none.json")

    assert changed == set()
    assert TEST_A in current


def test_an_untouched_tree_changes_nothing(paths):
    _stamp(paths)

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert changed == set()


def test_an_edited_test_is_seen(paths):
    """Named by the test rather than by the file, which is what keeps its neighbours' kills."""
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_a():\n    assert True\n")

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert changed == {f"{TEST_A}::test_a"}


def test_a_deleted_test_is_seen(paths):
    """A file that has gone cannot be hashed, so it has to be found by its absence from the set."""
    _stamp(paths)
    (paths["root"] / TEST_A).unlink()

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert changed == {TEST_A, f"{TEST_A}::test_a"}


def test_the_tree_is_not_watched_as_if_it_were_source(paths):
    """`mutants/` holds a copy of every test, and a copy changing is the copy being rebuilt."""
    _stamp(paths)
    (paths["tree"] / "apps/users/tests").mkdir(parents=True, exist_ok=True)
    (paths["tree"] / TEST_A).write_text("def test_a():\n    assert False\n")

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert changed == set()


@pytest.mark.parametrize(
    ("name", "is_module"),
    [("apps/x/tests/test_a.py", True), ("apps/x/tests/a_test.py", True), ("apps/x/tests/factories.py", False)],
)
def test_what_counts_as_a_test_module(name, is_module):
    assert mutation_cache._is_test_module(name) is is_module


def test_a_test_module_invalidates_only_its_own_tests():
    assert mutation_cache.stale_tests({TEST_A}, _stats()) == {TEST_A_ID}


def test_a_conftest_invalidates_its_whole_directory():
    """It owns no test id of its own, so matching ids against its name would find nothing at all -
    and a fixture edit would silently keep every verdict it could have changed."""
    assert mutation_cache.stale_tests({"apps/users/tests/conftest.py"}, _stats()) == {TEST_A_ID}


def test_a_conftest_does_not_reach_a_sibling_directory():
    assert OTHER_ID not in mutation_cache.stale_tests({"apps/users/tests/conftest.py"}, _stats())


def test_a_root_conftest_reaches_everything():
    assert mutation_cache.stale_tests({"conftest.py"}, _stats()) == {TEST_A_ID, OTHER_ID}


@pytest.mark.parametrize("name", ["apps/users/tests/factories.py", "apps/x/templates/mail.html", "locale/tr/x.po"])
def test_anything_else_invalidates_everything(name):
    """Nothing maps a factory or a template onto a test id, so the honest answer is all of them."""
    assert mutation_cache.stale_tests({name}, _stats()) is None


def test_everything_is_not_the_same_as_every_id_we_know_of():
    """`None` rather than the full set, because once the map is suspect its enumeration is too."""
    assert mutation_cache.stale_tests({"apps/users/tests/factories.py"}, {}) is None


def test_a_changed_test_clears_the_verdict_it_could_have_earned(paths):
    cleared = mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] is None
    assert cleared


def test_a_kill_whose_tests_did_not_change_is_kept(paths):
    """The whole point of the cache. Clearing this one would make every run a cold run."""
    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.other.models.load__mutmut_1"] == 1


def test_a_mutant_with_no_tests_clears_though_nothing_traces_it(paths):
    """It has an empty traced set, so matching on traces would make its verdict unreachable - and
    writing the test that covers it would never register."""
    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.lonely__mutmut_1"] is None


def test_a_survivor_clears_though_nothing_traces_it(paths):
    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.gone__mutmut_1"] is None


def test_a_type_check_verdict_is_left_to_mutmut(paths):
    """mutmut resets these itself against the type checker's own set, and a reset one would come
    back as `no tests` rather than as what it was."""
    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.typed__mutmut_1"] == 37


def test_an_already_cleared_verdict_is_not_counted_twice(paths):
    cleared = mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert cleared == 3


def test_a_wholesale_change_clears_even_an_untouched_kill(paths):
    mutation_cache.invalidate_verdicts_for({"apps/users/tests/factories.py"}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.other.models.load__mutmut_1"] is None


def test_a_missing_map_is_wholesale(paths):
    """Without the map there is nothing to match a kill against, so none of them can be vouched
    for - and returning early here would leave every one of them standing."""
    paths["stats_path"].unlink()

    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.other.models.load__mutmut_1"] is None


def test_nothing_changed_means_nothing_cleared(paths):
    assert mutation_cache.invalidate_verdicts_for(set(), paths["stats_path"], paths["tree"]) == 0
    assert _codes(paths)["apps.users.models.save__mutmut_1"] == 1


def test_the_prune_drops_a_changed_test_from_both_structures(paths):
    """`load_stats` merges traced sets with `|=`, so a re-trace only ever adds. An edge left in one
    structure is never overwritten, and the prune would look like it had worked."""
    dropped = mutation_cache.prune_stats_map({TEST_A}, paths["stats_path"])
    after = json.loads(paths["stats_path"].read_text())

    assert dropped == 1
    assert TEST_A_ID not in after["duration_by_test"]
    assert after["tests_by_mangled_function_name"]["apps.users.models.save"] == []


def test_the_prune_leaves_an_unrelated_test_traced(paths):
    mutation_cache.prune_stats_map({TEST_A}, paths["stats_path"])
    after = json.loads(paths["stats_path"].read_text())

    assert after["duration_by_test"][OTHER_ID] == 0.2
    assert after["tests_by_mangled_function_name"]["apps.other.models.load"] == [OTHER_ID]


def test_a_wholesale_change_empties_the_map(paths):
    dropped = mutation_cache.prune_stats_map({"apps/users/tests/factories.py"}, paths["stats_path"])
    after = json.loads(paths["stats_path"].read_text())

    assert dropped == 2
    assert after["duration_by_test"] == {}
    assert all(tests == [] for tests in after["tests_by_mangled_function_name"].values())


def test_the_prune_leaves_mutmuts_own_baseline_alone(paths):
    """`watched_file_hashes` and `git_commit` are what mutmut compares against to decide what it
    re-traces. Moving them here would tell it a full run had happened when none had."""
    mutation_cache.prune_stats_map({"apps/users/tests/factories.py"}, paths["stats_path"])
    after = json.loads(paths["stats_path"].read_text())

    assert after["watched_file_hashes"] == {"pyproject.toml": "abc"}
    assert after["git_commit"] == "deadbeef"


def test_the_prune_does_nothing_when_nothing_changed(paths):
    assert mutation_cache.prune_stats_map(set(), paths["stats_path"]) == 0


def test_the_prune_does_nothing_without_a_map(paths):
    paths["stats_path"].unlink()

    assert mutation_cache.prune_stats_map({TEST_A}, paths["stats_path"]) == 0


def test_a_changed_test_that_the_map_never_traced_drops_nothing(paths):
    assert mutation_cache.prune_stats_map({"apps/zzz/tests/test_unknown.py"}, paths["stats_path"]) == 0


def test_a_module_whose_source_is_gone_is_removed_from_the_tree(paths):
    """mutmut never refreshes a copy it already has, so a renamed file keeps its old copy and is
    still collected from inside the tree."""
    (paths["tree"] / "apps/users/gone.py").write_text("x = 1\n")

    removed = mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert not (paths["tree"] / "apps/users/gone.py").exists()
    assert removed == 1


def test_a_module_that_still_exists_is_kept(paths):
    (paths["tree"] / MODELS).write_text("def save():\n    pass\n")

    mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert (paths["tree"] / MODELS).exists()


@pytest.mark.parametrize("sidecar", [".meta", ".spans"])
def test_a_departed_module_takes_its_sidecars_with_it(paths, sidecar):
    """Judged against its own source rather than against its module, so walk order cannot strand
    one after the module it belongs to has already been unlinked."""
    (paths["tree"] / f"apps/users/gone.py{sidecar}").write_text("{}")

    mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert not (paths["tree"] / f"apps/users/gone.py{sidecar}").exists()


def test_a_living_modules_sidecar_is_kept(paths):
    mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert (paths["tree"] / f"{MODELS}.meta").exists()


def test_the_cache_itself_is_never_pruned(paths):
    """It lives under `mutants/` and mirrors nothing, so a sweep that forgot to ask what a file
    mirrors would delete the very thing it is run to protect."""
    mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert paths["stats_path"].exists()


def test_a_file_entry_whose_source_is_gone_is_removed(paths):
    """mutmut's copy skips a source that has gone, so without this its mirror outlives it - and a
    stale `conftest.py` in the tree is a fixture the suite still runs."""
    (paths["tree"] / "conftest.py").write_text("import pytest\n")

    removed = mutation_cache.prune_orphaned_tree([], ["conftest.py"], root=paths["root"], tree=paths["tree"])

    assert not (paths["tree"] / "conftest.py").exists()
    assert removed == 1


def test_a_file_entry_that_still_exists_is_kept(paths):
    (paths["root"] / "manage.py").write_text("print(1)\n")
    (paths["tree"] / "manage.py").write_text("print(1)\n")

    mutation_cache.prune_orphaned_tree([], ["manage.py"], root=paths["root"], tree=paths["tree"])

    assert (paths["tree"] / "manage.py").exists()


def test_bytecode_is_not_mistaken_for_an_orphan(paths):
    """`__pycache__` mirrors nothing and is regenerated anyway, so walking into it only finds
    files whose source never existed."""
    (paths["tree"] / "apps/users/__pycache__").mkdir(parents=True)
    (paths["tree"] / "apps/users/__pycache__/models.cpython-314.pyc").write_bytes(b"\x00")

    removed = mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert (paths["tree"] / "apps/users/__pycache__/models.cpython-314.pyc").exists()
    assert removed == 0


def test_an_entry_with_no_mirror_at_all_is_not_an_error(paths):
    assert mutation_cache.prune_orphaned_tree(["nothing_here"], [], root=paths["root"], tree=paths["tree"]) == 0


def test_pruning_a_tree_that_was_never_built_is_not_an_error(tmp_path):
    assert mutation_cache.prune_orphaned_tree(["apps"], [], root=tmp_path, tree=tmp_path / "mutants") == 0


def test_the_verdicts_a_tree_holds_include_the_undecided(paths):
    """The queue is built from the ones sitting at `None`, so leaving them out would make a cleared
    verdict unreachable and nothing would ever re-run it."""
    found = mutation_cache.verdicts(paths["tree"])

    assert found["apps.users.models.save__mutmut_1"] == 1
    assert found["apps.users.models.fresh__mutmut_1"] is None


def test_a_tree_that_was_never_built_holds_no_verdicts(tmp_path):
    assert mutation_cache.verdicts(tmp_path / "mutants") == {}


def test_the_baseline_is_stamped_only_once_the_work_is_done(paths, monkeypatch):
    """Stamped first, a step that died half way would leave the next run trusting a reset that
    never finished."""
    order = []
    monkeypatch.setattr(mutation_cache, "invalidate_verdicts_for", lambda *a, **k: order.append("verdicts") or 0)
    monkeypatch.setattr(mutation_cache, "prune_stats_map", lambda *a, **k: order.append("traces") or 0)
    monkeypatch.setattr(mutation_cache, "forget_confirmed", lambda *a, **k: order.append("confirmed") or 0)
    monkeypatch.setattr(mutation_cache, "write_baseline", lambda *a, **k: order.append("baseline"))

    mutation_cache.invalidate_changed_tests(root=paths["root"], baseline=paths["baseline"])

    assert order == ["verdicts", "traces", "confirmed", "baseline"]


def test_the_whole_job_reports_what_it_did(paths):
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_a():\n    assert True\n")

    result = mutation_cache.invalidate_changed_tests(root=paths["root"], baseline=paths["baseline"])

    assert result["changed"] == [f"{TEST_A}::test_a"]
    assert result["traces"] == 1


def test_the_job_leaves_a_baseline_the_next_run_agrees_with(paths):
    mutation_cache.invalidate_changed_tests(root=paths["root"], baseline=paths["baseline"])

    assert mutation_cache.invalidate_changed_tests(root=paths["root"], baseline=paths["baseline"])["changed"] == []


@pytest.mark.parametrize("argv", [[], ["both"], ["prune", "invalidate"], ["--help"]])
def test_only_the_two_steps_are_commands(argv, capsys):
    assert mutation_cache.main(argv) == 2
    assert "mutation_cache" in capsys.readouterr().out


def test_a_changed_source_module_re_traces_the_tests_that_reach_it():
    """A function too new for the map traces nothing, so its mutants are recorded as untested -
    the same shape as a survivor. Re-tracing what already reaches the module is what finds it."""
    assert mutation_cache.stale_tests({MODELS}, _stats()) == {TEST_A_ID}


def test_a_changed_source_module_does_not_reach_another_modules_tests():
    assert OTHER_ID not in mutation_cache.stale_tests({MODELS}, _stats())


def test_a_changed_source_module_keeps_the_kills_it_did_not_question(paths):
    """mutmut clears a changed function's verdict itself, against the hash it recorded for it, so
    clearing kills here as well would throw away exactly what the cache is kept for."""
    mutation_cache.invalidate_verdicts_for({MODELS}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] == 1
    assert _codes(paths)["apps.other.models.load__mutmut_1"] == 1


def test_a_changed_source_module_still_frees_its_non_answers(paths):
    """A mutant recorded as untested is only untested against the map as it was. Once the module it
    lives in has changed, the re-trace can hand it tests, so the verdict has to go back in the
    queue - otherwise a function gains a test and its mutants never notice."""
    cleared = mutation_cache.invalidate_verdicts_for({MODELS}, paths["stats_path"], paths["tree"])

    assert cleared == 2
    assert _codes(paths)["apps.users.models.lonely__mutmut_1"] is None
    assert _codes(paths)["apps.users.models.gone__mutmut_1"] is None


def test_a_changed_source_module_still_drops_its_traces(paths):
    assert mutation_cache.prune_stats_map({MODELS}, paths["stats_path"]) == 1


def test_a_change_in_one_module_frees_a_non_answer_in_another(paths):
    """The case the module-prefix rule cannot reach: an unchanged function whose new caller lives
    somewhere else. Its own hash never moves, so mutmut keeps the verdict, and a bare run skips
    anything already answered - so a mutant stored as untested would stay untested forever, now
    with tests that would kill it. The blanket non-answer reset is what covers it, not the prefix."""
    mutation_cache.invalidate_verdicts_for({"apps/other/caller.py"}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.lonely__mutmut_1"] is None
    assert _codes(paths)["apps.users.models.save__mutmut_1"] == 1


def _pin(paths, **killers):
    (paths["tree"] / "mutmut-mutants.jsonl").write_text(
        "".join(json.dumps({"mutant": m, "killer": k}) + "\n" for m, k in killers.items())
    )


def test_a_kill_survives_an_edit_to_a_test_that_did_not_earn_it(paths):
    """The point of recording the killer. A central function is traced by most of the suite, so
    resetting on the traced set puts the whole shard back on the queue for one edit."""
    _pin(paths, **{"apps.users.models.save__mutmut_1": "apps/users/tests/test_a.py::test_other"})

    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] == 1


def test_a_kill_goes_when_the_test_that_earned_it_changed(paths):
    _pin(paths, **{"apps.users.models.save__mutmut_1": TEST_A_ID})

    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] is None


def test_a_kill_goes_when_the_test_that_earned_it_was_deleted(paths):
    """A deleted test cannot be hashed, so it is found only by its absence from the baseline. The
    kill has to go back on the queue to be re-recorded as the survivor it now is."""
    _pin(paths, **{"apps.users.models.save__mutmut_1": TEST_A_ID})
    (paths["root"] / TEST_A).write_text("def test_a():\n    pass\n\n\ndef test_b():\n    pass\n")
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_b():\n    pass\n")

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])
    mutation_cache.invalidate_verdicts_for(changed, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] is None


def test_a_kill_survives_a_deleted_test_that_did_not_earn_it(paths):
    """Deleting a neighbor reaches the baseline as the same shape of change as deleting the killer,
    and only the second is allowed to cost anything."""
    _pin(paths, **{"apps.users.models.save__mutmut_1": TEST_A_ID})
    (paths["root"] / TEST_A).write_text("def test_a():\n    pass\n\n\ndef test_b():\n    pass\n")
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_a():\n    pass\n")

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])
    mutation_cache.invalidate_verdicts_for(changed, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] == 1


def test_a_kill_goes_when_the_module_that_earned_it_is_deleted(paths):
    _pin(paths, **{"apps.users.models.save__mutmut_1": TEST_A_ID})
    _stamp(paths)
    (paths["root"] / TEST_A).unlink()

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])
    mutation_cache.invalidate_verdicts_for(changed, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] is None


def test_a_kill_with_no_recorded_killer_falls_back_to_its_traces(paths):
    """An exit 3 leaves no failing test, and a cache written before the recorder existed has none
    of this - so the old rule has to still be there underneath."""
    _pin(paths, **{"apps.users.models.save__mutmut_1": None})

    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] is None


def test_a_wholesale_change_ignores_the_pin(paths):
    _pin(paths, **{"apps.users.models.save__mutmut_1": "apps/users/tests/test_a.py::test_other"})

    mutation_cache.invalidate_verdicts_for({"apps/x/templates/m.html"}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] is None


def test_the_last_word_on_a_killer_is_the_one_that_counts(paths):
    """A mutant killed once and surviving now claims no killer, and that has to win - otherwise it
    keeps a kill earned by a test that no longer catches it."""
    (paths["tree"] / "mutmut-mutants.jsonl").write_text(
        json.dumps({"mutant": "m", "killer": "tests/test_x.py::test_y"})
        + "\n"
        + json.dumps({"mutant": "m", "killer": None})
        + "\n"
    )

    assert mutation_cache.killers(paths["tree"] / "mutmut-mutants.jsonl") == {"m": None}


def test_no_record_at_all_is_not_an_error(paths):
    assert mutation_cache.killers(paths["tree"] / "absent.jsonl") == {}


def test_editing_one_test_does_not_stale_its_neighbours(paths):
    """The reason for splitting a module at all. Without it, one edit stales every id in the file
    and every kill pinned to any of them goes back on the queue."""
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_a():\n    assert 1\n\n\ndef test_b():\n    pass\n")
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_a():\n    assert 2\n\n\ndef test_b():\n    pass\n")

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert changed == {f"{TEST_A}::test_a"}


def test_a_comment_is_not_a_change(paths):
    """`ast.dump` carries structure and decorators and drops comments and formatting, so a reformat
    cannot cost a shard its verdicts."""
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_a():\n    # explaining myself\n    pass\n")

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert changed == set()


def test_a_changed_helper_stales_every_test_in_its_file(paths):
    """Imports, fixtures and parametrize constants are not attached to one test, so a change there
    can reach any of them."""
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("import json\n\n\ndef test_a():\n    pass\n")

    changed, _ = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert changed == {TEST_A}


def test_one_test_changing_invalidates_only_its_own_id():
    stats = {
        "duration_by_test": {TEST_A_ID: 0.1, f"{TEST_A}::test_b": 0.2},
        "tests_by_mangled_function_name": {"apps.users.models.save": [TEST_A_ID, f"{TEST_A}::test_b"]},
    }

    assert mutation_cache.stale_tests({f"{TEST_A}::test_a"}, stats) == {TEST_A_ID}


def test_a_parametrized_id_belongs_to_the_test_it_came_from():
    stats = {"duration_by_test": {f"{TEST_A}::test_a[case-one]": 0.1}, "tests_by_mangled_function_name": {}}

    assert mutation_cache.stale_tests({f"{TEST_A}::test_a"}, stats) == {f"{TEST_A}::test_a[case-one]"}


def test_a_method_belongs_to_its_class():
    """A `Test*` class is one unit, because a method's behavior is not contained in the method."""
    stats = {"duration_by_test": {f"{TEST_A}::TestThing::test_x": 0.1}, "tests_by_mangled_function_name": {}}

    assert mutation_cache.stale_tests({f"{TEST_A}::TestThing"}, stats) == {f"{TEST_A}::TestThing::test_x"}


def test_a_module_remainder_change_takes_every_id_in_the_file():
    stats = {
        "duration_by_test": {TEST_A_ID: 0.1, f"{TEST_A}::test_b": 0.2, OTHER_ID: 0.3},
        "tests_by_mangled_function_name": {},
    }

    assert mutation_cache.stale_tests({TEST_A}, stats) == {TEST_A_ID, f"{TEST_A}::test_b"}


def test_a_file_that_does_not_parse_stales_whole(paths):
    """Mid-edit or genuinely broken, it still has to produce a baseline rather than raise."""
    _stamp(paths)
    (paths["root"] / TEST_A).write_text("def test_a(:\n")

    changed, current = mutation_cache.changed_watched_files(root=paths["root"], baseline=paths["baseline"])

    assert TEST_A in current
    assert changed


def test_the_paths_a_prune_may_consider_come_from_the_config(tmp_path):
    """The prune is only safe because it asks what the tree mirrors. Reading the wrong keys here
    would hand it either nothing to do or the whole tree to delete."""
    (tmp_path / "pyproject.toml").write_text(
        '[tool.mutmut]\nsource_paths = ["apps", "project"]\nalso_copy = ["conftest.py", "templates"]\n'
    )

    assert mutation_cache._copied_paths(tmp_path) == (["apps", "project"], ["conftest.py", "templates"])


def test_a_config_naming_nothing_to_copy_is_not_an_error(tmp_path):
    (tmp_path / "pyproject.toml").write_text('[tool.mutmut]\nsource_paths = ["apps"]\n')

    assert mutation_cache._copied_paths(tmp_path) == (["apps"], [])


def test_prune_reports_what_it_removed(monkeypatch, capsys):
    monkeypatch.setattr(mutation_cache, "_copied_paths", lambda *a: (["apps"], ["conftest.py"]))
    monkeypatch.setattr(mutation_cache, "prune_orphaned_tree", lambda paths, copied: 3)

    assert mutation_cache.main(["prune"]) == 0
    assert "3 orphaned file(s) removed" in capsys.readouterr().out


def test_prune_passes_the_config_through_untouched(monkeypatch):
    seen = {}
    monkeypatch.setattr(mutation_cache, "_copied_paths", lambda *a: (["apps"], ["conftest.py"]))
    monkeypatch.setattr(
        mutation_cache, "prune_orphaned_tree", lambda paths, copied: seen.update(paths=paths, copied=copied) or 0
    )

    mutation_cache.main(["prune"])

    assert seen == {"paths": ["apps"], "copied": ["conftest.py"]}


def test_invalidate_reports_every_number(monkeypatch, capsys):
    """Each says something different: what moved, what has to run again, what has to be traced
    again. A run that printed some of them would read as complete."""
    monkeypatch.setattr(
        mutation_cache,
        "invalidate_changed_tests",
        lambda *a, **k: {"changed": ["a.py", "b.py"], "verdicts": 7, "traces": 5, "confirmed": 4},
    )

    assert mutation_cache.main(["invalidate"]) == 0

    out = capsys.readouterr().out
    assert "2 watched file(s) changed" in out
    assert "7 verdict(s) cleared" in out
    assert "5 trace(s) dropped" in out
    assert "4 phase two verdict(s) forgotten" in out


def test_a_quiet_run_still_says_so(monkeypatch, capsys):
    monkeypatch.setattr(
        mutation_cache,
        "invalidate_changed_tests",
        lambda *a, **k: {"changed": [], "verdicts": 0, "traces": 0, "confirmed": 0},
    )

    mutation_cache.main(["invalidate"])

    assert "0 watched file(s) changed" in capsys.readouterr().out


def test_the_baseline_is_written_where_it_is_asked_for(tmp_path):
    """Two levels deep on purpose: the tree it belongs in may not exist at all yet, and one level
    would be created either way."""
    target = tmp_path / "mutants" / "nested" / "hashes.json"

    mutation_cache.write_baseline({"a.py": "deadbeef"}, target)

    assert json.loads(target.read_text()) == {"a.py": "deadbeef"}


def test_the_baseline_is_written_so_a_person_can_diff_it(tmp_path):
    """Sorted and indented, because the first thing anyone does with a cache that misbehaved is
    read two of these side by side."""
    target = tmp_path / "hashes.json"

    mutation_cache.write_baseline({"b.py": "2", "a.py": "1"}, target)

    assert target.read_text() == '{\n  "a.py": "1",\n  "b.py": "2"\n}'


def test_writing_a_baseline_twice_over_is_not_an_error(tmp_path):
    target = tmp_path / "deep" / "hashes.json"
    mutation_cache.write_baseline({"a.py": "1"}, target)

    mutation_cache.write_baseline({"a.py": "2"}, target)

    assert json.loads(target.read_text()) == {"a.py": "2"}


def test_the_baseline_replaces_what_was_there(tmp_path):
    """Merging instead would keep a key for a file that has gone, and that key then reads as a
    deletion on every later run."""
    target = tmp_path / "hashes.json"
    mutation_cache.write_baseline({"old.py": "1"}, target)

    mutation_cache.write_baseline({"new.py": "2"}, target)

    assert json.loads(target.read_text()) == {"new.py": "2"}


@pytest.mark.parametrize(
    ("source", "is_unit"),
    [
        ("def test_a(): pass", True),
        ("async def test_a(): pass", True),
        ("class TestThing: pass", True),
        ("def helper(): pass", False),
        # Ends with it rather than starts with it, which is what a reversed check would accept.
        ("def a_test(): pass", False),
        ("class ThingTest: pass", False),
        # Lowercase, so only the class check's own prefix refuses it.
        ("class test_thing: pass", False),
        ("x = 1", False),
    ],
)
def test_what_counts_as_a_unit_of_a_test_module(source, is_unit):
    import ast as _ast

    assert mutation_cache._is_test_unit(_ast.parse(source).body[0]) is is_unit


def test_a_skipped_verdict_does_not_stop_the_ones_after_it(paths):
    """Ordering, not just occurrence: a mutant already cleared, and one mutmut owns, both come
    before work that still has to happen - and leaving the loop at either would quietly settle for
    whatever had been reached so far."""
    (paths["tree"] / f"{MODELS}.meta").write_text(
        json.dumps(
            {
                "exit_code_by_key": {
                    "apps.users.models.first__mutmut_1": None,
                    "apps.users.models.typed__mutmut_1": 37,
                    "apps.users.models.lonely__mutmut_1": 33,
                },
                "hash_by_function_name": {},
                "type_check_error_by_key": {},
                "durations_by_key": {},
                "estimated_durations_by_key": {},
            }
        )
    )

    cleared = mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert cleared == 1
    assert _codes(paths)["apps.users.models.lonely__mutmut_1"] is None


def test_the_killer_record_is_read_from_where_it_is_asked_for(paths, tmp_path):
    """The caller names it so a lane can carry its own. Ignoring that would read another tree's
    record and keep kills this one never earned."""
    elsewhere = tmp_path / "somewhere-else.jsonl"
    elsewhere.write_text(json.dumps({"mutant": "apps.users.models.save__mutmut_1", "killer": TEST_A_ID}) + "\n")

    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"], record=elsewhere)

    assert _codes(paths)["apps.users.models.save__mutmut_1"] is None


def test_the_traced_map_is_read_under_the_name_mutmut_writes(paths):
    """A map read under the wrong key looks like a map with no traces, which reads as every mutant
    being untested rather than as a mistake."""
    stats = json.loads(paths["stats_path"].read_text())
    assert "tests_by_mangled_function_name" in stats

    stale = mutation_cache.stale_tests({TEST_A}, stats)

    assert stale == {TEST_A_ID}


def test_a_map_without_the_traced_key_treats_nothing_as_reached(paths):
    paths["stats_path"].write_text(json.dumps({"duration_by_test": {TEST_A_ID: 0.1}}))

    mutation_cache.invalidate_verdicts_for({TEST_A}, paths["stats_path"], paths["tree"])

    assert _codes(paths)["apps.users.models.save__mutmut_1"] == 1


def test_nothing_to_clear_when_the_tree_was_never_built(tmp_path):
    assert mutation_cache.invalidate_verdicts_for({TEST_A}, tmp_path / "none.json", tmp_path / "gone") == 0


def test_a_meta_nothing_touched_is_left_alone(paths):
    """Rewriting every file whatever happened would restamp the whole tree on a no-op run, which is
    what the mtimes the build reads for its own reuse are taken from."""
    before = (paths["tree"] / f"{MODELS}.meta").read_text()

    mutation_cache.invalidate_verdicts_for(set(), paths["stats_path"], paths["tree"])

    assert (paths["tree"] / f"{MODELS}.meta").read_text() == before


def test_a_hash_is_short_enough_to_read_and_long_enough_to_trust():
    """The baseline is a file people diff, so the digest is cut - but cut to a fixed width, or two
    runs of the same tool disagree about what a file hashes to."""
    assert len(mutation_cache._hash(b"anything")) == 16


def test_two_different_files_do_not_agree():
    assert mutation_cache._hash(b"one") != mutation_cache._hash(b"two")


def test_the_rest_of_a_module_is_hashed_from_what_is_in_it():
    """Dropping the nodes and hashing a constant would make every module remainder agree, so a
    changed fixture would never be seen."""
    one = mutation_cache._hash_test_module("t.py", b"import json\n\n\ndef test_a(): pass\n")
    two = mutation_cache._hash_test_module("t.py", b"import os\n\n\ndef test_a(): pass\n")

    assert one["t.py"] != two["t.py"]
    assert one["t.py::test_a"] == two["t.py::test_a"]


def test_a_file_that_is_not_a_test_module_is_hashed_from_its_bytes(tmp_path):
    (tmp_path / "conftest.py").write_text("import pytest\n")

    current = mutation_cache._hashes(tmp_path, ("conftest.py",))

    assert current["conftest.py"] == mutation_cache._hash(b"import pytest\n")


def test_several_changed_tests_all_count():
    """Assigning rather than accumulating would keep only the last one looked at, and which one
    that is depends on set order."""
    stats = {
        "duration_by_test": {TEST_A_ID: 0.1, f"{TEST_A}::test_b": 0.2},
        "tests_by_mangled_function_name": {},
    }

    stale = mutation_cache.stale_tests({f"{TEST_A}::test_a", f"{TEST_A}::test_b"}, stats)

    assert stale == {TEST_A_ID, f"{TEST_A}::test_b"}


def test_a_changed_test_and_a_changed_module_both_count():
    stats = {
        "duration_by_test": {TEST_A_ID: 0.1, OTHER_ID: 0.2},
        "tests_by_mangled_function_name": {"apps.users.models.save": [OTHER_ID]},
    }

    stale = mutation_cache.stale_tests({f"{TEST_A}::test_a", MODELS}, stats)

    assert stale == {TEST_A_ID, OTHER_ID}


def test_a_test_known_only_to_the_traced_map_is_still_found():
    """`duration_by_test` and the traced sets are written at different moments, so a test can be in
    one and not the other - and one read alone would miss it."""
    stats = {"duration_by_test": {}, "tests_by_mangled_function_name": {"m.f": [TEST_A_ID]}}

    assert mutation_cache.stale_tests({f"{TEST_A}::test_a"}, stats) == {TEST_A_ID}


def test_everything_removed_from_the_tree_is_counted(paths):
    """Counting by assignment rather than addition reports one however many went, and the number is
    the only thing a run says about what it deleted."""
    (paths["tree"] / "apps/users/gone_one.py").write_text("x = 1\n")
    (paths["tree"] / "apps/users/gone_two.py").write_text("y = 2\n")

    removed = mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert removed == 2


def test_bytecode_does_not_end_the_walk_early(paths):
    """Skipping with a break would leave everything after it in place, and what comes after is
    whatever the directory listing happens to put there."""
    (paths["tree"] / "apps/users/__pycache__").mkdir(parents=True)
    (paths["tree"] / "apps/users/__pycache__/a.pyc").write_bytes(b"\x00")
    (paths["tree"] / "apps/users/zzz_gone.py").write_text("x = 1\n")

    removed = mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert removed == 1
    assert not (paths["tree"] / "apps/users/zzz_gone.py").exists()


def test_the_command_reads_the_argument_it_was_given(monkeypatch, capsys):
    """Taken off `sys.argv` when the caller passes nothing, and the slice has to start where the
    arguments do rather than one past them."""
    monkeypatch.setattr("sys.argv", ["mutation_cache", "prune"])
    monkeypatch.setattr(mutation_cache, "_copied_paths", lambda *a: ([], []))
    monkeypatch.setattr(mutation_cache, "prune_orphaned_tree", lambda paths, copied: 0)

    assert mutation_cache.main() == 0
    assert "orphaned file(s) removed" in capsys.readouterr().out


def test_the_job_names_each_answer(paths):
    """The caller reads them by name, so a renamed key is a number silently lost."""
    result = mutation_cache.invalidate_changed_tests(root=paths["root"], baseline=paths["baseline"])

    assert sorted(result) == ["changed", "confirmed", "traces", "verdicts"]


def test_the_baseline_lands_beside_the_cache_it_describes(paths):
    """Default rather than passed, which is how every caller but a test uses it."""
    mutation_cache.invalidate_changed_tests(root=paths["root"])

    assert (paths["root"] / "mutants" / ".test-hashes.json").exists()


def test_a_living_modules_line_index_is_kept(paths):
    """The other sidecar. Failing to recognize it means deriving the wrong source path, finding no
    such file, and deleting the index of a module that is still there."""
    (paths["tree"] / f"{MODELS}.spans").write_text("{}")

    mutation_cache.prune_orphaned_tree(["apps"], [], root=paths["root"], tree=paths["tree"])

    assert (paths["tree"] / f"{MODELS}.spans").exists()


def test_a_source_path_with_nothing_in_the_config_is_still_asked_for(tmp_path):
    """Both lists are read, and reading one twice would leave the other's subtrees unwalked."""
    (tmp_path / "pyproject.toml").write_text('[tool.mutmut]\nalso_copy = ["conftest.py"]\n')

    assert mutation_cache._copied_paths(tmp_path) == ([], ["conftest.py"])


def test_a_module_traces_through_the_name_mutmut_files_it_under():
    """Read under any other key the map looks empty, and an empty map says nothing is reached."""
    stats = {"tests_by_mangled_function_name": {"apps.users.models.save": [TEST_A_ID]}}

    assert mutation_cache._traced_by_module(MODELS, stats) == {TEST_A_ID}


def test_a_module_with_no_traces_of_its_own_reaches_nothing():
    stats = {"tests_by_mangled_function_name": {"apps.other.models.load": [OTHER_ID]}}

    assert mutation_cache._traced_by_module(MODELS, stats) == set()


def test_the_verdicts_of_every_file_in_the_tree_are_gathered(paths):
    """One file's answers are not the tree's. Stopping at the first would hide every shard but one."""
    (paths["tree"] / "apps/users/other.py.meta").write_text(
        json.dumps({"exit_code_by_key": {"apps.users.other.thing__mutmut_1": 1}})
    )

    found = mutation_cache.verdicts(paths["tree"])

    assert "apps.users.other.thing__mutmut_1" in found
    assert "apps.users.models.save__mutmut_1" in found


def test_the_changed_set_is_what_decides_what_is_cleared(paths):
    """Passed through rather than recomputed - a second look at the tree would be a different
    answer from the one the baseline was written against."""
    seen = {}

    def _spy(changed, *a, **k):
        seen["changed"] = set(changed)
        return 0

    original = mutation_cache.invalidate_verdicts_for
    try:
        mutation_cache.invalidate_verdicts_for = _spy
        _stamp(paths)
        (paths["root"] / TEST_A).write_text("def test_a():\n    assert True\n")
        mutation_cache.invalidate_changed_tests(root=paths["root"], baseline=paths["baseline"])
    finally:
        mutation_cache.invalidate_verdicts_for = original

    assert seen["changed"] == {f"{TEST_A}::test_a"}


def _confirm(paths, **verdicts):
    report = paths["tree"] / "mutmut-confirmed.json"
    report.write_text(json.dumps({name: {"verdict": verdict} for name, verdict in verdicts.items()}))
    return report


def test_phase_two_forgets_everything_once_anything_changed(paths):
    """Filed by name, which a changed function or test keeps, so a kill from an earlier commit
    would otherwise be read back as this one's."""
    report = _confirm(paths, a="killed", b="survived")

    assert mutation_cache.forget_confirmed({TEST_A}, report) == 2
    assert not report.exists()


def test_phase_two_keeps_its_verdicts_when_nothing_changed(paths):
    """A rerun of the same commit is what the cache was first kept for."""
    report = _confirm(paths, a="killed")

    assert mutation_cache.forget_confirmed(set(), report) == 0
    assert report.exists()


def test_phase_two_with_no_report_has_nothing_to_forget(paths):
    assert mutation_cache.forget_confirmed({TEST_A}, paths["tree"] / "mutmut-confirmed.json") == 0


def test_the_whole_job_forgets_phase_two_in_the_tree_it_was_given(paths):
    _stamp(paths)
    report = _confirm(paths, a="killed")
    (paths["root"] / TEST_A).write_text("def test_a():\n    assert True\n")

    result = mutation_cache.invalidate_changed_tests(root=paths["root"], baseline=paths["baseline"])

    assert result["confirmed"] == 1
    assert not report.exists()


def test_a_kill_is_pinned_to_the_test_the_order_plugin_logged(paths):
    """The record is `mutation_test_order.py`'s cost log, which carries more than the killer; the
    last line for a mutant is the run that counts, and a survivor's line names no killer."""
    (paths["tree"] / "mutmut-mutants.jsonl").write_text(
        json.dumps({"mutant": "m", "killer": TEST_A_ID, "seconds": 0.4, "tests": 3})
        + "\n"
        + json.dumps({"mutant": "m", "killer": None, "seconds": 0.9, "tests": 8})
        + "\n"
    )

    assert mutation_cache.killers(paths["tree"] / "mutmut-mutants.jsonl") == {"m": None}
