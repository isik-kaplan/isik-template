"""The comment check, driven against written sources and diffs rather than a repository."""

from scripts.comment_check import added_lines, complaints, sentences


LONG = "One thing. Another thing. A third thing."


def test_sentences_are_counted_where_the_next_one_starts():
    assert sentences("Keeps it short.") == 1
    assert sentences(LONG) == 3
    assert sentences("Uses `a.b` and e.g. that. Then `this` one.") == 2
    assert sentences("No full stop at all") == 0


def test_a_long_python_comment_on_an_added_line_is_refused():
    source = f"x = 1\n# {LONG}\ny = 2\n"

    assert list(complaints("a.py", source, {2})) == [
        "a.py:2: 3 sentences; a comment says the non-obvious why in one or two"
    ]


def test_a_run_of_comment_lines_is_judged_as_one():
    source = "# One thing.\n# Another thing.\n# A third thing.\nx = 1\n"

    assert [line.split(":")[1] for line in complaints("a.py", source, {3})] == ["1"]


def test_an_untouched_comment_is_left_alone():
    source = f"# {LONG}\nx = 1\n"

    assert list(complaints("a.py", source, {2})) == []


def test_a_docstring_counts_too():
    source = f'def f():\n    """{LONG}"""\n    return 1\n'

    assert len(list(complaints("a.py", source, {2}))) == 1


def test_a_short_comment_passes():
    assert list(complaints("a.py", "# Why: the order matters.\nx = 1\n", {1})) == []


def test_naming_something_outside_the_repository_is_refused():
    # Joined here, so this file names no such path itself.
    source = "# Decided in TODO" + "/plan.md.\nx = 1\n"

    assert list(complaints("a.py", source, {1})) == ["a.py:1: names something outside this repository"]


def test_script_line_and_block_comments_are_judged():
    source = f"const a = 1\n// {LONG}\n/**\n * {LONG}\n */\nconst url = 'http://x.test' // fine\n"

    assert [line.split(":")[1] for line in complaints("a.ts", source, {2, 4, 6})] == ["2", "3"]


def test_other_files_have_no_comments_to_judge():
    assert list(complaints("a.md", f"# {LONG}\n", {1})) == []


def test_added_lines_are_read_off_a_zero_context_diff():
    diff = (
        "diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1,0 +2,3 @@\n+x\n+y\n+z\n"
        "@@ -9 +12 @@\n+w\n"
        "diff --git a/gone.py b/gone.py\n--- a/gone.py\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n"
    )

    assert added_lines(diff) == {"a.py": {2, 3, 4, 12}}
