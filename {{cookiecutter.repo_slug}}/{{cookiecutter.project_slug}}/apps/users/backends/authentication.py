from allauth.account.auth_backends import AuthenticationBackend as _AuthenticationBackend

from apps.users.backends.admitted_by_login_policy import AdmittedByLoginPolicyMixin


class AuthenticationBackend(AdmittedByLoginPolicyMixin, _AuthenticationBackend):
    pass
