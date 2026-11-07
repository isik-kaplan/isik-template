"""Which notification models keep a history, and why the rest don't: a model that stops being tracked fails
here, and a new one stays untracked only once somebody names it below with a reason. The line is whether the
table is a log or a decision."""

import pytest
from django.apps import apps


# The ledger tables are the history already: tracking one would copy every row, and because a notice is
# written by a trigger, make one trigger cascade into another.
NOT_TRACKED = {
    "notifications.Notice": "the log itself, written by a trigger - tracking it is the cascade",
    "notifications.Delivery": "the log of one send, already protected against update and delete",
    "notifications.DeliveryAttempt": "the log of one try; it is what a history of a delivery would be",
    "notifications.FanOutShard": "queue bookkeeping, claimed and finished and then of no interest",
    "notifications.EmailDelivery": "what one delivery carried, written once beside it",
    "notifications.WebhookDelivery": "what one delivery carried, written once beside it",
    "notifications.InboxDelivery": "what one delivery carried, written once beside it",
    "notifications.PushDelivery": "what one delivery carried, written once beside it",
    "notifications.Device": "last_seen_at moves on every app start, so an event per row would be noise",
}

TRACKED = {
    "notifications.Endpoint",
    "notifications.EndpointKind",
    "notifications.InboxItem",
    "notifications.NoticeKindPolicy",
    "notifications.Subscription",
}


def _models():
    return [model for model in apps.get_app_config("notifications").get_models() if not hasattr(model, "pgh_obj")]


def test_every_model_here_is_tracked_or_says_why_not():
    labels = {model._meta.label for model in _models() if not hasattr(model, "pgh_event_model")}

    assert labels - set(NOT_TRACKED) == set()


def test_the_ones_that_record_a_decision_are_tracked():
    assert {model._meta.label for model in _models() if hasattr(model, "pgh_event_model")} == TRACKED


@pytest.mark.parametrize("label", sorted(NOT_TRACKED))
def test_nothing_quietly_started_tracking_a_log_table(label):
    assert not hasattr(apps.get_model(label), "pgh_event_model")


def test_an_inbox_event_leaves_the_notices_actor_to_the_history_context():
    """Every event's actor_id is who wrote the row, read from the history context; a copied column of the
    same name would mean the notice's actor instead. Notice keeps that one."""
    event = apps.get_model("notifications", "InboxItem").pgh_event_model

    assert "actor_id" not in {field.name for field in event._meta.get_fields()}
    assert "subject_id" in {field.name for field in event._meta.get_fields()}
