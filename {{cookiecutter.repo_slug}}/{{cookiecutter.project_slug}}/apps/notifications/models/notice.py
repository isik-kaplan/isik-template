from django.db.models import Func
from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import bases

from apps.common.models.base import primary_key


class Notice(bases.AbstractNotice):
    # Its trigger inserts in SQL, where no Python default runs.
    id = primary_key(db_default=Func(function="uuidv7"))

    class Meta(bases.AbstractNotice.Meta):
        db_table = "notifications_notice"
        verbose_name = _("notice")
        verbose_name_plural = _("notices")
