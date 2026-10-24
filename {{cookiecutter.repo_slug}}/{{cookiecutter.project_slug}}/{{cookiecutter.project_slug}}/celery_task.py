"""The task base every `@shared_task` here gets."""

from isik.django.celery import HistoryContextTask

from {{ cookiecutter.project_slug }} import __version__


class OnCommitTask(HistoryContextTask):
    """Dispatched on commit (HISTORY_TASK_DISPATCH_ON_COMMIT), or a worker may read a row not there yet."""

    def worker_history_context(self):
        """This process's version, not the dispatcher's: the build running the task wrote the rows."""
        return {**super().worker_history_context(), "version": __version__}
