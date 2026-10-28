from celery import shared_task
from isik.django.apps.notifications.kinds import raise_notice

from apps.notifications.kinds import SIGNED_OUT_BY_POLICY
from apps.users.login_policy import shut_out
from apps.users.models.site_settings import SiteSettings

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


@shared_task(name="tell_the_people_a_rung_signed_out", base=OnCommitTask)
def tell_the_people_a_rung_signed_out():
    """Recomputed from the rung, since ended sessions no longer say whose they were. A notice per person."""
    people = shut_out(SiteSettings.current().login_policy).filter(is_active=True).exclude(email="")
    for pk in people.values_list("pk", flat=True).iterator():
        raise_notice(SIGNED_OUT_BY_POLICY, snapshot={"user": str(pk)})
