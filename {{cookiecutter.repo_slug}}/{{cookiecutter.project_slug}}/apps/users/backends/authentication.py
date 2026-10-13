from allauth.account.auth_backends import AuthenticationBackend as _AuthenticationBackend

from apps.users.backends.admitted_by_login_policy import AdmittedByLoginPolicyMixin
from apps.users.backends.authentication_only import AuthenticationOnlyMixin


class AuthenticationBackend(AuthenticationOnlyMixin, AdmittedByLoginPolicyMixin, _AuthenticationBackend):
    """allauth's backend, and nothing about permissions."""
