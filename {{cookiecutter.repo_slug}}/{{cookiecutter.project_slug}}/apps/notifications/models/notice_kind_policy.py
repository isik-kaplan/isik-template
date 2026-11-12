from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events
from isik.django.apps.notifications import bases


# Its history says when a kind was retired.
@track_events()
class NoticeKindPolicy(bases.AbstractNoticeKindPolicy):
    class Meta(bases.AbstractNoticeKindPolicy.Meta):
        db_table = "notifications_notice_kind_policy"
        verbose_name = _("notice kind policy")
        verbose_name_plural = _("notice kind policies")
