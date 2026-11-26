"""The project's scheduled tasks, and its changes to isik's: what beat runs, and what staff may do to each.

Imports no models: isik imports it wherever the declarations are read, beat's start included."""

from datetime import timedelta

from isik.django.scheduling import StaffMay, override_scheduled_task, scheduled_task


HOUSEKEEPING = StaffMay.VIEW | StaffMay.PAUSE | StaffMay.RUN_NOW

# Daily: the token tables stay correct however large they grow.
scheduled_task("clear_expired_tokens", task="clear_expired_tokens", crontab="30 4 * * *", staff_may=HOUSEKEEPING)
# Daily: an address held by a signup that never proved it is released within a day of its link expiring.
scheduled_task(
    "remove_unverified_accounts", task="remove_unverified_accounts", crontab="45 4 * * *", staff_may=HOUSEKEEPING
)
# Hourly: an account is deleted within the hour its grace period ends. isik gives it no schedule of its own.
override_scheduled_task("isik.accounts.sweep_deletions", every=timedelta(hours=1))
# Hourly, not isik's minute: SWEEP next_boundary runs it at each boundary, so this only catches a run the broker lost.
override_scheduled_task("isik.features.sweep", every=timedelta(hours=1))
