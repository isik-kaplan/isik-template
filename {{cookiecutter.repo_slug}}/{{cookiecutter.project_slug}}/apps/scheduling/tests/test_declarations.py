"""What the project schedules beside isik's, and what staff may do to its own."""

from datetime import timedelta

from isik.django.scheduling import StaffMay, declared_tasks


def test_a_due_account_is_deleted_within_the_hour_its_grace_period_ends():
    """isik gives the sweep no schedule of its own: without this one, nothing deletes anybody."""
    assert declared_tasks()["isik.accounts.sweep_deletions"].every == timedelta(hours=1)


def test_staff_may_pause_and_run_the_projects_housekeeping_but_not_reschedule_it():
    for name in ("clear_expired_tokens", "remove_unverified_accounts"):
        task = declared_tasks()[name]
        assert (task.task, task.staff_may) == (name, StaffMay.VIEW | StaffMay.PAUSE | StaffMay.RUN_NOW)
