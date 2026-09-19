# autodiscover_tasks() only imports "<app>.tasks" per installed app, not nested submodules
# recursively - each task submodule has to be imported here to actually get registered. Add new
# ones the same way.
from apps.users.tasks.health_check import ping


__all__ = ["ping"]
