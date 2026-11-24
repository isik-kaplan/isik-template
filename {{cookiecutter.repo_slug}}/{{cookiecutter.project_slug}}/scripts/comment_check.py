#!/usr/bin/env python3
"""Hold the comments a commit adds to one or two sentences, naming nothing outside the repository.

Only comments touching a staged added line are judged, so old ones wait until somebody edits them.
Standard library only: the pre-commit hook runs it without a container.
"""

import ast
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path


MOST_SENTENCES = 2

# A sentence ends where the next one starts with a capital, a quote or code, or where the text does.
SENTENCE_END = re.compile(r"[.!?](?=\s+[A-Z`\"'(]|\s*$)")
CODE_SPAN = re.compile(r"`[^`]*`")
# Things a reader of this repository can't open: work-tracking files and the assistants that wrote alongside.
OUTSIDE = re.compile(r"\bTODO[/]|\b(?:Claude|ChatGPT|Copilot)\b")

PYTHON = {".py"}
SCRIPT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def sentences(text):
    return len(SENTENCE_END.findall(CODE_SPAN.sub("code", " ".join(text.split()))))


def python_comments(source):
    """(first line, last line, text) of each run of `#` lines, and of each docstring."""
    blocks = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue
        line, text = token.start[0], token.string.lstrip("#").strip()
        if blocks and blocks[-1][1] == line - 1:
            first, _, earlier = blocks[-1]
            blocks[-1] = (first, line, f"{earlier} {text}")
        else:
            blocks.append((line, line, text))
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            docstring = ast.get_docstring(node, clean=False)
            if docstring is not None:
                blocks.append((node.body[0].lineno, node.body[0].end_lineno, docstring))
    return blocks


def script_comments(source):
    """(first line, last line, text) of each run of whole-line `//` comments, and of each `/* */` block."""
    blocks = []
    lines = source.splitlines()
    index = 0
    while index < len(lines):
        stripped = lines[index].strip()
        if stripped.startswith("/*"):
            first = index
            while "*/" not in lines[index] and index < len(lines) - 1:
                index += 1
            text = " ".join(line.strip().lstrip("/*").rstrip("*/").strip() for line in lines[first : index + 1])
            blocks.append((first + 1, index + 1, text))
        elif stripped.startswith("//"):
            first = index
            while index + 1 < len(lines) and lines[index + 1].strip().startswith("//"):
                index += 1
            text = " ".join(line.strip()[2:].strip() for line in lines[first : index + 1])
            blocks.append((first + 1, index + 1, text))
        index += 1
    return blocks


def comments(path, source):
    suffix = Path(path).suffix
    if suffix in PYTHON:
        return python_comments(source)
    if suffix in SCRIPT:
        return script_comments(source)
    return []


def added_lines(diff):
    """The line numbers each file gains, read off a `git diff -U0`."""
    added, path = {}, None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@") and path:
            start, _, count = re.search(r"\+(\d+)(,(\d+))?", line).groups()
            first, length = int(start), 1 if count is None else int(count)
            added.setdefault(path, set()).update(range(first, first + length))
    return added


def complaints(path, source, added):
    for first, last, text in comments(path, source):
        if not added.intersection(range(first, last + 1)):
            continue
        count = sentences(text)
        if count > MOST_SENTENCES:
            yield f"{path}:{first}: {count} sentences; a comment says the non-obvious why in one or two"
        if OUTSIDE.search(text):
            yield f"{path}:{first}: names something outside this repository"


def main(paths):
    diff = subprocess.run(
        ["git", "diff", "--cached", "-U0", "--", *paths], capture_output=True, text=True, check=True
    ).stdout
    found = []
    for path, lines in added_lines(diff).items():
        staged = subprocess.run(["git", "show", f":{path}"], capture_output=True, text=True, check=True).stdout
        found.extend(complaints(path, staged, lines))
    for complaint in found:
        print(complaint)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
