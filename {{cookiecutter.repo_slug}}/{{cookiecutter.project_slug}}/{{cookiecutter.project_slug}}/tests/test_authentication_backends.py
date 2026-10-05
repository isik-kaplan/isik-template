"""Every backend a login can name is one AUTHENTICATION_BACKENDS lists, and every listed one imports.

`authenticate()` stores the path as written in the setting, so a path through a re-exporting package
is fine. What breaks is a path that imports nothing, or a `login(..., backend=...)` naming one the
setting doesn't list - Django accepts it and the session is anonymous from its next request. Write
such a login with isik's `login_through()`, which resolves the class to its listed path and raises.
"""

import pytest
from django.conf import settings
from django.utils.module_loading import import_string
from isik.django.apps.common.backends import listed_backend_path


@pytest.mark.parametrize("path", settings.AUTHENTICATION_BACKENDS)
def test_every_listed_backend_resolves_to_the_path_it_is_listed_under(path):
    assert listed_backend_path(import_string(path)) == path
