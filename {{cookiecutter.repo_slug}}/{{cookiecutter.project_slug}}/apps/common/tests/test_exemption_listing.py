"""`manage.py exemptions` lists every rule the project can be exempted from.

A type whose module nothing imports while the project loads drops its rule, and every exemption under
it, out of the listing without a word - so one declared and never imported fails here instead.
"""

from isik.django.apps.common.exemptions import unimported_project_exemption_types


def test_every_exemption_type_is_imported_while_the_project_loads():
    assert unimported_project_exemption_types() == []
