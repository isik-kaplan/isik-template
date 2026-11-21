from allauth.account.auth_backends import AuthenticationBackend as _AuthenticationBackend

from apps.users.backends.admitted_by_login_policy import AdmittedByLoginPolicyMixin
from apps.users.backends.authentication_only import AuthenticationOnlyMixin
from apps.users.backends.superusers_only_without_passwords import SuperusersOnlyWithoutPasswordsMixin


class AuthenticationBackend(
    AuthenticationOnlyMixin, SuperusersOnlyWithoutPasswordsMixin, AdmittedByLoginPolicyMixin, _AuthenticationBackend
):
    pass
