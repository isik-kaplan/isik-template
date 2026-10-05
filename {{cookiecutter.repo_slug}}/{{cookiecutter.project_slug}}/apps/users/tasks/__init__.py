# autodiscover_tasks() only imports "<app>.tasks" per installed app, not nested submodules
# recursively - each task submodule has to be imported here to actually get registered. Add new
# ones the same way.
from apps.users.tasks.health_check import ping
from apps.users.tasks.logins_closed import tell_the_people_a_rung_signed_out


__all__ = ["ping", "tell_the_people_a_rung_signed_out"]
