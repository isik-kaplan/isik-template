"""isik's `track_events`, plus the index pghistory's own event tables leave out."""

from django.db import models
from isik.django.apps.common.db import track_events as _track_events


NOT_GIVEN = object()


def object_stream_index():
    """The index pghistory's aggregate needs and does not declare.

    It finds each row's predecessor with `pgh_obj_id = X AND pgh_id < N`, once per row of the whole
    stream, so on pghistory's own single-column index one page of history costs the square of it.
    """
    return models.Index(fields=["pgh_obj", "-pgh_id"])


def track_events(**kwargs):
    """isik's `track_events`, with the event table indexed by the stream each row belongs to."""

    def track(cls):
        options = dict(kwargs)
        # `obj_field=None` asks pghistory for an event table with no `pgh_obj`, so there is no stream.
        if options.get("obj_field", NOT_GIVEN) is not None:
            meta = options.get("meta", {})
            options["meta"] = {**meta, "indexes": [*meta.get("indexes", []), object_stream_index()]}
        return _track_events(**options)(cls)

    return track
