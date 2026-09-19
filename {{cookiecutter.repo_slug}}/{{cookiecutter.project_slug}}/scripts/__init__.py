"""The mutation tooling, as a package rather than loose files.

`confirm_survivors.py` imports `mutation_fingerprint` as `scripts.mutation_fingerprint`, and CI invokes
`mutation_queue.py`/`check_mutants.py`/`confirm_survivors.py` as `python -m scripts.<name>` - a package
makes both resolve to the one module rather than to two copies loaded under different names.
"""
