from django.db import models
from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import BaseModel as _BaseModel
from isik.django.apps.common.db.models import new_primary_key


def primary_key(**kwargs):
    """The key every table here has: a UUIDv7, which ISIK_PRIMARY_KEY makes and isik's describes as random."""
    return models.UUIDField(
        **kwargs,
        primary_key=True,
        db_index=True,
        editable=False,
        default=new_primary_key,
        verbose_name=_("ID"),
        help_text="Identifies this record. A UUIDv7, so ids sort roughly by when they were created.",
        db_comment="Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.",
    )


class BaseModel(_BaseModel):
    id = primary_key()

    class Meta:
        abstract = True
