from isik.django.apps.common.backends import UsernameOREmailModelBackend as _UsernameOREmailModelBackend

from apps.users.backends.admitted_by_login_policy import AdmittedByLoginPolicyMixin


class UsernameOREmailModelBackend(AdmittedByLoginPolicyMixin, _UsernameOREmailModelBackend):
    pass
