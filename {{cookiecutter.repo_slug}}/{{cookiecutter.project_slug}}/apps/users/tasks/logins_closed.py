from allauth.account.adapter import get_adapter
from celery import shared_task

from apps.users.login_policy import shut_out
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


@shared_task(name="tell_the_people_a_rung_signed_out", base=OnCommitTask)
def tell_the_people_a_rung_signed_out():
    """Mails everybody the current rung shuts out, when whoever raised it asked for that.

    Recomputed from the rung rather than handed the sessions the sweep ended: a session key says
    nothing about who held it once the row is gone. One task per person, so a rung that shuts out
    thousands is not one task racing its own time limit.
    """
    people = shut_out(SiteSettings.current().login_policy).filter(is_active=True).exclude(email="")
    for pk in people.values_list("pk", flat=True).iterator():
        tell_one_person_a_rung_signed_out.delay(str(pk))


@shared_task(name="tell_one_person_a_rung_signed_out", base=OnCommitTask)
def tell_one_person_a_rung_signed_out(user_id):
    # Gone since the fan-out is nobody left to tell.
    user = User.objects.filter(pk=user_id).first()
    if user is not None:
        # allauth's lookup rather than the adapter class, whose module imports this package.
        get_adapter().send_mail("account/email/logins_closed", user.email, {"user": user})
