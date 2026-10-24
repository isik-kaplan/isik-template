"""Operator tools for diagnosing survivors locally, outside the CI pipeline.

    python -m scripts.toolbox.hunt <source.py> <test path> [...]   # one file's survivors, in parallel
    python -m scripts.toolbox.triage <unsettled.txt | mutmut-confirmed.json> [--diffs]
    python -m scripts.toolbox.check_exemption_keys                  # every registry key still generated

Names are generated as the tree does, so they paste straight into a registry or `MUTANT_UNDER_TEST`.
"""
