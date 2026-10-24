from allauth.account.adapter import get_adapter
from celery import shared_task

from apps.users.login_policy import shut_out
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


@shared_task(name="tell_the_people_a_rung_signed_out", base=OnCommitTask)
def tell_the_people_a_rung_signed_out():
    """Recomputed from the rung, since ended sessions no longer say whose they were. One task per person."""
    people = shut_out(SiteSettings.current().login_policy).filter(is_active=True).exclude(email="")
    for pk in people.values_list("pk", flat=True).iterator():
        tell_one_person_a_rung_signed_out.delay(str(pk))


@shared_task(name="tell_one_person_a_rung_signed_out", base=OnCommitTask)
def tell_one_person_a_rung_signed_out(user_id):
    user = User.objects.filter(pk=user_id).first()
    if user is not None:
        # Not the adapter class: its module imports this package.
        get_adapter().send_mail("account/email/logins_closed", user.email, {"user": user})
