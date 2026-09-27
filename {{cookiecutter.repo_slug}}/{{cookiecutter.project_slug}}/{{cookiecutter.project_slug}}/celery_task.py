"""The task base every `@shared_task` here gets."""

from django.db import transaction
from isik.django.celery import HistoryContextTask


class OnCommitTask(HistoryContextTask):
    """Dispatches after the transaction that asked for it commits, and carries who asked.

    A task queued inside a transaction can be picked up before the commit lands, and then reads a
    row that is not there yet. `on_commit` runs immediately when nothing is open, so a caller with
    no transaction is unaffected and no call site has to know which it is.

    Returns nothing: the result would have to be invented before the task is sent.
    """

    def apply_async(self, args=None, kwargs=None, **options):
        # Read here rather than when the transaction lands: what caused the task is the context the
        # call was made in, and a commit can happen anywhere after it.
        options["headers"] = {self.history_context_header: self.history_cause(), **(options.get("headers") or {})}
        transaction.on_commit(lambda: super(OnCommitTask, self).apply_async(args, kwargs, **options))
