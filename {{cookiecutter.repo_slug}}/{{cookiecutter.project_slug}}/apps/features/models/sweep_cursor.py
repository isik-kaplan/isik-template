from django.utils.translation import gettext_lazy as _
from isik.django.apps.features import bases


class SweepCursor(bases.AbstractSweepCursor):
    class Meta(bases.AbstractSweepCursor.Meta):
        db_table = "features_sweep_cursor"
        verbose_name = _("sweep cursor")
        verbose_name_plural = _("sweep cursors")
