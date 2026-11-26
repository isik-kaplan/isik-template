from isik.django.apps.scheduling import drf

from apps.users.api.permissions.is_staff import IsStaff


class ScheduledTaskViewSet(drf.ScheduledTaskViewSet):
    """The scheduled tasks, and what staff may do to each: pause, resume, run now, as its declaration allows."""

    endpoint = "scheduled-tasks"
    permission_classes = [IsStaff]
    # A declared name's characters only: anything else is no task, answered 404 before it reaches the database.
    lookup_value_regex = r"[\w.-]+"
