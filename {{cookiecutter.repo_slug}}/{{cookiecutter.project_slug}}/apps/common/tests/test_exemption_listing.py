"""`manage.py exemptions` lists every exemption the project makes, under every rule it can skip.

Two ways one goes missing without a word: a type whose module nothing imports while the project loads
drops its rule and everything under it, and a call that never runs while it loads - one inside a
function nobody calls - makes nothing to list. Either fails here instead.
"""

from isik.django.apps.common.exemptions import unimported_project_exemption_types, unseen_project_exemptions


def test_every_exemption_type_is_imported_while_the_project_loads():
    assert unimported_project_exemption_types() == []


def test_every_exemption_call_runs_while_the_project_loads():
    assert unseen_project_exemptions() == []
