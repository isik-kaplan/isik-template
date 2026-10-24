"""A login naming a backend the setting doesn't list is anonymous from its next request; use
isik's `login_through()`, which raises instead."""

import pytest
from django.conf import settings
from django.utils.module_loading import import_string
from isik.django.apps.common.backends import listed_backend_path


@pytest.mark.parametrize("path", settings.AUTHENTICATION_BACKENDS)
def test_every_listed_backend_resolves_to_the_path_it_is_listed_under(path):
    assert listed_backend_path(import_string(path)) == path
