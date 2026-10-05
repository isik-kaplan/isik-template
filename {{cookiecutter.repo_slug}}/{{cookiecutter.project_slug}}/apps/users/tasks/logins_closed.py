from celery import shared_task
from django.utils import translation

from apps.users.adapters.account import AccountAdapter
from apps.users.login_policy import shut_out
from apps.users.models.site_settings import SiteSettings

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


@shared_task(name="tell_the_people_a_rung_signed_out", base=OnCommitTask)
def tell_the_people_a_rung_signed_out():
    """Mails everybody the current rung shuts out, when whoever raised it asked for that.

    Recomputed from the rung rather than handed the sessions the sweep ended: a session key says
    nothing about who held it once the row is gone.
    """
    adapter = AccountAdapter()
    mailed = []
    for user in shut_out(SiteSettings.current().login_policy):
        if not (user.is_active and user.email):
            continue
        with translation.override(user.language or None):
            adapter.send_mail("account/email/logins_closed", user.email, {"user": user})
        mailed.append(str(user.pk))
    return mailed
