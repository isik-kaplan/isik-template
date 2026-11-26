from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events
from isik.django.apps.scheduling import bases


# Its history says who paused, rescheduled or ran a task (isik.E031); beat writes last_run_at at every run.
@track_events(exclude=["last_run_at"])
class ScheduledTaskState(bases.AbstractScheduledTaskState):
    class Meta(bases.AbstractScheduledTaskState.Meta):
        db_table = "scheduling_scheduled_task_state"
        verbose_name = _("scheduled task state")
        verbose_name_plural = _("scheduled task states")
