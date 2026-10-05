"""The task base every `@shared_task` here gets."""

from django.db import transaction
from isik.django.celery import HistoryContextTask

from {{ cookiecutter.project_slug }} import __version__


class OnCommitTask(HistoryContextTask):
    """Dispatches after the transaction that asked for it commits, and carries who asked.

    A task queued inside a transaction can be picked up before the commit lands, and then reads a
    row that is not there yet. `on_commit` runs immediately when nothing is open, so a caller with
    no transaction is unaffected and no call site has to know which it is.

    Returns nothing: the result would have to be invented before the task is sent.
    """

    def worker_history_context(self):
        """`version` is this process's rather than the dispatcher's: the build that runs a task is the
        one that wrote the rows, and a worker is not always the web process's deploy."""
        return {**super().worker_history_context(), "version": __version__}

    def apply_async(self, args=None, kwargs=None, **options):
        # The headers are left to the base class, which makes the cause header-safe on the way out -
        # a cause written into them here would win over that and reach the broker raw.
        transaction.on_commit(lambda: super(OnCommitTask, self).apply_async(args, kwargs, **options))
