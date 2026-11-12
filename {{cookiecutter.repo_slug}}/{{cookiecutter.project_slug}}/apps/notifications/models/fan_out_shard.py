from django.utils.translation import gettext_lazy as _
from isik.django.apps.notifications import bases

from apps.common.models.base import primary_key


class FanOutShard(bases.AbstractFanOutShard):
    id = primary_key()

    class Meta(bases.AbstractFanOutShard.Meta):
        db_table = "notifications_fan_out_shard"
        verbose_name = _("fan-out shard")
        verbose_name_plural = _("fan-out shards")
