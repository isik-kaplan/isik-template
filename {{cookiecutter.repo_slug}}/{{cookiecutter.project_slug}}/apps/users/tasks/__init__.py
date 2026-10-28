# autodiscover_tasks() doesn't recurse: import each task submodule here.
from apps.users.tasks.account_mail import send_account_mail
from apps.users.tasks.health_check import ping
from apps.users.tasks.logins_closed import tell_the_people_a_rung_signed_out


__all__ = ["ping", "send_account_mail", "tell_the_people_a_rung_signed_out"]
