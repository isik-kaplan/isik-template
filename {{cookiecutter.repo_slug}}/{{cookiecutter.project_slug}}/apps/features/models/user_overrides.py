from isik.django.apps.common.db.history import track_events
from isik.django.apps.features import bases


@track_events()
class UserOverrides(bases.AbstractOverrides):
    """A person's settings: their own values, and what staff forced over them. Its history says who forced what,
    when and why."""

    class Meta(bases.AbstractOverrides.Meta):
        db_table = "features_user_overrides"
