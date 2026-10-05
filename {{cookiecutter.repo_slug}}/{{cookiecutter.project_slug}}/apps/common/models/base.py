import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import BaseModel as _BaseModel


class BaseModel(_BaseModel):
    # uuid7, not isik's own uuid4 default - time-sortable, better index locality on the primary key.
    id = models.UUIDField(
        primary_key=True,
        db_index=True,
        editable=False,
        default=uuid.uuid7,
        verbose_name=_("ID"),
        help_text="Identifies this record. A UUIDv7, so ids sort roughly by when they were created.",
        db_comment="Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.",
    )

    class Meta:
        abstract = True
